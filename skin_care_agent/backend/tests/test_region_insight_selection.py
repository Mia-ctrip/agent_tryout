from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.services.region_insight_selection import (
    InsightInputError,
    InsightTimepoint,
    comparison_eligibility,
    input_fingerprint,
    select_keyframes,
    stored_facts_from_target,
    trend_progress,
    trend_window,
    validate_comparison_pair,
)


_START = date(2026, 9, 1)


def _point(
    target_id: int,
    day: int,
    *,
    hour: int = 8,
    geometry: bool = True,
    facts: bool = True,
) -> InsightTimepoint:
    local_date = _START + timedelta(days=day)
    return InsightTimepoint(
        target_id=target_id,
        observation_id=target_id + 1000,
        recorded_at=datetime(local_date.year, local_date.month, local_date.day, hour,
                             tzinfo=timezone.utc),
        local_date=local_date,
        photo_id=target_id + 2000,
        storage_key=f"observations/{target_id}.jpg",
        has_region_geometry=geometry,
        stored_facts={"estimated_amount": "约 3 处"} if facts else None,
    )


def test_comparison_needs_two_distinct_local_dates() -> None:
    assert comparison_eligibility([]).eligible is False
    assert comparison_eligibility([_point(1, 0)]).eligible is False
    same_day = [_point(1, 0, hour=8), _point(2, 0, hour=20)]
    assert comparison_eligibility(same_day).eligible is False

    result = comparison_eligibility([_point(1, 0), _point(2, 3), _point(3, 5)])
    assert result.eligible is True
    assert result.default_pair == (1, 3)


def test_comparison_pair_must_be_same_event_distinct_dates_and_ordered() -> None:
    points = [_point(1, 0, hour=8), _point(2, 0, hour=20), _point(3, 4)]
    earlier, later = validate_comparison_pair(points, 1, 3)
    assert (earlier.target_id, later.target_id) == (1, 3)

    with pytest.raises(InsightInputError) as same_day:
        validate_comparison_pair(points, 1, 2)
    assert same_day.value.code == "same_local_date"
    with pytest.raises(InsightInputError) as reversed_pair:
        validate_comparison_pair(points, 3, 1)
    assert reversed_pair.value.code == "pair_not_chronological"
    with pytest.raises(InsightInputError) as foreign:
        validate_comparison_pair(points, 1, 99)
    assert foreign.value.code == "timepoint_not_in_event"


def test_trend_window_keeps_last_point_per_day_within_30_days() -> None:
    points = [
        _point(1, 0),
        _point(2, 20, hour=7),
        _point(3, 20, hour=21),
        _point(4, 35),
        _point(5, 40),
    ]
    window = trend_window(points)
    assert [point.target_id for point in window.points] == [3, 4, 5]
    assert window.start_date == _START + timedelta(days=11)
    assert window.end_date == _START + timedelta(days=40)
    assert trend_window([]).points == ()


@pytest.mark.parametrize(
    ("days", "eligible", "missing_days", "missing_span_days"),
    [
        ([0], False, 2, 7),
        ([0, 3], False, 1, 4),
        ([0, 3, 6], False, 0, 1),
        ([0, 3, 7], True, 0, 0),
        ([0, 1, 2, 3, 4, 5, 6, 7], True, 0, 0),
    ],
)
def test_trend_progress_requires_three_days_and_seven_day_span(
    days: list[int], eligible: bool, missing_days: int, missing_span_days: int
) -> None:
    window = trend_window([_point(index + 1, day) for index, day in enumerate(days)])
    progress = trend_progress(window)
    assert progress.days == len(days)
    assert progress.span_days == days[-1] - days[0]
    assert progress.eligible is eligible
    assert progress.missing_days == missing_days
    assert progress.missing_span_days == missing_span_days


def test_same_day_points_count_once_toward_trend_threshold() -> None:
    points = [_point(1, 0, hour=6), _point(2, 0, hour=22), _point(3, 7)]
    progress = trend_progress(trend_window(points))
    assert progress.days == 2
    assert progress.eligible is False


@pytest.mark.parametrize("count", [3, 5, 6])
def test_small_windows_use_every_point_as_keyframe(count: int) -> None:
    points = tuple(_point(index + 1, index * 2) for index in range(count))
    assert [p.target_id for p in select_keyframes(points)] == [p.target_id for p in points]


@pytest.mark.parametrize("count", [7, 12, 30])
def test_large_windows_cap_keyframes_and_keep_endpoints(count: int) -> None:
    points = tuple(_point(index + 1, index) for index in range(count))
    selected = select_keyframes(points)
    ids = [point.target_id for point in selected]
    assert len(ids) == 6
    assert ids[0] == 1 and ids[-1] == count
    assert ids == sorted(ids)
    assert len(set(ids)) == 6
    assert [p.target_id for p in select_keyframes(points)] == ids


def test_keyframes_are_spread_evenly_in_time() -> None:
    points = tuple(_point(index + 1, index) for index in range(30))
    ids = [point.target_id for point in select_keyframes(points)]
    assert ids == [1, 7, 13, 18, 24, 30]


def test_keyframes_prefer_region_geometry_on_equal_distance() -> None:
    points = (
        _point(1, 0),
        _point(2, 1),
        _point(3, 2, geometry=False),
        _point(4, 3),
        _point(5, 4),
        _point(6, 5),
        _point(7, 6),
    )
    # k=3 → middle target is day 3; exact hit wins regardless of geometry.
    assert [p.target_id for p in select_keyframes(points, k=3)] == [1, 4, 7]
    # Even count → target falls halfway between two points; prefer the one with geometry.
    even = (_point(1, 0), _point(2, 1, geometry=False), _point(3, 3), _point(4, 4))
    assert [p.target_id for p in select_keyframes(even, k=3)] == [1, 3, 4]
    # Without the geometry difference the earlier candidate wins the tie deterministically.
    plain = (_point(1, 0), _point(2, 1), _point(3, 3), _point(4, 4))
    assert [p.target_id for p in select_keyframes(plain, k=3)] == [1, 2, 4]


def test_fingerprint_is_order_stable_and_version_sensitive() -> None:
    base = input_fingerprint("trend", [3, 1, 2], [1, 3], "v1", "s1")
    assert base == input_fingerprint("trend", [1, 2, 3], [3, 1], "v1", "s1")
    assert base != input_fingerprint("trend", [1, 2, 3], [1, 3], "v2", "s1")
    assert base != input_fingerprint("trend", [1, 2, 3, 4], [1, 3], "v1", "s1")
    assert base != input_fingerprint("comparison", [1, 2, 3], [1, 3], "v1", "s1")


def test_stored_facts_only_come_from_validated_photo_analysis() -> None:
    facts = {
        "main_locations": ["下巴中央"],
        "estimated_amount": "约 3 处",
        "distribution": "集中",
        "coverage": "较小",
        "daily_appearance": ["浅红隆起"],
        "unknowns": [],
        "summary": "不应进入趋势输入",
    }

    class _Target:
        result_source = "photo_analysis"

    target = _Target()
    target.facts = facts
    stored = stored_facts_from_target(target)
    assert stored is not None
    assert "summary" not in stored
    assert set(stored) == {
        "main_locations", "estimated_amount", "distribution",
        "coverage", "daily_appearance", "unknowns",
    }

    target.result_source = "user_record"
    assert stored_facts_from_target(target) is None
    target.result_source = "photo_analysis"
    target.facts = None
    assert stored_facts_from_target(target) is None
