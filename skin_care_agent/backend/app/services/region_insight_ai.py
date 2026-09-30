"""Gateway call loop shared by region comparison and stage trend.

One request, one validation pass, at most one retry with the prompt's RETRY section,
then publish or fail. Every provider attempt is written to ``ai_call_logs``.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Callable, Final, TypeVar

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.models.ai_call_log import AICallLog
from app.services.ai_gateway import (
    FatalRequestError,
    Message,
    ProviderCallRecord,
    UnifiedRequest,
    get_gateway,
    sanitize_messages_for_log,
)
from app.services.ai_gateway.parsing import parse_llm_json
from app.services.full_face_analysis_service import _schema_errors


ResultT = TypeVar("ResultT", bound=BaseModel)

_MAX_ATTEMPTS: Final = 2


@dataclass(frozen=True)
class InsightAIOutcome:
    result: BaseModel | None
    provider: str | None = None
    model: str | None = None
    failure_code: str | None = None


def _failure_code(exc: ValueError) -> str:
    return str(exc).split(":", 1)[0][:48] or "invalid_output"


async def run_insight_request(
    db: Session,
    *,
    user_id: int,
    kind: str,
    trace_id: str,
    request: UnifiedRequest,
    retry_prompt: str,
    schema: type[ResultT],
    validate: Callable[[ResultT], ResultT],
    input_meta: dict[str, Any],
) -> InsightAIOutcome:
    gateway = get_gateway()
    logs: list[AICallLog] = []
    active = request
    next_seq = 1
    failure = "all_providers_failed"

    def log(record: ProviderCallRecord, **extra: Any) -> None:
        logs.append(
            AICallLog(
                user_id=user_id,
                kind=kind,
                status="success" if record.status == "ok" else record.status,
                trace_id=trace_id,
                attempt_seq=record.attempt_seq,
                provider=record.provider or None,
                model=record.model or None,
                input_meta=input_meta,
                request_payload={
                    "temperature": active.temperature,
                    "max_tokens": active.max_tokens,
                    "response_format": active.response_format,
                    "messages": sanitize_messages_for_log(active.messages),
                },
                raw_response=(
                    {"text": record.response_text, "raw": record.raw_response}
                    if record.response_text is not None
                    else None
                ),
                error_message=record.error_message or record.skip_reason,
                input_tokens=record.input_tokens,
                output_tokens=record.output_tokens,
                latency_ms=record.latency_ms,
                **extra,
            )
        )

    outcome = InsightAIOutcome(result=None, failure_code=failure)
    for _ in range(_MAX_ATTEMPTS):
        try:
            invoked = await gateway.invoke_detailed(
                "vision_analyze", active, trace_id=trace_id, start_attempt_seq=next_seq
            )
        except FatalRequestError as exc:
            log(
                ProviderCallRecord(
                    trace_id=trace_id,
                    attempt_seq=next_seq,
                    provider="",
                    model="",
                    status="fatal",
                    error_message=str(exc)[:2000],
                )
            )
            break
        next_seq += len(invoked.records)
        for record in invoked.records[:-1]:
            log(record)
        if invoked.response is None:
            for record in invoked.records[-1:]:
                log(record)
            break

        last = invoked.records[-1]
        parsed = parse_llm_json(last.response_text or invoked.response.text)
        extra: dict[str, Any] = {"parse_strategy": parsed.strategy, "reasoning_text": parsed.reasoning}
        if not parsed.ok:
            last.status, last.error_message = "parse_failed", "response is not valid JSON"
            failure = "invalid_json"
        else:
            try:
                result = validate(schema.model_validate(parsed.parsed))
            except ValidationError as exc:
                last.status, last.error_message = "schema_failed", "response does not match schema"
                extra["schema_errors"] = _schema_errors(exc)
                failure = "invalid_schema"
            except ValueError as exc:
                last.status, last.error_message = "unsafe_output", str(exc)[:2000]
                failure = _failure_code(exc)
            else:
                log(last, **extra)
                outcome = InsightAIOutcome(
                    result=result,
                    provider=invoked.response.provider,
                    model=invoked.response.model,
                )
                break
        log(last, **extra)
        outcome = InsightAIOutcome(result=None, failure_code=failure)
        active = replace(
            request,
            messages=[*request.messages, Message(role="user", content=retry_prompt)],
        )

    db.add_all(logs)
    db.commit()
    return outcome
