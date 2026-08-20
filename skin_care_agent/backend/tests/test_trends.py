from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.api.lineages import _summarize_trend
from app.api.trends import _build_highlights, _select_daily_check_in_summaries
from app.schemas.trend import DailyPoint, RegionSummary


def test_lineage_trend_summary_orders_snapshots() -> None:
    later = SimpleNamespace(
        id=2,
        observed_on=date(2026, 7, 10),
        created_at=datetime(2026, 7, 10, tzinfo=timezone.utc),
        estimated_count=3,
        severity=2,
        coverage="sparse",
        dominant_type="papule",
        inflammation="mild",
    )
    earlier = SimpleNamespace(
        id=1,
        observed_on=date(2026, 7, 3),
        created_at=datetime(2026, 7, 3, tzinfo=timezone.utc),
        estimated_count=8,
        severity=4,
        coverage="dense",
        dominant_type="pustule",
        inflammation="severe",
    )

    summary = _summarize_trend([later, earlier])

    assert summary["count_delta"] == -5
    assert summary["severity_delta"] == -2
    assert summary["coverage_trajectory"] == ["dense", "sparse"]
    assert summary["inflammation_start"] == "severe"
    assert summary["inflammation_end"] == "mild"


def test_highlights_describe_improvement_and_top_region() -> None:
    points = [
        DailyPoint(day=date(2026, 7, 1), skin_health_index=55),
        DailyPoint(day=date(2026, 7, 13), skin_health_index=68),
    ]
    regions = [
        RegionSummary(
            region="right_cheek",
            active_lineage_count=2,
            dormant_lineage_count=0,
            healed_lineage_count=1,
        )
    ]

    highlights = _build_highlights(
        daily_points=points,
        total_new=1,
        total_healed=1,
        region_summaries=regions,
        days=30,
    )

    assert any("上升 13 分" in item for item in highlights)
    assert any("新增 1 处" in item for item in highlights)
    assert any("右颊" in item for item in highlights)


def test_highlights_fallback_when_no_data() -> None:
    assert _build_highlights(
        daily_points=[],
        total_new=0,
        total_healed=0,
        region_summaries=[],
        days=30,
    ) == ["数据不足，请继续追踪几日后查看趋势。"]


def test_daily_trend_prefers_one_ready_standard_check_in() -> None:
    day = date(2026, 7, 14)
    quick = SimpleNamespace(
        aggregation_status="ready",
        observed_on=day,
        kind="quick",
        latest_analysis_at=datetime(2026, 7, 14, 12, tzinfo=timezone.utc),
        check_in_id=3,
    )
    standard = SimpleNamespace(
        aggregation_status="ready",
        observed_on=day,
        kind="standard",
        latest_analysis_at=datetime(2026, 7, 14, 10, tzinfo=timezone.utc),
        check_in_id=2,
    )
    incomplete = SimpleNamespace(
        aggregation_status="partial",
        observed_on=date(2026, 7, 13),
        kind="standard",
        latest_analysis_at=None,
        check_in_id=1,
    )

    selected, incomplete_count, superseded_count = _select_daily_check_in_summaries(
        [quick, standard, incomplete]
    )

    assert selected[day].check_in_id == 2
    assert incomplete_count == 1
    assert superseded_count == 1
