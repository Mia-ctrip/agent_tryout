from __future__ import annotations

from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.region_catalog import RegionId
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.region_event import RegionEvent
from app.schemas.observation import ObservationResultSource, ObservationTargetStatus
from app.schemas.timeline import (
    FullFaceTimelineItem,
    ProductUseTimelineItem,
    RegionEventTimelineItem,
    TimelineItem,
)
from app.services.product_service import list_product_uses


def _is_effective_region_target(target: ObservationTarget) -> bool:
    return target.status == "completed" and (
        (target.result_source == "photo_analysis" and target.facts is not None)
        or (target.result_source == "user_record" and bool(target.user_note))
    )


def _region_event_items(db: Session, *, user_id: int) -> list[RegionEventTimelineItem]:
    events = list(
        db.scalars(
            select(RegionEvent).where(
                RegionEvent.user_id == user_id,
                RegionEvent.status.in_(("current", "ended")),
                RegionEvent.last_valid_local_date.is_not(None),
                RegionEvent.deleted_at.is_(None),
            )
        ).all()
    )
    items: list[RegionEventTimelineItem] = []
    for event in events:
        rows = db.execute(
            select(ObservationTarget, ObservationRecord)
            .join(ObservationRecord, ObservationRecord.id == ObservationTarget.record_id)
            .where(
                ObservationTarget.region_event_id == event.id,
                ObservationTarget.user_id == user_id,
                ObservationTarget.deleted_at.is_(None),
                ObservationRecord.deleted_at.is_(None),
            )
        ).all()
        valid_rows = [
            (target, record) for target, record in rows if _is_effective_region_target(target)
        ]
        if not valid_rows or event.last_valid_local_date is None:
            continue
        occurred_at = max(record.recorded_at for _, record in valid_rows)
        sources = [
            source
            for source in ("photo_analysis", "user_record")
            if any(target.result_source == source for target, _ in valid_rows)
        ]
        items.append(
            RegionEventTimelineItem(
                timeline_id=f"region_event:{event.id}",
                occurred_at=occurred_at,
                event_id=event.id,
                region_id=cast(RegionId, event.region_id),
                status=cast(str, event.status),
                started_local_date=event.started_local_date,
                last_valid_local_date=event.last_valid_local_date,
                timepoint_count=len(valid_rows),
                sources=cast(list[ObservationResultSource], sources),
            )
        )
    return items


def _full_face_items(db: Session, *, user_id: int) -> list[FullFaceTimelineItem]:
    rows = db.execute(
        select(ObservationRecord, ObservationTarget)
        .join(ObservationTarget, ObservationTarget.record_id == ObservationRecord.id)
        .where(
            ObservationRecord.user_id == user_id,
            ObservationRecord.deleted_at.is_(None),
            ObservationTarget.user_id == user_id,
            ObservationTarget.scope_type == "full_face",
            ObservationTarget.deleted_at.is_(None),
        )
    ).all()
    return [
        FullFaceTimelineItem(
            timeline_id=f"full_face_observation:{record.id}",
            occurred_at=record.recorded_at,
            observation_id=record.id,
            recorded_at=record.recorded_at,
            target_status=cast(ObservationTargetStatus, target.status),
            source=cast(ObservationResultSource | None, target.result_source),
        )
        for record, target in rows
    ]


def _product_use_items(db: Session, *, user_id: int) -> list[ProductUseTimelineItem]:
    return [
        ProductUseTimelineItem(
            timeline_id=f"product_use:{product_use.product_use_id}",
            occurred_at=product_use.used_at,
            product_use_id=product_use.product_use_id,
            used_at=product_use.used_at,
            products=product_use.products,
            note=product_use.note,
        )
        for product_use in list_product_uses(
            db,
            user_id=user_id,
            limit=100,
            before_id=None,
        )
    ]


def list_timeline(db: Session, *, user_id: int, limit: int) -> list[TimelineItem]:
    items: list[TimelineItem] = [
        *_region_event_items(db, user_id=user_id),
        *_full_face_items(db, user_id=user_id),
        *_product_use_items(db, user_id=user_id),
    ]
    items.sort(
        key=lambda item: (item.occurred_at, item.kind, item.timeline_id),
        reverse=True,
    )
    return items[: max(1, min(limit, 100))]
