from __future__ import annotations

from datetime import date, datetime, timezone
from typing import cast

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.region_catalog import RegionId, normalize_region_ids
from app.models.region_event import RegionEvent
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.user import User
from app.schemas.observation import RegionTargetCreate
from app.schemas.region_event import RegionEventPreviewOut
from app.schemas.region_event import (
    RegionEventDetailOut,
    RegionEventOut,
    RegionEventTimepointOut,
)


def _preferred_open_events(events: list[RegionEvent]) -> dict[RegionId, RegionEvent]:
    selected: dict[RegionId, RegionEvent] = {}
    for event in events:
        region_id = cast(RegionId, event.region_id)
        current = selected.get(region_id)
        if current is None or event.status == "pending":
            selected[region_id] = event
    return selected


def preview_event_assignment(
    region_id: RegionId,
    recorded_local_date: date,
    open_event: RegionEvent | None,
) -> RegionEventPreviewOut:
    if open_event is None:
        return RegionEventPreviewOut(region_id=region_id, action="auto_new")
    days_since_last = (
        (recorded_local_date - open_event.last_valid_local_date).days
        if open_event.last_valid_local_date is not None
        else None
    )
    action = (
        "choice_required"
        if open_event.status == "current"
        and days_since_last is not None
        and days_since_last >= 30
        else "auto_continue"
    )
    return RegionEventPreviewOut(
        region_id=region_id,
        action=action,
        event_id=open_event.id,
        event_status=cast(str, open_event.status),
        last_valid_local_date=open_event.last_valid_local_date,
        days_since_last=days_since_last,
    )


def preview_region_event_assignments(
    db: Session,
    *,
    user_id: int,
    region_ids: list[RegionId],
    recorded_local_date: date,
) -> list[RegionEventPreviewOut]:
    ordered = normalize_region_ids(region_ids)
    events = db.scalars(
        select(RegionEvent).where(
            RegionEvent.user_id == user_id,
            RegionEvent.region_id.in_(ordered),
            RegionEvent.status.in_(("pending", "current")),
            RegionEvent.deleted_at.is_(None),
        )
    ).all()
    by_region = _preferred_open_events(list(events))
    return [
        preview_event_assignment(region_id, recorded_local_date, by_region.get(region_id))
        for region_id in ordered
    ]


def reserve_events_for_targets(
    db: Session,
    *,
    user_id: int,
    recorded_local_date: date,
    target_inputs: list[RegionTargetCreate],
) -> dict[RegionId, RegionEvent]:
    db.scalar(select(User.id).where(User.id == user_id).with_for_update())
    region_ids = [target.region_id for target in target_inputs]
    previews = preview_region_event_assignments(
        db,
        user_id=user_id,
        region_ids=region_ids,
        recorded_local_date=recorded_local_date,
    )
    existing = _preferred_open_events(
        list(
            db.scalars(
                select(RegionEvent).where(
                    RegionEvent.user_id == user_id,
                    RegionEvent.region_id.in_(region_ids),
                    RegionEvent.status.in_(("pending", "current")),
                    RegionEvent.deleted_at.is_(None),
                )
            ).all()
        )
    )
    inputs = {target.region_id: target for target in target_inputs}
    reserved: dict[RegionId, RegionEvent] = {}
    for preview in previews:
        target_input = inputs[preview.region_id]
        if preview.action == "choice_required":
            if target_input.event_decision not in ("continue", "start_new"):
                raise HTTPException(
                    status_code=409,
                    detail=f"event decision required for region: {preview.region_id}",
                )
            if target_input.event_decision == "continue":
                reserved[preview.region_id] = existing[preview.region_id]
                continue
            previous = existing[preview.region_id]
            event = RegionEvent(
                user_id=user_id,
                region_id=preview.region_id,
                status="pending",
                previous_event_id=previous.id,
                started_local_date=recorded_local_date,
            )
            db.add(event)
            db.flush()
            reserved[preview.region_id] = event
            continue
        if target_input.event_decision is not None:
            raise HTTPException(
                status_code=409,
                detail=f"stale event decision for region: {preview.region_id}",
            )
        if preview.action == "auto_continue":
            reserved[preview.region_id] = existing[preview.region_id]
            continue
        event = RegionEvent(
            user_id=user_id,
            region_id=preview.region_id,
            status="pending",
            started_local_date=recorded_local_date,
        )
        db.add(event)
        db.flush()
        reserved[preview.region_id] = event
    return reserved


def _target_is_effective(target: ObservationTarget) -> bool:
    return target.status == "completed" and (
        (target.result_source == "photo_analysis" and target.facts is not None)
        or (target.result_source == "user_record" and bool(target.user_note))
    )


def activate_valid_target_event(db: Session, target_id: int) -> bool:
    target = db.get(ObservationTarget, target_id)
    if target is None or target.region_event_id is None or not _target_is_effective(target):
        return False
    record = db.get(ObservationRecord, target.record_id)
    event = db.get(RegionEvent, target.region_event_id)
    if record is None or record.recorded_local_date is None or event is None:
        return False
    if event.status == "ended":
        return False
    recorded_on = record.recorded_local_date
    if event.status == "pending":
        if event.previous_event_id is not None:
            previous = db.get(RegionEvent, event.previous_event_id)
            if previous is not None and previous.status == "current":
                previous.status = "ended"
                previous.end_reason = "replaced"
                previous.ended_local_date = recorded_on
                previous.ended_at = datetime.now(tz=timezone.utc)
                db.flush()
        event.status = "current"
    if event.last_valid_local_date is None or recorded_on > event.last_valid_local_date:
        event.last_valid_local_date = recorded_on
    db.commit()
    return True


def end_region_event(
    db: Session,
    *,
    user_id: int,
    event_id: int,
    ended_local_date: date,
) -> RegionEvent | None:
    event = db.get(RegionEvent, event_id)
    if event is None or event.user_id != user_id or event.deleted_at is not None:
        return None
    if event.status != "current":
        return event
    event.status = "ended"
    event.end_reason = "user_ended"
    event.ended_local_date = ended_local_date
    event.ended_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(event)
    return event


def to_region_event_out(event: RegionEvent) -> RegionEventOut:
    if event.last_valid_local_date is None or event.status not in ("current", "ended"):
        raise RuntimeError("region event is not visible")
    return RegionEventOut(
        event_id=event.id,
        region_id=cast(RegionId, event.region_id),
        status=cast(str, event.status),
        started_local_date=event.started_local_date,
        last_valid_local_date=event.last_valid_local_date,
        ended_local_date=event.ended_local_date,
        ended_at=event.ended_at,
    )


def list_region_events(
    db: Session,
    *,
    user_id: int,
    event_status: str | None = None,
) -> list[RegionEventOut]:
    statement = select(RegionEvent).where(
        RegionEvent.user_id == user_id,
        RegionEvent.status.in_(("current", "ended")),
        RegionEvent.last_valid_local_date.is_not(None),
        RegionEvent.deleted_at.is_(None),
    )
    if event_status is not None:
        statement = statement.where(RegionEvent.status == event_status)
    events = db.scalars(
        statement.order_by(
            RegionEvent.last_valid_local_date.desc(),
            RegionEvent.id.desc(),
        )
    ).all()
    return [to_region_event_out(event) for event in events]


def get_region_event_detail(
    db: Session,
    *,
    user_id: int,
    event_id: int,
) -> RegionEventDetailOut:
    event = db.get(RegionEvent, event_id)
    if (
        event is None
        or event.user_id != user_id
        or event.deleted_at is not None
        or event.status not in ("current", "ended")
        or event.last_valid_local_date is None
    ):
        raise HTTPException(status_code=404, detail="region event not found")

    from app.models.photo import Photo
    from app.services.observation_service import _build_observation_out

    rows = db.execute(
        select(ObservationTarget, ObservationRecord, Photo)
        .join(ObservationRecord, ObservationRecord.id == ObservationTarget.record_id)
        .outerjoin(Photo, Photo.id == ObservationRecord.photo_id)
        .where(
            ObservationTarget.region_event_id == event_id,
            ObservationTarget.user_id == user_id,
            ObservationTarget.status == "completed",
            ObservationTarget.deleted_at.is_(None),
            ObservationRecord.deleted_at.is_(None),
        )
        .order_by(ObservationRecord.recorded_at, ObservationTarget.id)
    ).all()
    timepoints: list[RegionEventTimepointOut] = []
    for target, record, photo in rows:
        if not _target_is_effective(target) or record.recorded_local_date is None:
            continue
        observation = _build_observation_out(db, record, [target], photo)
        timepoints.append(
            RegionEventTimepointOut(
                observation_id=record.id,
                recorded_at=record.recorded_at,
                recorded_timezone_offset_minutes=record.recorded_timezone_offset_minutes,
                recorded_local_date=record.recorded_local_date,
                photo=observation.photo,
                target=observation.targets[0],
                life_context_ids=observation.life_context_ids,
                life_context_completed_at=observation.life_context_completed_at,
            )
        )
    event_out = to_region_event_out(event)
    return RegionEventDetailOut(**event_out.model_dump(), timepoints=timepoints)
