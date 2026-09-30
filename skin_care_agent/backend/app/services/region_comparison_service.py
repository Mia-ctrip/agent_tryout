"""Two-timepoint region comparison (spec 6.9.2): on demand, cached per photo pair."""

from __future__ import annotations

from typing import Callable, cast

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.domain.region_catalog import RegionId
from app.models.region_insight import RegionInsight
from app.schemas.region_insight import RegionComparisonResult
from app.services.ai_gateway import Message, UnifiedRequest, new_trace_id
from app.services.region_insight_ai import run_insight_request
from app.services.region_insight_prompt import (
    REGION_COMPARISON_PROMPT_VERSION,
    REGION_COMPARISON_SCHEMA_VERSION,
    build_comparison_messages_text,
    comparison_mock_result,
)
from app.services.region_insight_selection import input_fingerprint, validate_comparison_pair
from app.services.region_insight_service import (
    Claim,
    InsightSpec,
    claim_insight,
    crop_timepoint,
    finish_insight,
    load_claimed,
    load_photo_timepoints,
    load_visible_event,
)
from app.services.region_insight_validation import validate_comparison_result


def ensure_comparison(
    db: Session,
    *,
    user_id: int,
    event_id: int,
    earlier_target_id: int,
    later_target_id: int,
) -> Claim:
    event = load_visible_event(db, user_id=user_id, event_id=event_id)
    points = load_photo_timepoints(db, user_id=user_id, event=event)
    earlier, later = validate_comparison_pair(points, earlier_target_id, later_target_id)
    pair = [earlier.target_id, later.target_id]
    timepoint_map = [
        {
            "timepoint_id": label,
            "target_id": point.target_id,
            "observation_id": point.observation_id,
            "photo_id": point.photo_id,
            "local_date": point.local_date.isoformat(),
            "image_index": index,
            "crop": None,
        }
        for index, (label, point) in enumerate((("T1", earlier), ("T2", later)), start=1)
    ]
    spec = InsightSpec(
        kind="comparison",
        event=event,
        fingerprint=input_fingerprint(
            "comparison",
            pair,
            pair,
            REGION_COMPARISON_PROMPT_VERSION,
            REGION_COMPARISON_SCHEMA_VERSION,
        ),
        referenced_target_ids=pair,
        timepoint_map=timepoint_map,
        prompt_version=REGION_COMPARISON_PROMPT_VERSION,
        schema_version=REGION_COMPARISON_SCHEMA_VERSION,
        input_meta={"region_id": event.region_id},
        earlier_target_id=earlier.target_id,
        later_target_id=later.target_id,
    )
    return claim_insight(db, user_id=user_id, spec=spec)


def get_comparison(
    db: Session, *, user_id: int, event_id: int, comparison_id: int
) -> RegionInsight | None:
    load_visible_event(db, user_id=user_id, event_id=event_id)
    insight = db.get(RegionInsight, comparison_id)
    if (
        insight is None
        or insight.user_id != user_id
        or insight.region_event_id != event_id
        or insight.kind != "comparison"
        or insight.deleted_at is not None
    ):
        return None
    return insight


async def run_comparison(
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
        timepoint_map = [dict(item) for item in insight.timepoint_map]
        crops = [
            crop_timepoint(db, user_id=insight.user_id, photo_id=item["photo_id"],
                           region_id=region_id)
            for item in timepoint_map
        ]
        if any(crop is None for crop in crops):
            finish_insight(db, insight_id, attempt, status="failed", trace_id=trace_id,
                           failure_code="input_changed")
            return True
        for item, crop in zip(timepoint_map, crops):
            item["crop"] = crop.crop_mode
        first, second = timepoint_map
        system, user, retry = build_comparison_messages_text(
            region_id,
            photo_a_id=first["timepoint_id"],
            photo_a_time=first["local_date"],
            photo_a_crop=first["crop"],
            photo_b_id=second["timepoint_id"],
            photo_b_time=second["local_date"],
            photo_b_crop=second["crop"],
        )
        request = UnifiedRequest(
            messages=[
                Message(role="system", content=system),
                Message(role="user", content=user, image_urls=[c.image.data_url for c in crops]),
            ],
            temperature=0.1,
            max_tokens=2048,
            response_format="json",
            user_id=str(insight.user_id),
            request_id=trace_id,
            extra={"mock_json": comparison_mock_result()},
        )
        outcome = await run_insight_request(
            db,
            user_id=insight.user_id,
            kind="region_comparison",
            trace_id=trace_id,
            request=request,
            retry_prompt=retry,
            schema=RegionComparisonResult,
            validate=lambda result: validate_comparison_result(result, region_id),
            input_meta={
                "insight_id": insight_id,
                "region_id": region_id,
                "prompt_version": REGION_COMPARISON_PROMPT_VERSION,
                "timepoints": timepoint_map,
                "encoded_bytes": [c.image.encoded_bytes for c in crops],
                "sizes": [[c.image.width, c.image.height] for c in crops],
            },
        )
        if outcome.result is None:
            finish_insight(db, insight_id, attempt, status="failed", trace_id=trace_id,
                           failure_code=outcome.failure_code, timepoint_map=timepoint_map)
            return True
        result = cast(RegionComparisonResult, outcome.result)
        finish_insight(
            db,
            insight_id,
            attempt,
            status="degraded" if result.overall_change == "无法可靠判断" else "completed",
            trace_id=trace_id,
            result=result.model_dump(),
            provider=outcome.provider,
            model=outcome.model,
            timepoint_map=timepoint_map,
        )
        return True
