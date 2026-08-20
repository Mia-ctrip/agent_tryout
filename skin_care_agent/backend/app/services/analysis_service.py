"""Analysis 业务层：负责调用 gateway、落 ai_call_logs（每次 provider 一条）、写 analyses。

关键设计：
- 一次 /analyses 请求生成一个 trace_id
- Gateway 每次真实调 provider 都返回一条 ProviderCallRecord
- Service 层把每条 record 落库到 ai_call_logs
- 如果 gateway 说 ok 但 JSON parse 失败 → 主动跳过该 provider，重新走 gateway 找下一家（B 方案）
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.ai_call_log import AICallLog
from app.models.analysis import Analysis
from app.models.photo import Photo
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
from app.services.ai_gateway.compliance import ComplianceReport, apply_compliance
from app.services.ai_gateway.parsing import ParseResult, parse_llm_json
from app.services.ai_gateway.prompts import (
    VISION_ANALYZE_PROMPT_VERSION,
    VISION_ANALYZE_SYSTEM_PROMPT,
    VISION_ANALYZE_USER_PROMPT,
)
from app.services.ai_gateway.schema import (
    SchemaValidationResult,
    VisionAnalyzeResult,
    validate_vision_analyze,
)
from app.services.ai_gateway.validators import ValidationReport, validate_and_adjust
from app.services.storage_service import get_storage
from app.services.vision.image_prep import prepare_for_llm


logger = logging.getLogger(__name__)


class AnalysisFailed(Exception):
    def __init__(
        self,
        status: str,
        message: str,
        log_id: Optional[int] = None,
        trace_id: Optional[str] = None,
    ):
        super().__init__(message)
        self.status = status
        self.message = message
        self.log_id = log_id
        self.trace_id = trace_id


@dataclass
class AnalysisSuccess:
    analysis: Analysis
    call_log: AICallLog
    trace_id: str


def get_latest_success(db: Session, photo_id: int) -> Optional[Analysis]:
    return (
        db.query(Analysis)
        .filter(Analysis.photo_id == photo_id, Analysis.deleted_at.is_(None))
        .order_by(Analysis.created_at.desc())
        .first()
    )


async def analyze_photo(
    db: Session,
    *,
    user_id: int,
    photo: Photo,
) -> AnalysisSuccess:
    trace_id = new_trace_id()
    set_current_trace_id(trace_id)

    trace_log.info("analyze.start", photo_id=photo.id, user_id=user_id)

    storage = get_storage()
    analysis_storage_key = photo.processed_storage_key or photo.storage_key
    raw = storage.get(analysis_storage_key)
    prepared = prepare_for_llm(raw)
    trace_log.info(
        "analyze.image_prep",
        original=f"{prepared.original_width}x{prepared.original_height}",
        resized=f"{prepared.width}x{prepared.height}",
        was_resized=prepared.was_resized,
        bytes=prepared.encoded_bytes,
    )

    input_meta: dict[str, Any] = {
        "photo_id": photo.id,
        "storage_key": analysis_storage_key,
        "source_storage_key": photo.storage_key,
        "used_processed_image": photo.processed_storage_key is not None,
        "prompt_version": VISION_ANALYZE_PROMPT_VERSION,
        "original_size": [prepared.original_width, prepared.original_height],
        "resized_size": [prepared.width, prepared.height],
        "was_resized": prepared.was_resized,
        "encoded_bytes": prepared.encoded_bytes,
    }

    req = UnifiedRequest(
        messages=[
            Message(role="system", content=VISION_ANALYZE_SYSTEM_PROMPT),
            Message(
                role="user",
                content=VISION_ANALYZE_USER_PROMPT,
                image_urls=[prepared.data_url],
            ),
        ],
        temperature=0.1,
        response_format="json",
    )
    request_payload = {
        "temperature": req.temperature,
        "response_format": req.response_format,
        "messages": sanitize_messages_for_log(req.messages),
    }

    gw = get_gateway()

    # B 方案：JSON parse 失败 / schema 校验失败时都 skip 该 provider 后重跑 gateway
    skip_bindings: set[tuple[str, str]] = set()
    global_seq = 1
    all_records: list[ProviderCallRecord] = []
    parsed_success: Optional[
        tuple[ProviderCallRecord, VisionAnalyzeResult, ComplianceReport, ValidationReport]
    ] = None

    max_parse_retries = 5  # 兜底防死循环

    # 用 dict 记录每次 record 的 parse / schema / compliance / validation 附属数据
    parse_results_by_seq: dict[int, ParseResult] = {}
    schema_errors_by_seq: dict[int, list[dict[str, Any]]] = {}
    compliance_by_seq: dict[int, ComplianceReport] = {}
    validation_by_seq: dict[int, ValidationReport] = {}

    for round_idx in range(max_parse_retries):
        try:
            result: GatewayInvokeResult = await gw.invoke_detailed(
                "vision_analyze",
                req,
                trace_id=trace_id,
                start_attempt_seq=global_seq,
                skip_bindings=skip_bindings,
            )
        except FatalRequestError as e:
            trace_log.error("analyze.fatal", error=str(e))
            log = _persist_records(
                db,
                user_id=user_id,
                trace_id=trace_id,
                input_meta=input_meta,
                request_payload=request_payload,
                records=[
                    ProviderCallRecord(
                        trace_id=trace_id,
                        attempt_seq=global_seq,
                        provider="",
                        model="",
                        status="fatal",
                        error_message=str(e)[:2000],
                    )
                ],
                parse_results_by_seq=parse_results_by_seq,
                schema_errors_by_seq=schema_errors_by_seq,
                compliance_by_seq=compliance_by_seq,
                validation_by_seq=validation_by_seq,
                final_status="llm_failed",
            )
            raise AnalysisFailed("llm_failed", str(e), log[-1].id if log else None, trace_id) from e

        all_records.extend(result.records)
        global_seq += len(result.records)

        if result.response is None:
            trace_log.warning("analyze.all_providers_failed", records=len(result.records))
            logs = _persist_records(
                db,
                user_id=user_id,
                trace_id=trace_id,
                input_meta=input_meta,
                request_payload=request_payload,
                records=all_records,
                parse_results_by_seq=parse_results_by_seq,
                schema_errors_by_seq=schema_errors_by_seq,
                compliance_by_seq=compliance_by_seq,
                validation_by_seq=validation_by_seq,
                final_status="llm_failed",
            )
            last_log_id = logs[-1].id if logs else None
            raise AnalysisFailed(
                "llm_failed",
                f"all providers failed after {len(all_records)} attempts",
                last_log_id,
                trace_id,
            )

        # 有 response，尝试 parse
        ok_record = result.records[-1]  # gateway 成功时最后一条一定是 ok
        pr = parse_llm_json(ok_record.response_text or "")
        parse_results_by_seq[ok_record.attempt_seq] = pr

        if not pr.ok:
            trace_log.warning(
                "analyze.parse.fail",
                provider=ok_record.provider,
                model=ok_record.model,
                has_reasoning=pr.reasoning is not None,
                text_preview=pr.stripped_text[:150],
            )
            ok_record.status = "parse_failed"
            ok_record.error_message = "LLM returned 200 but content is not valid JSON"
            skip_bindings.add((ok_record.provider, ok_record.model))
            continue

        # Parse OK → schema_guard
        sv: SchemaValidationResult = validate_vision_analyze(pr.parsed or {})
        if not sv.ok:
            schema_errors_by_seq[ok_record.attempt_seq] = sv.errors
            trace_log.warning(
                "analyze.schema.fail",
                provider=ok_record.provider,
                errors=len(sv.errors),
                first_error=sv.errors[0] if sv.errors else None,
            )
            ok_record.status = "schema_failed"
            ok_record.error_message = f"schema validation failed: {len(sv.errors)} errors"
            skip_bindings.add((ok_record.provider, ok_record.model))
            continue

        # Schema OK → compliance 扫描 + 模板兜底
        model, compliance_report = apply_compliance(sv.parsed)
        compliance_by_seq[ok_record.attempt_seq] = compliance_report
        if compliance_report.had_violations:
            trace_log.warning(
                "analyze.compliance.hit",
                provider=ok_record.provider,
                flag_count=len(compliance_report.flags),
            )
        else:
            trace_log.info("analyze.compliance.clean", provider=ok_record.provider)

        # 一致性 + needs_doctor 强判
        model, validation_report = validate_and_adjust(model)
        validation_by_seq[ok_record.attempt_seq] = validation_report
        if validation_report.needs_doctor_adjusted:
            trace_log.warning(
                "analyze.validation.needs_doctor_upgraded",
                original=validation_report.original_needs_doctor,
            )

        trace_log.info(
            "analyze.pipeline.ok",
            provider=ok_record.provider,
            strategy=pr.strategy,
            has_reasoning=pr.reasoning is not None,
            compliance_hits=len(compliance_report.flags),
            validation_warnings=len(validation_report.warnings),
        )
        parsed_success = (ok_record, model, compliance_report, validation_report)
        break

    # 循环结束
    if parsed_success is None:
        logs = _persist_records(
            db,
            user_id=user_id,
            trace_id=trace_id,
            input_meta=input_meta,
            request_payload=request_payload,
            records=all_records,
            parse_results_by_seq=parse_results_by_seq,
            schema_errors_by_seq=schema_errors_by_seq,
            compliance_by_seq=compliance_by_seq,
            validation_by_seq=validation_by_seq,
            final_status="parse_failed",
        )
        last_log_id = logs[-1].id if logs else None
        raise AnalysisFailed(
            "parse_failed",
            "no provider returned valid JSON matching schema",
            last_log_id,
            trace_id,
        )

    ok_record, final_model, compliance_report, validation_report = parsed_success
    parsed_dict = final_model.model_dump()

    logs = _persist_records(
        db,
        user_id=user_id,
        trace_id=trace_id,
        input_meta=input_meta,
        request_payload=request_payload,
        records=all_records,
        parse_results_by_seq=parse_results_by_seq,
        schema_errors_by_seq=schema_errors_by_seq,
        compliance_by_seq=compliance_by_seq,
        validation_by_seq=validation_by_seq,
        final_status="success",
    )
    success_log = next((log for log in logs if log.status == "success"), logs[-1])

    analysis = Analysis(
        user_id=user_id,
        photo_id=photo.id,
        ai_call_log_id=success_log.id,
        provider=ok_record.provider,
        model=ok_record.model,
        parsed_result=parsed_dict,
        overall_severity=final_model.overall_severity,
        skin_health_index=final_model.skin_health_index,
        needs_doctor=final_model.needs_doctor,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    db.refresh(success_log)

    # 跨日 patch lineage 追踪：tracker 失败不应让 /analyses 500
    try:
        from app.services.vision.tracker import track_patches_for_analysis

        track_result = track_patches_for_analysis(db, analysis, photo=photo)
        trace_log.info(
            "analyze.tracker.done",
            analysis_id=analysis.id,
            new_lineages=track_result.new_lineage_count,
            matched_lineages=track_result.matched_lineage_count,
            missing_observations=track_result.missing_observation_count,
            snapshots=len(track_result.snapshot_ids),
            skipped=track_result.skipped,
            skip_reason=track_result.skip_reason,
        )
    except Exception as e:  # noqa: BLE001
        db.rollback()
        trace_log.error("analyze.tracker.failed", error=str(e)[:500])
        logger.exception("patch tracker failed for analysis_id=%s", analysis.id)

    trace_log.info(
        "analyze.done",
        status="success",
        analysis_id=analysis.id,
        log_id=success_log.id,
        provider=ok_record.provider,
        needs_doctor=final_model.needs_doctor,
    )

    return AnalysisSuccess(analysis=analysis, call_log=success_log, trace_id=trace_id)


def _persist_records(
    db: Session,
    *,
    user_id: int,
    trace_id: str,
    input_meta: dict[str, Any],
    request_payload: dict[str, Any],
    records: list[ProviderCallRecord],
    parse_results_by_seq: dict[int, ParseResult],
    schema_errors_by_seq: dict[int, list[dict[str, Any]]],
    compliance_by_seq: dict[int, ComplianceReport],
    validation_by_seq: dict[int, ValidationReport],
    final_status: str,
) -> list[AICallLog]:
    """把 gateway 收集的 records 逐条落 ai_call_logs。

    record.status → ai_call_logs.status：
    - ok → success
    - parse_failed / schema_failed / retryable_exhausted / dead / skipped / fatal 原样存
    """
    logs: list[AICallLog] = []
    for r in records:
        status = r.status if r.status != "ok" else "success"
        pr = parse_results_by_seq.get(r.attempt_seq)
        schema_errors = schema_errors_by_seq.get(r.attempt_seq)
        compliance = compliance_by_seq.get(r.attempt_seq)
        validation = validation_by_seq.get(r.attempt_seq)
        log = AICallLog(
            user_id=user_id,
            kind="vision_analyze",
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
            reasoning_text=pr.reasoning if pr else None,
            parse_strategy=pr.strategy if pr else None,
            schema_errors=schema_errors,
            compliance_flags=compliance.to_json() if compliance else None,
            validation_warnings=validation.to_json() if validation else None,
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
    trace_log.info(
        "analyze.persist.done",
        rows=len(logs),
        final_status=final_status,
    )
    return logs
