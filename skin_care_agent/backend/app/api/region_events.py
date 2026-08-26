from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.region_event import (
    RegionEventDetailOut,
    RegionEventEndRequest,
    RegionEventOut,
    RegionEventPreviewOut,
    RegionEventPreviewRequest,
)
from app.services.observation_service import local_date_for_offset
from app.services.region_event_service import (
    end_region_event,
    get_region_event_detail,
    list_region_events,
    preview_region_event_assignments,
    to_region_event_out,
)


router = APIRouter(prefix="/region-events", tags=["region-events"])


@router.post("/preview", response_model=list[RegionEventPreviewOut])
def preview_region_events_endpoint(
    body: RegionEventPreviewRequest,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[RegionEventPreviewOut]:
    recorded_on = local_date_for_offset(
        body.recorded_at,
        body.recorded_timezone_offset_minutes,
    )
    return preview_region_event_assignments(
        db,
        user_id=current_user.id,
        region_ids=body.region_ids,
        recorded_local_date=recorded_on,
    )


@router.get("", response_model=list[RegionEventOut])
def list_region_events_endpoint(
    event_status: Literal["current", "ended"] | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[RegionEventOut]:
    return list_region_events(db, user_id=current_user.id, event_status=event_status)


@router.get("/{event_id}", response_model=RegionEventDetailOut)
def get_region_event_endpoint(
    event_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionEventDetailOut:
    return get_region_event_detail(db, user_id=current_user.id, event_id=event_id)


@router.post("/{event_id}/end", response_model=RegionEventOut)
def end_region_event_endpoint(
    event_id: int,
    body: RegionEventEndRequest,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionEventOut:
    ended_on = local_date_for_offset(body.ended_at, body.timezone_offset_minutes)
    event = end_region_event(
        db,
        user_id=current_user.id,
        event_id=event_id,
        ended_local_date=ended_on,
    )
    if event is None:
        raise HTTPException(status_code=404, detail="region event not found")
    return to_region_event_out(event)
