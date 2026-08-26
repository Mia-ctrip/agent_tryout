from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.services.full_face_analysis_service import (
    FullFaceAnalysisOutcome,
    analyze_full_face_photo,
)
from app.services.full_face_prompt import (
    FULL_FACE_OBSERVATION_PROMPT_VERSION,
    FULL_FACE_OBSERVATION_SCHEMA_VERSION,
)
from app.services.region_analysis_service import analyze_region_photo
from app.services.region_observation_prompt import (
    REGION_OBSERVATION_PROMPT_VERSION,
    REGION_OBSERVATION_SCHEMA_VERSION,
)
from app.services.region_event_service import activate_valid_target_event


@dataclass(frozen=True)
class ObservationAnalysisOutcome:
    success: bool
    prompt_version: str
    schema_version: str
    trace_id: str | None = None
    facts: dict[str, Any] | None = None
    provider: str | None = None
    model: str | None = None
    failure_code: str | None = None


AnalysisCallable = Callable[..., Awaitable[Any]]


async def run_observation_target(
    target_id: int,
    session_factory: Callable[[], Session] = SessionLocal,
    analyze: AnalysisCallable | None = None,
) -> bool:
    with session_factory() as db:
        started_at = datetime.now(tz=timezone.utc)
        claimed_id = db.execute(
            update(ObservationTarget)
            .where(
                ObservationTarget.id == target_id,
                ObservationTarget.status == "queued",
            )
            .values(status="processing", processing_started_at=started_at)
            .returning(ObservationTarget.id)
        ).scalar_one_or_none()
        if claimed_id is None:
            db.rollback()
            return False
        db.commit()

        target = db.get(ObservationTarget, target_id)
        record = db.get(ObservationRecord, target.record_id) if target is not None else None
        photo = db.get(Photo, record.photo_id) if record is not None and record.photo_id else None
        try:
            if target is None or record is None or photo is None:
                outcome: Any = FullFaceAnalysisOutcome(
                    success=False,
                    failure_code="all_providers_failed",
                )
            else:
                analyzer = analyze
                if analyzer is None:
                    analyzer = (
                        analyze_region_photo
                        if target.scope_type == "region"
                        else analyze_full_face_photo
                    )
                outcome = await analyzer(db=db, target=target, record=record, photo=photo)
        except Exception:
            db.rollback()
            target = db.get(ObservationTarget, target_id)
            if target is None:
                return False
            outcome = FullFaceAnalysisOutcome(
                success=False,
                failure_code="all_providers_failed",
            )

        completed_at = datetime.now(tz=timezone.utc)
        target.trace_id = outcome.trace_id
        default_prompt_version = (
            REGION_OBSERVATION_PROMPT_VERSION
            if target.scope_type == "region"
            else FULL_FACE_OBSERVATION_PROMPT_VERSION
        )
        default_schema_version = (
            REGION_OBSERVATION_SCHEMA_VERSION
            if target.scope_type == "region"
            else FULL_FACE_OBSERVATION_SCHEMA_VERSION
        )
        target.prompt_version = getattr(outcome, "prompt_version", default_prompt_version)
        target.schema_version = getattr(outcome, "schema_version", default_schema_version)
        target.completed_at = completed_at
        if outcome.success:
            target.status = "completed"
            target.result_source = "photo_analysis"
            target.facts = outcome.facts
            target.provider = outcome.provider
            target.model = outcome.model
            target.failure_code = None
        else:
            target.status = "needs_input"
            target.result_source = None
            target.facts = None
            target.provider = None
            target.model = None
            target.failure_code = outcome.failure_code or "all_providers_failed"
        db.commit()
        if outcome.success:
            activate_valid_target_event(db, target.id)
        return True
