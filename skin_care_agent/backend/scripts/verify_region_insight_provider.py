"""Task 10: measure real-provider size / latency / output boundary for comparison & trend.

Runs the production services against the configured dev database for one user:
- a few real comparisons (cached rows are kept; they are derived, regenerable data),
- the real trend of one eligible event,
- a synthetic 30-timepoint trend probe (real facts + 6 real crops, synthetic dates) that is
  NOT stored as a RegionInsight; only its AI call log is written with kind
  ``region_trend_probe``.

Usage: .venv/Scripts/python.exe scripts/verify_region_insight_provider.py --user 225 \
         --compare 19 20 23 --trend 23 --probe 23
Writes artifacts/region-insight-provider-review/results.json (no photos, no data URLs).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.domain.region_catalog import RegionId  # noqa: E402
from app.models.ai_call_log import AICallLog  # noqa: E402
from app.models.region_insight import RegionInsight  # noqa: E402
from app.schemas.region_insight import RegionTrendResult  # noqa: E402
from app.services.ai_gateway import Message, UnifiedRequest, new_trace_id  # noqa: E402
from app.services.region_comparison_service import ensure_comparison, run_comparison  # noqa: E402
from app.services.region_insight_ai import run_insight_request  # noqa: E402
from app.services.region_insight_prompt import (  # noqa: E402
    TrendPromptTimepoint,
    build_trend_messages_text,
    trend_mock_result,
)
from app.services.region_insight_selection import (  # noqa: E402
    comparison_eligibility,
    select_keyframes,
)
from app.services.region_insight_service import (  # noqa: E402
    crop_timepoint,
    load_photo_timepoints,
    load_visible_event,
)
from app.services.region_insight_validation import validate_trend_result  # noqa: E402
from app.services.region_trend_service import refresh_trend, run_trend  # noqa: E402


OUTPUT = BACKEND_ROOT.parent / "artifacts" / "region-insight-provider-review"


def _calls(trace_id: str | None) -> list[dict[str, Any]]:
    if not trace_id:
        return []
    with SessionLocal() as db:
        rows = db.scalars(
            select(AICallLog).where(AICallLog.trace_id == trace_id).order_by(AICallLog.attempt_seq)
        ).all()
        return [
            {
                "status": row.status,
                "provider": row.provider,
                "model": row.model,
                "input_tokens": row.input_tokens,
                "output_tokens": row.output_tokens,
                "latency_ms": row.latency_ms,
                "error": (row.error_message or "")[:300] or None,
                "encoded_bytes": (row.input_meta or {}).get("encoded_bytes"),
                "prompt_chars": (row.input_meta or {}).get("prompt_chars"),
            }
            for row in rows
        ]


def _insight_report(insight_id: int, wall_s: float) -> dict[str, Any]:
    with SessionLocal() as db:
        row = cast(RegionInsight, db.get(RegionInsight, insight_id))
        result = row.result or {}
        return {
            "insight_id": row.id,
            "kind": row.kind,
            "event_id": row.region_event_id,
            "region_id": row.region_id,
            "status": row.status,
            "failure_code": row.failure_code,
            "timepoints": [
                {k: item.get(k) for k in ("timepoint_id", "local_date", "image_index", "crop")}
                for item in row.timepoint_map
            ],
            "wall_seconds": round(wall_s, 1),
            "calls": _calls(row.trace_id),
            "headline": result.get("headline"),
            "overall": result.get("overall_change") or result.get("overall_trend"),
            "reliability": (result.get("comparison_reliability") or result.get("series_reliability") or {}),
            "changes": result.get("changes"),
            "dimension_trends": result.get("dimension_trends"),
            "phases": result.get("phases"),
            "notable_timepoints": result.get("notable_timepoints"),
            "unknowns": result.get("unknowns"),
            "summary": result.get("summary"),
        }


async def compare(user_id: int, event_id: int) -> dict[str, Any]:
    with SessionLocal() as db:
        event = load_visible_event(db, user_id=user_id, event_id=event_id)
        points = load_photo_timepoints(db, user_id=user_id, event=event)
        pair = comparison_eligibility(points).default_pair
        if pair is None:
            return {"event_id": event_id, "skipped": "not_comparable"}
        claim = ensure_comparison(
            db, user_id=user_id, event_id=event_id,
            earlier_target_id=pair[0], later_target_id=pair[1],
        )
    started = time.monotonic()
    if claim.schedule:
        await run_comparison(claim.insight.id, claim.insight.attempt)
    report = _insight_report(claim.insight.id, time.monotonic() - started)
    report["cached"] = not claim.schedule
    return report


async def trend(user_id: int, event_id: int) -> dict[str, Any]:
    with SessionLocal() as db:
        _, claim = refresh_trend(db, user_id=user_id, event_id=event_id)
    started = time.monotonic()
    if claim.schedule:
        await run_trend(claim.insight.id, claim.insight.attempt)
    report = _insight_report(claim.insight.id, time.monotonic() - started)
    report["cached"] = not claim.schedule
    return report


async def probe_30(user_id: int, event_id: int) -> dict[str, Any]:
    """Worst-case window: 30 daily points, 6 keyframes, facts reused from real points."""
    with SessionLocal() as db:
        event = load_visible_event(db, user_id=user_id, event_id=event_id)
        real = [p for p in load_photo_timepoints(db, user_id=user_id, event=event) if p.stored_facts]
        region_id = cast(RegionId, event.region_id)
        start = date(2026, 8, 1)
        synthetic = [
            real[index % len(real)].__class__(
                **{**real[index % len(real)].__dict__, "target_id": 900_000 + index,
                   "local_date": start + timedelta(days=index)}
            )
            for index in range(30)
        ]
        keyframes = select_keyframes(synthetic)
        image_index = {p.target_id: i for i, p in enumerate(keyframes, start=1)}
        crops = [
            crop_timepoint(db, user_id=user_id, photo_id=p.photo_id, region_id=region_id)
            for p in keyframes
        ]
        points = [
            TrendPromptTimepoint(
                timepoint_id=f"T{i}",
                local_date=p.local_date.isoformat(),
                image_index=image_index.get(p.target_id),
                crop=crops[image_index[p.target_id] - 1].crop_mode if p.target_id in image_index else None,
                stored_facts=p.stored_facts,
            )
            for i, p in enumerate(synthetic, start=1)
        ]
        system, user, retry = build_trend_messages_text(
            region_id, points,
            window_start_date=start.isoformat(),
            window_end_date=(start + timedelta(days=29)).isoformat(),
        )
        trace_id = new_trace_id()
        request = UnifiedRequest(
            messages=[
                Message(role="system", content=system),
                Message(role="user", content=user, image_urls=[c.image.data_url for c in crops]),
            ],
            temperature=0.1, max_tokens=4096, response_format="json",
            user_id=str(user_id), request_id=trace_id,
            extra={"mock_json": trend_mock_result(points)},
        )
        request_bytes = sum(len(m.content.encode("utf-8")) for m in request.messages) + sum(
            len(url) for m in request.messages for url in m.image_urls
        )
        started = time.monotonic()
        outcome = await run_insight_request(
            db, user_id=user_id, kind="region_trend_probe", trace_id=trace_id,
            request=request, retry_prompt=retry, schema=RegionTrendResult,
            validate=lambda r: validate_trend_result(r, points, region_id),
            input_meta={"synthetic": True, "timepoint_count": 30, "image_count": len(crops),
                        "encoded_bytes": [c.image.encoded_bytes for c in crops],
                        "prompt_chars": len(system) + len(user)},
        )
    result = outcome.result.model_dump() if outcome.result else {}
    return {
        "kind": "trend_probe_30",
        "event_id": event_id,
        "published": outcome.result is not None,
        "failure_code": outcome.failure_code,
        "request_bytes": request_bytes,
        "image_count": len(crops),
        "crop_modes": [c.crop_mode for c in crops],
        "wall_seconds": round(time.monotonic() - started, 1),
        "calls": _calls(trace_id),
        "headline": result.get("headline"),
        "overall": result.get("overall_trend"),
        "dimension_trends": result.get("dimension_trends"),
        "summary": result.get("summary"),
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", type=int, required=True)
    parser.add_argument("--compare", type=int, nargs="*", default=[])
    parser.add_argument("--trend", type=int, nargs="*", default=[])
    parser.add_argument("--probe", type=int, nargs="*", default=[])
    args = parser.parse_args()

    reports: list[dict[str, Any]] = []
    for event_id in args.compare:
        reports.append({"step": "comparison", **await compare(args.user, event_id)})
        print("comparison", event_id, reports[-1].get("status"), reports[-1].get("wall_seconds"))
    for event_id in args.trend:
        reports.append({"step": "trend", **await trend(args.user, event_id)})
        print("trend", event_id, reports[-1].get("status"), reports[-1].get("wall_seconds"))
    for event_id in args.probe:
        reports.append({"step": "probe", **await probe_30(args.user, event_id)})
        print("probe", event_id, reports[-1].get("published"), reports[-1].get("wall_seconds"))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "results.json").write_text(
        json.dumps(reports, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    print("written", OUTPUT / "results.json")


if __name__ == "__main__":
    asyncio.run(main())
