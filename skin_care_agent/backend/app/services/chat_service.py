"""Chat 业务层。

流程：
1. 医疗紧急词检测 → 命中直接返回预设回复（Q5=B，不调 LLM）
2. 拉可选 analysis 上下文（Q1=B，前端传 analysis_id）
3. 组装 messages（system + optional context + history + user）
4. 走 gateway `chat_qa` 任务
5. Chat 出参精确删句合规（Q3=C）
6. 落 ai_call_logs（每次 provider）+ chat_messages（成功那条）
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.ai_call_log import AICallLog
from app.models.analysis import Analysis
from app.models.chat_message import ChatMessage
from app.services.ai_gateway import (
    FatalRequestError,
    GatewayInvokeResult,
    Message,
    ProviderCallRecord,
    UnifiedRequest,
    get_gateway,
    new_trace_id,
    sanitize_messages_for_log,
    set_current_trace_id,
    trace_log,
)
from app.services.ai_gateway.compliance import (
    MEDICAL_INTERVENTION_MESSAGE,
    apply_compliance_to_chat_text,
    detect_medical_emergency,
)
from app.services.ai_gateway.prompts import (
    CHAT_QA_PROMPT_VERSION,
    CHAT_QA_SYSTEM_PROMPT,
    build_chat_context_message,
)


logger = logging.getLogger(__name__)


class ChatFailed(Exception):
    def __init__(self, status: str, message: str, log_id: Optional[int] = None, trace_id: Optional[str] = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.log_id = log_id
        self.trace_id = trace_id


@dataclass
class ChatResult:
    chat: ChatMessage
    call_log: Optional[AICallLog]
    trace_id: str
    medical_intervention: bool


async def send_chat(
    db: Session,
    *,
    user_id: int,
    user_message: str,
    analysis_id: Optional[int] = None,
    history: Optional[list[dict[str, str]]] = None,
) -> ChatResult:
    trace_id = new_trace_id()
    set_current_trace_id(trace_id)
    trace_log.info("chat.start", user_id=user_id, analysis_id=analysis_id, msg_len=len(user_message))

    # Q5=B：医疗紧急词兜底，命中直接回复不调 LLM
    emergency_hits = detect_medical_emergency(user_message)
    if emergency_hits:
        trace_log.warning("chat.medical_intervention", hits=emergency_hits)
        chat = ChatMessage(
            user_id=user_id,
            ai_call_log_id=None,
            analysis_id=analysis_id,
            user_message=user_message,
            assistant_message=MEDICAL_INTERVENTION_MESSAGE,
            provider="server",
            model="medical-intervention-v1",
            medical_intervention=True,
            context_meta={"emergency_hits": emergency_hits},
            compliance_flags=None,
            input_tokens=0,
            output_tokens=0,
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
        return ChatResult(chat=chat, call_log=None, trace_id=trace_id, medical_intervention=True)

    # Q1=B：前端传 analysis_id，后端拉数据组装 context
    analysis_context: Optional[str] = None
    if analysis_id is not None:
        a = db.get(Analysis, analysis_id)
        if a is not None and a.deleted_at is None and a.user_id == user_id:
            summary = {
                "observation": (a.parsed_result or {}).get("observation"),
                "overall_severity": a.overall_severity,
                "skin_health_index": a.skin_health_index,
                "needs_doctor": a.needs_doctor,
                "acne_patches": (a.parsed_result or {}).get("acne_patches"),
            }
            analysis_context = build_chat_context_message(summary)

    # 组装 messages：system + optional context + history + user
    messages: list[Message] = [Message(role="system", content=CHAT_QA_SYSTEM_PROMPT)]
    if analysis_context:
        messages.append(Message(role="system", content=analysis_context))
    for h in history or []:
        role = h.get("role", "user")
        content = h.get("content", "")
        if content:
            messages.append(Message(role=role, content=content))
    messages.append(Message(role="user", content=user_message))

    input_meta: dict[str, Any] = {
        "prompt_version": CHAT_QA_PROMPT_VERSION,
        "analysis_id": analysis_id,
        "has_context": analysis_context is not None,
        "history_len": len(history or []),
        "user_msg_len": len(user_message),
    }
    req = UnifiedRequest(
        messages=messages,
        temperature=0.7,
        max_tokens=800,
        response_format="text",
    )
    request_payload = {
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "response_format": req.response_format,
        "messages": sanitize_messages_for_log(req.messages),
    }

    gw = get_gateway()
    try:
        result: GatewayInvokeResult = await gw.invoke_detailed(
            "chat_qa", req, trace_id=trace_id, start_attempt_seq=1
        )
    except FatalRequestError as e:
        trace_log.error("chat.fatal", error=str(e))
        log = _persist_chat_records(
            db,
            user_id=user_id,
            trace_id=trace_id,
            input_meta=input_meta,
            request_payload=request_payload,
            records=[
                ProviderCallRecord(
                    trace_id=trace_id,
                    attempt_seq=1,
                    provider="",
                    model="",
                    status="fatal",
                    error_message=str(e)[:2000],
                )
            ],
        )
        raise ChatFailed("llm_failed", str(e), log[-1].id if log else None, trace_id) from e

    logs = _persist_chat_records(
        db,
        user_id=user_id,
        trace_id=trace_id,
        input_meta=input_meta,
        request_payload=request_payload,
        records=result.records,
    )

    if result.response is None:
        trace_log.warning("chat.all_providers_failed", records=len(result.records))
        last_log_id = logs[-1].id if logs else None
        raise ChatFailed(
            "llm_failed",
            f"all providers failed after {len(result.records)} attempts",
            last_log_id,
            trace_id,
        )

    resp = result.response
    # Q3=C：精确删句合规扫描
    cleaned_text, flags = apply_compliance_to_chat_text(resp.text)
    if flags:
        trace_log.warning("chat.compliance.dropped_sentences", count=len(flags))
    else:
        trace_log.info("chat.compliance.clean")

    success_log = next((log for log in logs if log.status == "success"), logs[-1] if logs else None)
    compliance_flags_json = [
        {
            "field": f.field,
            "hits": f.hits,
            "action": f.action,
            "original": f.original[:200],
            "replaced_with": f.replaced_with[:200],
        }
        for f in flags
    ] or None

    chat = ChatMessage(
        user_id=user_id,
        ai_call_log_id=success_log.id if success_log else None,
        analysis_id=analysis_id,
        user_message=user_message,
        assistant_message=cleaned_text,
        provider=resp.provider,
        model=resp.model,
        medical_intervention=False,
        context_meta={
            "has_analysis_context": analysis_context is not None,
            "history_len": len(history or []),
        },
        compliance_flags=compliance_flags_json,
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    trace_log.info(
        "chat.done",
        chat_id=chat.id,
        log_id=success_log.id if success_log else None,
        provider=resp.provider,
        compliance_hits=len(flags),
    )
    return ChatResult(chat=chat, call_log=success_log, trace_id=trace_id, medical_intervention=False)


def _persist_chat_records(
    db: Session,
    *,
    user_id: int,
    trace_id: str,
    input_meta: dict[str, Any],
    request_payload: dict[str, Any],
    records: list[ProviderCallRecord],
) -> list[AICallLog]:
    """把 chat 的 provider 调用记录逐条落 ai_call_logs（kind=chat_qa）。"""
    logs: list[AICallLog] = []
    for r in records:
        status = r.status if r.status != "ok" else "success"
        log = AICallLog(
            user_id=user_id,
            kind="chat_qa",
            status=status,
            trace_id=trace_id,
            attempt_seq=r.attempt_seq,
            provider=r.provider or None,
            model=r.model or None,
            input_meta=input_meta,
            request_payload=request_payload,
            raw_response=(
                {"text": r.response_text, "raw": r.raw_response}
                if r.response_text is not None
                else None
            ),
            error_message=r.error_message or r.skip_reason,
            input_tokens=r.input_tokens,
            output_tokens=r.output_tokens,
            latency_ms=r.latency_ms,
        )
        db.add(log)
        logs.append(log)
    db.commit()
    for log in logs:
        db.refresh(log)
    return logs
