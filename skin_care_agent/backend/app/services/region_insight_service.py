"""Shared persistence for region comparisons and stage trends.

Rows are keyed by input fingerprint. ``claim_insight`` returns an existing published
row, or (re)claims a row for processing and tells the caller to schedule a worker.
Workers finish through ``finish_insight`` which is guarded by the attempt number, so a
late result from a reclaimed attempt never overwrites a newer one.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Final, cast

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.region_catalog import RegionId
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.region_event import RegionEvent
from app.models.region_insight import RegionInsight
from app.schemas.region_event import InsightTimepointRef, RegionComparisonOut, RegionTrendOut
from app.services.region_insight_selection import (
    InsightKind,
    InsightTimepoint,
    stored_facts_from_target,
)
from app.services.storage_service import get_storage
from app.services.vision.image_prep import (
    PreparedRegionImage,
    prepare_region_crop_for_llm,
    region_polygon,
)


INSIGHT_STALE_PROCESSING: Final = timedelta(seconds=300)
PUBLISHED_STATUSES: Final = ("completed", "degraded")


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def load_visible_event(db: Session, *, user_id: int, event_id: int) -> RegionEvent:
    event = db.get(RegionEvent, event_id)
    if (
        event is None
        or event.user_id != user_id
        or event.deleted_at is not None
        or event.status not in ("current", "ended")
        or event.last_valid_local_date is None
    ):
        raise HTTPException(status_code=404, detail="region event not found")
    return event


def _target_is_effective(target: ObservationTarget) -> bool:
    return target.status == "completed" and (
        (target.result_source == "photo_analysis" and target.facts is not None)
        or (target.result_source == "user_record" and bool(target.user_note))
    )


def load_photo_timepoints(
    db: Session,
    *,
    user_id: int,
    event: RegionEvent,
) -> list[InsightTimepoint]:
    """Valid timepoints of one event that have a photo (spec 6.8 + 6.9)."""
    rows = db.execute(
        select(ObservationTarget, ObservationRecord, Photo)
        .join(ObservationRecord, ObservationRecord.id == ObservationTarget.record_id)
        .join(Photo, Photo.id == ObservationRecord.photo_id)
        .where(
            ObservationTarget.region_event_id == event.id,
            ObservationTarget.user_id == user_id,
            ObservationTarget.scope_type == "region",
            ObservationTarget.region_id == event.region_id,
            ObservationTarget.status == "completed",
            ObservationTarget.deleted_at.is_(None),
            ObservationRecord.user_id == user_id,
            ObservationRecord.deleted_at.is_(None),
            Photo.user_id == user_id,
            Photo.deleted_at.is_(None),
        )
        .order_by(ObservationRecord.recorded_at, ObservationTarget.id)
    ).all()
    points: list[InsightTimepoint] = []
    for target, record, photo in rows:
        if not _target_is_effective(target) or record.recorded_local_date is None:
            continue
        points.append(
            InsightTimepoint(
                target_id=target.id,
                observation_id=record.id,
                recorded_at=cast(datetime, _utc(record.recorded_at)),
                local_date=record.recorded_local_date,
                photo_id=photo.id,
                storage_key=photo.storage_key,
                has_region_geometry=region_polygon(photo.quality_meta, event.region_id) is not None,
                stored_facts=stored_facts_from_target(target),
            )
        )
    return points


@dataclass(frozen=True)
class InsightSpec:
    kind: InsightKind
    event: RegionEvent
    fingerprint: str
    referenced_target_ids: list[int]
    timepoint_map: list[dict[str, Any]]
    prompt_version: str
    schema_version: str
    input_meta: dict[str, Any]
    earlier_target_id: int | None = None
    later_target_id: int | None = None


@dataclass(frozen=True)
class Claim:
    insight: RegionInsight
    schedule: bool


def _find(db: Session, *, user_id: int, kind: str, fingerprint: str) -> RegionInsight | None:
    return db.scalars(
        select(RegionInsight).where(
            RegionInsight.user_id == user_id,
            RegionInsight.kind == kind,
            RegionInsight.input_fingerprint == fingerprint,
            RegionInsight.deleted_at.is_(None),
        )
    ).first()


def claim_insight(
    db: Session,
    *,
    user_id: int,
    spec: InsightSpec,
    now: datetime | None = None,
    _retry: bool = True,
) -> Claim:
    now = now or datetime.now(tz=timezone.utc)
    existing = _find(db, user_id=user_id, kind=spec.kind, fingerprint=spec.fingerprint)
    if existing is not None:
        if existing.status in PUBLISHED_STATUSES:
            return Claim(existing, schedule=False)
        started = _utc(existing.processing_started_at)
        fresh = started is not None and now - started < INSIGHT_STALE_PROCESSING
        if existing.status == "processing" and fresh:
            return Claim(existing, schedule=False)
        existing.status = "processing"
        existing.attempt += 1
        existing.processing_started_at = now
        existing.completed_at = None
        existing.failure_code = None
        existing.result = None
        db.commit()
        db.refresh(existing)
        return Claim(existing, schedule=True)

    insight = RegionInsight(
        user_id=user_id,
        region_event_id=spec.event.id,
        region_id=spec.event.region_id,
        kind=spec.kind,
        status="processing",
        attempt=1,
        input_fingerprint=spec.fingerprint,
        earlier_target_id=spec.earlier_target_id,
        later_target_id=spec.later_target_id,
        referenced_target_ids=spec.referenced_target_ids,
        timepoint_map=spec.timepoint_map,
        input_meta=spec.input_meta,
        prompt_version=spec.prompt_version,
        schema_version=spec.schema_version,
        processing_started_at=now,
    )
    db.add(insight)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if not _retry:
            raise
        return claim_insight(db, user_id=user_id, spec=spec, now=now, _retry=False)
    db.refresh(insight)
    return Claim(insight, schedule=True)


def load_claimed(db: Session, insight_id: int, attempt: int) -> RegionInsight | None:
    insight = db.get(RegionInsight, insight_id)
    if insight is None or insight.status != "processing" or insight.attempt != attempt:
        return None
    return insight


def finish_insight(
    db: Session,
    insight_id: int,
    attempt: int,
    *,
    status: str,
    trace_id: str | None,
    result: dict[str, Any] | None = None,
    provider: str | None = None,
    model: str | None = None,
    failure_code: str | None = None,
    timepoint_map: list[dict[str, Any]] | None = None,
) -> bool:
    values: dict[str, Any] = {
        "status": status,
        "result": result,
        "provider": provider,
        "model": model,
        "failure_code": failure_code,
        "trace_id": trace_id,
        "completed_at": datetime.now(tz=timezone.utc),
    }
    if timepoint_map is not None:
        values["timepoint_map"] = timepoint_map
    updated = db.execute(
        update(RegionInsight)
        .where(
            RegionInsight.id == insight_id,
            RegionInsight.status == "processing",
            RegionInsight.attempt == attempt,
        )
        .values(**values)
        .execution_options(synchronize_session=False)
    ).rowcount
    db.commit()
    return updated == 1


def _timepoint_refs(insight: RegionInsight) -> list[InsightTimepointRef]:
    return [InsightTimepointRef.model_validate(item) for item in insight.timepoint_map]


def to_comparison_out(insight: RegionInsight) -> RegionComparisonOut:
    return RegionComparisonOut(
        comparison_id=insight.id,
        event_id=insight.region_event_id,
        region_id=cast(RegionId, insight.region_id),
        status=cast(Any, insight.status),
        earlier_target_id=cast(int, insight.earlier_target_id),
        later_target_id=cast(int, insight.later_target_id),
        timepoints=_timepoint_refs(insight),
        result=insight.result,
        failure_code=insight.failure_code,
        prompt_version=insight.prompt_version,
        schema_version=insight.schema_version,
        model=insight.model,
        completed_at=insight.completed_at,
    )


def to_trend_out(insight: RegionInsight) -> RegionTrendOut:
    return RegionTrendOut(
        trend_id=insight.id,
        status=cast(Any, insight.status),
        timepoints=_timepoint_refs(insight),
        result=insight.result,
        failure_code=insight.failure_code,
        prompt_version=insight.prompt_version,
        schema_version=insight.schema_version,
        model=insight.model,
        completed_at=insight.completed_at,
    )


def crop_timepoint(
    db: Session,
    *,
    user_id: int,
    photo_id: int,
    region_id: RegionId,
) -> PreparedRegionImage | None:
    photo = db.get(Photo, photo_id)
    if photo is None or photo.user_id != user_id or photo.deleted_at is not None:
        return None
    return prepare_region_crop_for_llm(
        get_storage().get(photo.storage_key), photo.quality_meta, region_id
    )
