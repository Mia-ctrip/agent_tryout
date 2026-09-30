"""30-day region stage trend (spec 6.9.3).

Input per request: every daily representative's stored facts (text) + at most
TREND_MAX_KEYFRAMES region crops. The trend is keyed by the window's fingerprint; when a
new timepoint arrives the previous published version stays visible until the new one
is published.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, cast

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.domain.region_catalog import RegionId
from app.models.region_event import RegionEvent
from app.models.region_insight import RegionInsight
from app.schemas.region_event import RegionInsightsOut, RegionTrendProgressOut
from app.schemas.region_insight import RegionTrendResult
from app.services.ai_gateway import Message, UnifiedRequest, new_trace_id
from app.services.region_insight_ai import run_insight_request
from app.services.region_insight_prompt import (
    REGION_TREND_PROMPT_VERSION,
    REGION_TREND_SCHEMA_VERSION,
    TrendPromptTimepoint,
    build_trend_messages_text,
    trend_mock_result,
)
from app.services.region_insight_selection import (
    InsightTimepoint,
    TrendWindow,
    comparison_eligibility,
    input_fingerprint,
    select_keyframes,
    trend_progress,
    trend_window,
)
from app.services.region_insight_service import (
    INSIGHT_STALE_PROCESSING,
    PUBLISHED_STATUSES,
    Claim,
    InsightSpec,
    _utc,
    claim_insight,
    crop_timepoint,
    finish_insight,
    load_claimed,
    load_photo_timepoints,
    load_visible_event,
    to_trend_out,
)
from app.services.region_insight_validation import validate_trend_result


def _trend_spec(event: RegionEvent, window: TrendWindow) -> InsightSpec:
    keyframes = select_keyframes(window.points)
    image_index = {point.target_id: index for index, point in enumerate(keyframes, start=1)}
    target_ids = [point.target_id for point in window.points]
    timepoint_map = [
        {
            "timepoint_id": f"T{position}",
            "target_id": point.target_id,
            "observation_id": point.observation_id,
            "photo_id": point.photo_id,
            "local_date": point.local_date.isoformat(),
            "image_index": image_index.get(point.target_id),
            "crop": None,
        }
        for position, point in enumerate(window.points, start=1)
    ]
    return InsightSpec(
        kind="trend",
        event=event,
        fingerprint=input_fingerprint(
            "trend",
            target_ids,
            list(image_index),
            REGION_TREND_PROMPT_VERSION,
            REGION_TREND_SCHEMA_VERSION,
        ),
        referenced_target_ids=target_ids,
        timepoint_map=timepoint_map,
        prompt_version=REGION_TREND_PROMPT_VERSION,
        schema_version=REGION_TREND_SCHEMA_VERSION,
        input_meta={
            "region_id": event.region_id,
            "window_start_date": cast(Any, window.start_date).isoformat(),
            "window_end_date": cast(Any, window.end_date).isoformat(),
            # Snapshot so the worker sends exactly what the fingerprint describes.
            "stored_facts": {
                str(point.target_id): point.stored_facts for point in window.points
            },
        },
    )


def _trend_rows(db: Session, *, user_id: int, event_id: int) -> list[RegionInsight]:
    return list(
        db.scalars(
            select(RegionInsight)
            .where(
                RegionInsight.user_id == user_id,
                RegionInsight.region_event_id == event_id,
                RegionInsight.kind == "trend",
                RegionInsight.deleted_at.is_(None),
            )
            .order_by(RegionInsight.id)
        ).all()
    )


def _progress_out(window: TrendWindow) -> RegionTrendProgressOut:
    progress = trend_progress(window)
    return RegionTrendProgressOut(
        days=progress.days,
        span_days=progress.span_days,
        eligible=progress.eligible,
        missing_days=progress.missing_days,
        missing_span_days=progress.missing_span_days,
        window_start_date=window.start_date,
        window_end_date=window.end_date,
    )


def _insights_out(
    db: Session,
    *,
    user_id: int,
    event: RegionEvent,
    points: list[InsightTimepoint],
) -> RegionInsightsOut:
    comparison = comparison_eligibility(points)
    window = trend_window(points)
    progress = _progress_out(window)
    rows = _trend_rows(db, user_id=user_id, event_id=event.id)
    current = None
    if progress.eligible:
        fingerprint = _trend_spec(event, window).fingerprint
        current = next((row for row in rows if row.input_fingerprint == fingerprint), None)
    published = [row for row in rows if row.status in PUBLISHED_STATUSES]
    shown = (
        current
        if current is not None and current.status in PUBLISHED_STATUSES
        else max(published, key=lambda row: (_utc(row.completed_at), row.id), default=None)
    )

    if not progress.eligible:
        status = "locked"
    elif current is None:
        status = "stale"
    elif current.status in PUBLISHED_STATUSES:
        status = "ready"
    elif current.status == "processing":
        started = _utc(current.processing_started_at)
        fresh = started is not None and (
            datetime.now(tz=timezone.utc) - started < INSIGHT_STALE_PROCESSING
        )
        status = "processing" if fresh else "stale"
    else:
        status = "failed"

    return RegionInsightsOut(
        event_id=event.id,
        region_id=cast(RegionId, event.region_id),
        photo_timepoint_count=len(points),
        comparison_eligible=comparison.eligible,
        default_pair=comparison.default_pair,
        trend_progress=progress,
        trend_status=cast(Any, status),
        trend=to_trend_out(shown) if shown is not None else None,
        trend_is_current=shown is not None and shown is current,
    )


def get_region_insights(db: Session, *, user_id: int, event_id: int) -> RegionInsightsOut:
    event = load_visible_event(db, user_id=user_id, event_id=event_id)
    points = load_photo_timepoints(db, user_id=user_id, event=event)
    return _insights_out(db, user_id=user_id, event=event, points=points)


def refresh_trend(
    db: Session, *, user_id: int, event_id: int
) -> tuple[RegionInsightsOut, Claim]:
    event = load_visible_event(db, user_id=user_id, event_id=event_id)
    points = load_photo_timepoints(db, user_id=user_id, event=event)
    window = trend_window(points)
    if not trend_progress(window).eligible:
        raise HTTPException(status_code=409, detail="trend_threshold_not_met")
    claim = claim_insight(db, user_id=user_id, spec=_trend_spec(event, window))
    return _insights_out(db, user_id=user_id, event=event, points=points), claim


def _supersede_older(db: Session, insight: RegionInsight) -> None:
    db.execute(
        update(RegionInsight)
        .where(
            RegionInsight.user_id == insight.user_id,
            RegionInsight.region_event_id == insight.region_event_id,
            RegionInsight.kind == "trend",
            RegionInsight.id != insight.id,
            RegionInsight.status.in_(PUBLISHED_STATUSES),
            RegionInsight.superseded_at.is_(None),
            RegionInsight.completed_at <= insight.completed_at,
        )
        .values(superseded_at=datetime.now(tz=timezone.utc))
        .execution_options(synchronize_session=False)
    )
    db.commit()


async def run_trend(
    insight_id: int,
    attempt: int,
    session_factory: Callable[[], Session] = SessionLocal,
) -> bool:
    with session_factory() as db:
        insight = load_claimed(db, insight_id, attempt)
        if insight is None:
            return False
        region_id = cast(RegionId, insight.region_id)
        trace_id = new_trace_id()
        meta = insight.input_meta or {}
        stored = meta.get("stored_facts", {})
        timepoint_map = [dict(item) for item in insight.timepoint_map]
        keyframes = sorted(
            (item for item in timepoint_map if item["image_index"] is not None),
            key=lambda item: item["image_index"],
        )
        crops = []
        for item in keyframes:
            crop = crop_timepoint(
                db, user_id=insight.user_id, photo_id=item["photo_id"], region_id=region_id
            )
            if crop is None:
                finish_insight(db, insight_id, attempt, status="failed", trace_id=trace_id,
                               failure_code="input_changed")
                return True
            item["crop"] = crop.crop_mode
            crops.append(crop)

        prompt_points = [
            TrendPromptTimepoint(
                timepoint_id=item["timepoint_id"],
                local_date=item["local_date"],
                image_index=item["image_index"],
                crop=item["crop"],
                stored_facts=stored.get(str(item["target_id"])),
            )
            for item in timepoint_map
        ]
        system, user, retry = build_trend_messages_text(
            region_id,
            prompt_points,
            window_start_date=meta.get("window_start_date", ""),
            window_end_date=meta.get("window_end_date", ""),
        )
        request = UnifiedRequest(
            messages=[
                Message(role="system", content=system),
                Message(role="user", content=user, image_urls=[c.image.data_url for c in crops]),
            ],
            temperature=0.1,
            max_tokens=4096,
            response_format="json",
            user_id=str(insight.user_id),
            request_id=trace_id,
            extra={"mock_json": trend_mock_result(prompt_points)},
        )
        outcome = await run_insight_request(
            db,
            user_id=insight.user_id,
            kind="region_trend",
            trace_id=trace_id,
            request=request,
            retry_prompt=retry,
            schema=RegionTrendResult,
            validate=lambda result: validate_trend_result(result, prompt_points, region_id),
            input_meta={
                "insight_id": insight_id,
                "region_id": region_id,
                "prompt_version": REGION_TREND_PROMPT_VERSION,
                "timepoint_count": len(prompt_points),
                "image_count": len(crops),
                "encoded_bytes": [c.image.encoded_bytes for c in crops],
                "prompt_chars": len(system) + len(user),
            },
        )
        if outcome.result is None:
            finish_insight(db, insight_id, attempt, status="failed", trace_id=trace_id,
                           failure_code=outcome.failure_code, timepoint_map=timepoint_map)
            return True
        result = cast(RegionTrendResult, outcome.result)
        published = finish_insight(
            db,
            insight_id,
            attempt,
            status="degraded" if result.overall_trend == "无法可靠判断趋势" else "completed",
            trace_id=trace_id,
            result=result.model_dump(),
            provider=outcome.provider,
            model=outcome.model,
            timepoint_map=timepoint_map,
        )
        if published:
            refreshed = db.get(RegionInsight, insight_id)
            db.refresh(refreshed)
            _supersede_older(db, refreshed)
        return True
