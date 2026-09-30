from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.region_event import (
    RegionComparisonOut,
    RegionComparisonRequest,
    RegionEventDetailOut,
    RegionEventEndRequest,
    RegionEventOut,
    RegionEventPreviewOut,
    RegionEventPreviewRequest,
    RegionInsightsOut,
)
from app.services.ai_gateway import rate_limit as rl
from app.services.observation_service import local_date_for_offset
from app.services.region_comparison_service import (
    ensure_comparison,
    get_comparison,
    run_comparison,
)
from app.services.region_insight_selection import InsightInputError
from app.services.region_insight_service import Claim, finish_insight, to_comparison_out
from app.services.region_trend_service import get_region_insights, refresh_trend, run_trend
from app.services.region_event_service import (
    end_region_event,
    get_region_event_detail,
    list_region_events,
    preview_region_event_assignments,
    to_region_event_out,
)


router = APIRouter(prefix="/region-events", tags=["region-events"])


def _consume_insight_quota(db: Session, user_id: int, claim: Claim) -> bool:
    """只有真正需要新调用 AI 时才占额；额度用完则释放领取，结果按失败展示，可次日重试。"""
    if rl.try_consume(db, user_id, "insight").allowed:
        return True
    finish_insight(
        db,
        claim.insight.id,
        claim.insight.attempt,
        status="failed",
        trace_id=None,
        failure_code="quota_exceeded",
    )
    return False


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


@router.get("/{event_id}/insights", response_model=RegionInsightsOut)
def get_region_insights_endpoint(
    event_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionInsightsOut:
    return get_region_insights(db, user_id=current_user.id, event_id=event_id)


@router.post(
    "/{event_id}/trend/refresh",
    response_model=RegionInsightsOut,
    responses={202: {"model": RegionInsightsOut}},
)
def refresh_region_trend_endpoint(
    event_id: int,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionInsightsOut:
    insights, claim = refresh_trend(db, user_id=current_user.id, event_id=event_id)
    if claim.schedule:
        if not _consume_insight_quota(db, current_user.id, claim):
            return get_region_insights(db, user_id=current_user.id, event_id=event_id)
        background_tasks.add_task(run_trend, claim.insight.id, claim.insight.attempt)
        response.status_code = 202
    return insights


@router.post(
    "/{event_id}/comparisons",
    response_model=RegionComparisonOut,
    responses={202: {"model": RegionComparisonOut}},
)
def create_region_comparison_endpoint(
    event_id: int,
    body: RegionComparisonRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionComparisonOut:
    try:
        claim = ensure_comparison(
            db,
            user_id=current_user.id,
            event_id=event_id,
            earlier_target_id=body.earlier_target_id,
            later_target_id=body.later_target_id,
        )
    except InsightInputError as exc:
        raise HTTPException(status_code=422, detail=exc.code) from exc
    if claim.schedule:
        if not _consume_insight_quota(db, current_user.id, claim):
            db.refresh(claim.insight)
            return to_comparison_out(claim.insight)
        background_tasks.add_task(run_comparison, claim.insight.id, claim.insight.attempt)
        response.status_code = 202
    return to_comparison_out(claim.insight)


@router.get("/{event_id}/comparisons/{comparison_id}", response_model=RegionComparisonOut)
def get_region_comparison_endpoint(
    event_id: int,
    comparison_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> RegionComparisonOut:
    insight = get_comparison(
        db, user_id=current_user.id, event_id=event_id, comparison_id=comparison_id
    )
    if insight is None:
        raise HTTPException(status_code=404, detail="comparison not found")
    return to_comparison_out(insight)


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
