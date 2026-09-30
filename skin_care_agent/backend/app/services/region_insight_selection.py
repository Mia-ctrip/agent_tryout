"""Pure selection rules for region comparisons and stage trends (spec 6.9).

No DB or AI access here: callers load the event's photo timepoints, then these
functions decide eligibility, the representative point per local day, the 30-day
trend window and which few timepoints are sent as images. Everything else in the
window only reaches the model as already-validated stored facts, which is what
keeps request size bounded regardless of how many photos the user has.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Final, Iterable, Literal, Protocol, Sequence


TREND_WINDOW_DAYS: Final = 30
TREND_MIN_DAYS: Final = 3
TREND_MIN_SPAN_DAYS: Final = 7
TREND_MAX_KEYFRAMES: Final = 6

# Six single-photo facts reused as trend text evidence; `summary` is deliberately
# excluded so an earlier model's prose cannot steer the trend conclusion.
STORED_FACT_FIELDS: Final = (
    "main_locations",
    "estimated_amount",
    "distribution",
    "coverage",
    "daily_appearance",
    "unknowns",
)

InsightKind = Literal["comparison", "trend"]


class InsightInputError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class InsightTimepoint:
    target_id: int
    observation_id: int
    recorded_at: datetime
    local_date: date
    photo_id: int
    storage_key: str
    has_region_geometry: bool
    stored_facts: dict[str, Any] | None


@dataclass(frozen=True)
class ComparisonEligibility:
    eligible: bool
    default_pair: tuple[int, int] | None


@dataclass(frozen=True)
class TrendWindow:
    points: tuple[InsightTimepoint, ...]
    start_date: date | None
    end_date: date | None


@dataclass(frozen=True)
class TrendProgress:
    days: int
    span_days: int
    eligible: bool
    missing_days: int
    missing_span_days: int


class _FactTarget(Protocol):
    result_source: str | None
    facts: dict[str, Any] | None


def stored_facts_from_target(target: _FactTarget) -> dict[str, Any] | None:
    if target.result_source != "photo_analysis" or not target.facts:
        return None
    return {field: target.facts.get(field) for field in STORED_FACT_FIELDS}


def _ordered(points: Iterable[InsightTimepoint]) -> list[InsightTimepoint]:
    return sorted(points, key=lambda point: (point.recorded_at, point.target_id))


def comparison_eligibility(points: Sequence[InsightTimepoint]) -> ComparisonEligibility:
    ordered = _ordered(points)
    if len({point.local_date for point in ordered}) < 2:
        return ComparisonEligibility(eligible=False, default_pair=None)
    return ComparisonEligibility(
        eligible=True,
        default_pair=(ordered[0].target_id, ordered[-1].target_id),
    )


def validate_comparison_pair(
    points: Sequence[InsightTimepoint],
    earlier_target_id: int,
    later_target_id: int,
) -> tuple[InsightTimepoint, InsightTimepoint]:
    by_id = {point.target_id: point for point in points}
    earlier = by_id.get(earlier_target_id)
    later = by_id.get(later_target_id)
    if earlier is None or later is None:
        raise InsightInputError("timepoint_not_in_event")
    if earlier.local_date == later.local_date:
        raise InsightInputError("same_local_date")
    if (earlier.recorded_at, earlier.target_id) > (later.recorded_at, later.target_id):
        raise InsightInputError("pair_not_chronological")
    return earlier, later


def daily_representatives(points: Iterable[InsightTimepoint]) -> list[InsightTimepoint]:
    """Last valid photo timepoint of each local date, in time order."""
    by_day: dict[date, InsightTimepoint] = {}
    for point in _ordered(points):
        by_day[point.local_date] = point
    return [by_day[day] for day in sorted(by_day)]


def trend_window(points: Iterable[InsightTimepoint]) -> TrendWindow:
    representatives = daily_representatives(points)
    if not representatives:
        return TrendWindow(points=(), start_date=None, end_date=None)
    end_date = representatives[-1].local_date
    start_date = end_date - timedelta(days=TREND_WINDOW_DAYS - 1)
    return TrendWindow(
        points=tuple(point for point in representatives if point.local_date >= start_date),
        start_date=start_date,
        end_date=end_date,
    )


def trend_progress(window: TrendWindow) -> TrendProgress:
    days = len(window.points)
    span_days = (
        (window.points[-1].local_date - window.points[0].local_date).days if days else 0
    )
    missing_days = max(0, TREND_MIN_DAYS - days)
    missing_span_days = max(0, TREND_MIN_SPAN_DAYS - span_days)
    return TrendProgress(
        days=days,
        span_days=span_days,
        eligible=missing_days == 0 and missing_span_days == 0,
        missing_days=missing_days,
        missing_span_days=missing_span_days,
    )


def select_keyframes(
    points: Sequence[InsightTimepoint],
    k: int = TREND_MAX_KEYFRAMES,
) -> tuple[InsightTimepoint, ...]:
    """Deterministic keyframes: both endpoints plus points nearest to even time targets.

    Ties on time distance prefer photos with saved region geometry (so the crop is
    region-focused), then the earlier point.
    """
    ordered = _ordered(points)
    if len(ordered) <= k:
        return tuple(ordered)
    if k < 2:
        raise ValueError("k must be at least 2")
    first, last = ordered[0].recorded_at, ordered[-1].recorded_at
    span = (last - first).total_seconds()
    chosen = {0, len(ordered) - 1}
    for slot in range(1, k - 1):
        target = span * slot / (k - 1)
        candidates = [index for index in range(1, len(ordered) - 1) if index not in chosen]
        best = min(
            candidates,
            key=lambda index: (
                abs((ordered[index].recorded_at - first).total_seconds() - target),
                0 if ordered[index].has_region_geometry else 1,
                index,
            ),
        )
        chosen.add(best)
    return tuple(ordered[index] for index in sorted(chosen))


def input_fingerprint(
    kind: InsightKind,
    target_ids: Iterable[int],
    keyframe_target_ids: Iterable[int],
    prompt_version: str,
    schema_version: str,
) -> str:
    payload = json.dumps(
        {
            "kind": kind,
            "targets": sorted(target_ids),
            "keyframes": sorted(keyframe_target_ids),
            "prompt": prompt_version,
            "schema": schema_version,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
