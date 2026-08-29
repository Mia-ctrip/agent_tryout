from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, cast

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.domain.region_catalog import REGION_IDS, RegionId
from app.models.ai_call_log import AICallLog
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.schemas.region_observation import RegionObservationFacts, validate_region_display
from app.services.ai_gateway import (
    FatalRequestError,
    Message,
    ProviderCallRecord,
    UnifiedRequest,
    get_gateway,
    new_trace_id,
    sanitize_messages_for_log,
)
from app.services.ai_gateway.parsing import ParseResult, parse_llm_json
from app.services.full_face_analysis_service import _schema_errors
from app.services.region_observation_prompt import (
    REGION_OBSERVATION_PROMPT_VERSION,
    REGION_OBSERVATION_RETRY_PROMPT,
    REGION_OBSERVATION_SCHEMA_VERSION,
    build_region_system_prompt,
    build_region_user_prompt,
    region_mock_facts,
)
from app.services.region_sanitizer import sanitize_region_facts
from app.services.storage_service import get_storage
from app.services.vision.image_prep import prepare_for_llm


@dataclass(frozen=True)
class RegionAnalysisOutcome:
    success: bool
    prompt_version: str = REGION_OBSERVATION_PROMPT_VERSION
    schema_version: str = REGION_OBSERVATION_SCHEMA_VERSION
    trace_id: str | None = None
    facts: dict[str, Any] | None = None
    provider: str | None = None
    model: str | None = None
    failure_code: str | None = None


def _retry_request(
    request: UnifiedRequest,
    binding: tuple[str, str],
    retries: dict[tuple[str, str], int],
    skipped: set[tuple[str, str]],
) -> UnifiedRequest | None:
    if retries.get(binding, 0) > 0:
        skipped.add(binding)
        return None
    retries[binding] = 1
    return replace(
        request,
        messages=[
            *request.messages,
            Message(role="user", content=REGION_OBSERVATION_RETRY_PROMPT),
        ],
    )


def _persist_attempts(
    db: Session,
    *,
    user_id: int,
    trace_id: str,
    input_meta: dict[str, Any],
    request_payload_by_seq: dict[int, dict[str, Any]],
    records: list[ProviderCallRecord],
    parse_by_seq: dict[int, ParseResult],
    schema_errors_by_seq: dict[int, list[dict[str, Any]]],
    warnings_by_seq: dict[int, dict[str, Any]],
) -> None:
    logs: list[AICallLog] = []
    for record in records:
        parsed = parse_by_seq.get(record.attempt_seq)
        log = AICallLog(
            user_id=user_id,
            kind="region_observation",
            status="success" if record.status == "ok" else record.status,
            trace_id=trace_id,
            attempt_seq=record.attempt_seq,
            provider=record.provider or None,
            model=record.model or None,
            input_meta=input_meta,
            request_payload=request_payload_by_seq.get(record.attempt_seq),
            raw_response=(
                {"text": record.response_text, "raw": record.raw_response}
                if record.response_text is not None
                else None
            ),
            reasoning_text=parsed.reasoning if parsed else None,
            parse_strategy=parsed.strategy if parsed else None,
            schema_errors=schema_errors_by_seq.get(record.attempt_seq),
            validation_warnings=warnings_by_seq.get(record.attempt_seq),
            error_message=record.error_message or record.skip_reason,
            input_tokens=record.input_tokens,
            output_tokens=record.output_tokens,
            latency_ms=record.latency_ms,
        )
        db.add(log)
        logs.append(log)
    db.commit()
    for log in logs:
        db.refresh(log)


async def analyze_region_photo(
    db: Session,
    *,
    target: ObservationTarget,
    record: ObservationRecord,
    photo: Photo,
) -> RegionAnalysisOutcome:
    if target.scope_type != "region" or target.region_id not in REGION_IDS:
        return RegionAnalysisOutcome(success=False, failure_code="invalid_region")
    region_id = cast(RegionId, target.region_id)
    trace_id = new_trace_id()
    prepared = prepare_for_llm(get_storage().get(photo.storage_key))
    request = UnifiedRequest(
        messages=[
            Message(role="system", content=build_region_system_prompt(region_id)),
            Message(
                role="user",
                content=build_region_user_prompt(region_id),
                image_urls=[prepared.data_url],
            ),
        ],
        temperature=0.1,
        max_tokens=1024,
        response_format="json",
        user_id=str(record.user_id),
        request_id=trace_id,
        extra={"mock_json": region_mock_facts(region_id)},
    )
    input_meta = {
        "observation_id": record.id,
        "target_id": target.id,
        "photo_id": photo.id,
        "storage_key": photo.storage_key,
        "region_id": region_id,
        "prompt_version": REGION_OBSERVATION_PROMPT_VERSION,
        "schema_version": REGION_OBSERVATION_SCHEMA_VERSION,
        "original_size": [prepared.original_width, prepared.original_height],
        "resized_size": [prepared.width, prepared.height],
        "encoded_bytes": prepared.encoded_bytes,
    }
    gateway = get_gateway()
    records: list[ProviderCallRecord] = []
    parse_by_seq: dict[int, ParseResult] = {}
    schema_errors_by_seq: dict[int, list[dict[str, Any]]] = {}
    warnings_by_seq: dict[int, dict[str, Any]] = {}
    request_payload_by_seq: dict[int, dict[str, Any]] = {}
    retries: dict[tuple[str, str], int] = {}
    skipped: set[tuple[str, str]] = set()
    active_request = request
    next_seq = 1
    final_failure = "all_providers_failed"

    for _ in range(8):
        try:
            result = await gateway.invoke_detailed(
                "vision_analyze",
                active_request,
                trace_id=trace_id,
                start_attempt_seq=next_seq,
                skip_bindings=skipped,
            )
        except FatalRequestError as exc:
            records.append(
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
        payload = {
            "temperature": active_request.temperature,
            "max_tokens": active_request.max_tokens,
            "response_format": active_request.response_format,
            "messages": sanitize_messages_for_log(active_request.messages),
        }
        for gateway_record in result.records:
            request_payload_by_seq[gateway_record.attempt_seq] = payload
        records.extend(result.records)
        next_seq += len(result.records)
        if result.response is None:
            break
        successful = result.records[-1]
        parsed = parse_llm_json(successful.response_text or result.response.text)
        parse_by_seq[successful.attempt_seq] = parsed
        if not parsed.ok:
            successful.status = "parse_failed"
            successful.error_message = "response is not valid JSON"
            final_failure = "invalid_json"
        else:
            try:
                facts = RegionObservationFacts.model_validate(parsed.parsed)
            except ValidationError as exc:
                successful.status = "schema_failed"
                successful.error_message = "response does not match region schema"
                schema_errors_by_seq[successful.attempt_seq] = _schema_errors(exc)
                final_failure = "invalid_schema"
            else:
                try:
                    validate_region_display(facts, region_id)
                except ValueError as exc:
                    binding = (successful.provider, successful.model)
                    retry = _retry_request(request, binding, retries, skipped)
                    if retry is not None:
                        successful.status = "unsafe_output"
                        successful.error_message = str(exc)[:2000]
                        final_failure = "unsafe_output"
                        active_request = retry
                        continue
                    sanitized = sanitize_region_facts(facts, region_id)
                    if sanitized.facts is None:
                        successful.status = "unsafe_output"
                        successful.error_message = str(exc)[:2000]
                        final_failure = "outside_selected_region"
                    else:
                        facts = sanitized.facts
                        validate_region_display(facts, region_id)
                        warnings_by_seq[successful.attempt_seq] = {
                            "sanitized": sanitized.changed,
                            "warnings": sanitized.warnings,
                        }
                        _persist_attempts(
                            db,
                            user_id=record.user_id,
                            trace_id=trace_id,
                            input_meta=input_meta,
                            request_payload_by_seq=request_payload_by_seq,
                            records=records,
                            parse_by_seq=parse_by_seq,
                            schema_errors_by_seq=schema_errors_by_seq,
                            warnings_by_seq=warnings_by_seq,
                        )
                        return RegionAnalysisOutcome(
                            success=True,
                            trace_id=trace_id,
                            facts=facts.model_dump(),
                            provider=result.response.provider,
                            model=result.response.model,
                        )
                else:
                    _persist_attempts(
                        db,
                        user_id=record.user_id,
                        trace_id=trace_id,
                        input_meta=input_meta,
                        request_payload_by_seq=request_payload_by_seq,
                        records=records,
                        parse_by_seq=parse_by_seq,
                        schema_errors_by_seq=schema_errors_by_seq,
                        warnings_by_seq=warnings_by_seq,
                    )
                    return RegionAnalysisOutcome(
                        success=True,
                        trace_id=trace_id,
                        facts=facts.model_dump(),
                        provider=result.response.provider,
                        model=result.response.model,
                    )
        binding = (successful.provider, successful.model)
        retry = _retry_request(request, binding, retries, skipped)
        if retry is not None:
            active_request = retry

    _persist_attempts(
        db,
        user_id=record.user_id,
        trace_id=trace_id,
        input_meta=input_meta,
        request_payload_by_seq=request_payload_by_seq,
        records=records,
        parse_by_seq=parse_by_seq,
        schema_errors_by_seq=schema_errors_by_seq,
        warnings_by_seq=warnings_by_seq,
    )
    return RegionAnalysisOutcome(
        success=False,
        trace_id=trace_id,
        failure_code=final_failure,
    )
