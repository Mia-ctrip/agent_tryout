from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ai_call_log import AICallLog
from app.services.ai_gateway import (
    AllProvidersFailedError,
    FatalRequestError,
    Message,
    UnifiedRequest,
    get_gateway,
)
from app.services.ai_gateway import rate_limit as rl


router = APIRouter(prefix="/ai", tags=["ai-debug"])


class DebugMessage(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str
    image_urls: list[str] = Field(default_factory=list)


class DebugInvokeRequest(BaseModel):
    task: Literal["vision_analyze", "chat_qa"]
    messages: list[DebugMessage]
    response_format: Literal["text", "json"] = "text"
    temperature: float | None = None
    max_tokens: int | None = None


class DebugInvokeResponse(BaseModel):
    text: str
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


@router.post("/debug/invoke", response_model=DebugInvokeResponse)
async def debug_invoke(body: DebugInvokeRequest) -> DebugInvokeResponse:
    """Dev-only endpoint to sanity-check the AI gateway routing."""
    gw = get_gateway()
    req = UnifiedRequest(
        messages=[
            Message(role=m.role, content=m.content, image_urls=m.image_urls)
            for m in body.messages
        ],
        temperature=body.temperature,
        max_tokens=body.max_tokens,
        response_format=body.response_format,
    )
    try:
        resp = await gw.invoke(body.task, req)
    except FatalRequestError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except AllProvidersFailedError as e:
        raise HTTPException(
            status_code=502,
            detail={"message": str(e), "attempts": [str(a) for a in e.attempts]},
        ) from e

    return DebugInvokeResponse(
        text=resp.text,
        provider=resp.provider,
        model=resp.model,
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        latency_ms=resp.latency_ms,
    )


class QuotaOut(BaseModel):
    kind: Literal["analyze", "chat"]
    used: int
    limit: int
    remaining: int
    allowed: bool
    usage_date: str


@router.get("/debug/quota", response_model=list[QuotaOut])
def debug_quota(db: Session = Depends(get_db)) -> list[QuotaOut]:
    """Dev-only：查看当前 seed user (id=1) 当天的配额消耗。"""
    user_id = 1
    out: list[QuotaOut] = []
    for kind in ("analyze", "chat"):
        r = rl.peek(db, user_id=user_id, kind=kind)  # type: ignore[arg-type]
        out.append(
            QuotaOut(
                kind=r.kind,
                used=r.used,
                limit=r.limit,
                remaining=r.remaining,
                allowed=r.allowed,
                usage_date=r.usage_date.isoformat(),
            )
        )
    return out


@router.post("/debug/quota/{kind}/consume", response_model=QuotaOut)
def debug_quota_consume(
    kind: Literal["analyze", "chat"],
    db: Session = Depends(get_db),
) -> QuotaOut:
    """Dev-only：手动占用 1 次配额，用于测试限流。"""
    user_id = 1
    try:
        r = rl.require(db, user_id=user_id, kind=kind)
    except rl.QuotaExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "quota exceeded",
                "kind": e.result.kind,
                "used": e.result.used,
                "limit": e.result.limit,
            },
        ) from e
    return QuotaOut(
        kind=r.kind,
        used=r.used,
        limit=r.limit,
        remaining=r.remaining,
        allowed=r.allowed,
        usage_date=r.usage_date.isoformat(),
    )


# ============================================================
# AI call log inspection — 排障核心工具
# ============================================================


class LogRowOut(BaseModel):
    id: int
    trace_id: Optional[str] = None
    attempt_seq: int
    kind: str
    status: str
    provider: Optional[str] = None
    model: Optional[str] = None
    input_tokens: int
    output_tokens: int
    latency_ms: int
    parse_strategy: Optional[str] = None
    has_reasoning: bool = False
    compliance_hit_count: int = 0
    schema_error_count: int = 0
    validation_warning_count: int = 0
    needs_doctor_adjusted: bool = False
    error_message: Optional[str] = None
    created_at: datetime
    text_preview: Optional[str] = None  # response text 前 N 字符（preview_len 控制）


class LogDetailOut(BaseModel):
    id: int
    trace_id: Optional[str] = None
    attempt_seq: int
    user_id: int
    kind: str
    status: str
    provider: Optional[str] = None
    model: Optional[str] = None
    input_meta: dict[str, Any]
    request_payload: Optional[dict[str, Any]] = None
    raw_response: Optional[dict[str, Any]] = None
    reasoning_text: Optional[str] = None
    parse_strategy: Optional[str] = None
    schema_errors: Optional[list[dict[str, Any]]] = None
    compliance_flags: Optional[list[dict[str, Any]]] = None
    validation_warnings: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    input_tokens: int
    output_tokens: int
    latency_ms: int
    created_at: datetime


def _log_to_row(log: AICallLog, preview_len: int = 200) -> LogRowOut:
    text = None
    if log.raw_response and isinstance(log.raw_response, dict):
        t = log.raw_response.get("text")
        if isinstance(t, str):
            text = t[:preview_len] if preview_len > 0 else t
    vw = log.validation_warnings or {}
    return LogRowOut(
        id=log.id,
        trace_id=log.trace_id,
        attempt_seq=log.attempt_seq,
        kind=log.kind,
        status=log.status,
        provider=log.provider,
        model=log.model,
        input_tokens=log.input_tokens,
        output_tokens=log.output_tokens,
        latency_ms=log.latency_ms,
        parse_strategy=log.parse_strategy,
        has_reasoning=bool(log.reasoning_text),
        compliance_hit_count=len(log.compliance_flags or []),
        schema_error_count=len(log.schema_errors or []),
        validation_warning_count=len(vw.get("warnings", []) if isinstance(vw, dict) else []),
        needs_doctor_adjusted=bool(
            isinstance(vw, dict) and vw.get("needs_doctor_adjusted", False)
        ),
        error_message=log.error_message,
        created_at=log.created_at,
        text_preview=text,
    )


def _log_to_detail(log: AICallLog) -> LogDetailOut:
    return LogDetailOut(
        id=log.id,
        trace_id=log.trace_id,
        attempt_seq=log.attempt_seq,
        user_id=log.user_id,
        kind=log.kind,
        status=log.status,
        provider=log.provider,
        model=log.model,
        input_meta=log.input_meta or {},
        request_payload=log.request_payload,
        raw_response=log.raw_response,
        reasoning_text=log.reasoning_text,
        parse_strategy=log.parse_strategy,
        schema_errors=log.schema_errors,
        compliance_flags=log.compliance_flags,
        validation_warnings=log.validation_warnings,
        error_message=log.error_message,
        input_tokens=log.input_tokens,
        output_tokens=log.output_tokens,
        latency_ms=log.latency_ms,
        created_at=log.created_at,
    )


@router.get("/debug/logs", response_model=list[LogRowOut])
def list_logs(
    limit: int = Query(default=20, ge=1, le=200),
    kind: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    provider: Optional[str] = Query(default=None),
    preview_len: int = Query(default=200, ge=0, le=5000),
    db: Session = Depends(get_db),
) -> list[LogRowOut]:
    """列最近 N 条 AI 调用日志，可按 kind/status/provider 筛。preview_len 控制预览长度（0=全文）。"""
    q = db.query(AICallLog).filter(AICallLog.deleted_at.is_(None))
    if kind:
        q = q.filter(AICallLog.kind == kind)
    if status_filter:
        q = q.filter(AICallLog.status == status_filter)
    if provider:
        q = q.filter(AICallLog.provider == provider)
    rows = q.order_by(AICallLog.id.desc()).limit(limit).all()
    return [_log_to_row(log, preview_len=preview_len) for log in rows]


@router.get("/debug/logs/{log_id}", response_model=LogDetailOut)
def get_log(log_id: int, db: Session = Depends(get_db)) -> LogDetailOut:
    """完整详情：input_meta / request_payload / raw_response / reasoning_text 全部返回。"""
    log = db.get(AICallLog, log_id)
    if log is None or log.deleted_at is not None:
        raise HTTPException(status_code=404, detail="log not found")
    return _log_to_detail(log)


@router.get("/debug/logs/{log_id}/raw-text", response_class=JSONResponse)
def get_log_raw_text(log_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """LLM 原文（response text + reasoning）。大文本，独立端点方便复制。"""
    log = db.get(AICallLog, log_id)
    if log is None or log.deleted_at is not None:
        raise HTTPException(status_code=404, detail="log not found")
    text = None
    if log.raw_response and isinstance(log.raw_response, dict):
        text = log.raw_response.get("text")
    return {
        "log_id": log.id,
        "provider": log.provider,
        "model": log.model,
        "status": log.status,
        "parse_strategy": log.parse_strategy,
        "reasoning_text": log.reasoning_text,
        "text": text,
        "text_length": len(text) if isinstance(text, str) else 0,
    }


@router.get("/debug/traces/{trace_id}", response_model=list[LogRowOut])
def get_trace(
    trace_id: str,
    preview_len: int = Query(default=200, ge=0, le=5000),
    db: Session = Depends(get_db),
) -> list[LogRowOut]:
    """按 trace_id 聚合：一次业务请求的所有 provider 调用。"""
    rows = (
        db.query(AICallLog)
        .filter(AICallLog.trace_id == trace_id, AICallLog.deleted_at.is_(None))
        .order_by(AICallLog.attempt_seq.asc(), AICallLog.id.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="trace not found")
    return [_log_to_row(log, preview_len=preview_len) for log in rows]
