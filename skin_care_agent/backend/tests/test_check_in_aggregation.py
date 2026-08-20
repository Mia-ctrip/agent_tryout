from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.check_in_aggregation import (
    analysis_total_count,
    build_check_in_summary,
)


NOW = datetime(2026, 7, 14, tzinfo=timezone.utc)


def _photo(photo_id: int, view_type: str) -> SimpleNamespace:
    return SimpleNamespace(id=photo_id, view_type=view_type)


def _analysis(
    analysis_id: int,
    photo_id: int,
    *,
    severity: int,
    index: int,
    needs_doctor: bool,
    patches: list[dict[str, object]],
) -> SimpleNamespace:
    return SimpleNamespace(
        id=analysis_id,
        photo_id=photo_id,
        created_at=NOW,
        overall_severity=severity,
        skin_health_index=index,
        needs_doctor=needs_doctor,
        parsed_result={"acne_patches": patches},
    )


def _check_in(kind: str = "standard") -> SimpleNamespace:
    return SimpleNamespace(
        id=10,
        kind=kind,
        status="complete",
        observed_on=date(2026, 7, 14),
        diary_data={"sleep_hours": 7.5},
    )


def test_three_views_use_max_per_region_instead_of_summing_duplicates() -> None:
    photos = [_photo(1, "front"), _photo(2, "left"), _photo(3, "right")]
    analyses = {
        1: _analysis(
            11,
            1,
            severity=3,
            index=80,
            needs_doctor=False,
            patches=[
                {"region": "left_cheek", "estimated_count": 5},
                {"region": "right_cheek", "estimated_count": 4},
                {"region": "nose", "estimated_count": 2},
            ],
        ),
        2: _analysis(
            12,
            2,
            severity=5,
            index=60,
            needs_doctor=True,
            patches=[
                {"region": "left_cheek", "estimated_count": 7},
                {"region": "nose", "estimated_count": 1},
            ],
        ),
        3: _analysis(
            13,
            3,
            severity=4,
            index=70,
            needs_doctor=False,
            patches=[
                {"region": "right_cheek", "estimated_count": 6},
                {"region": "nose", "estimated_count": 2},
            ],
        ),
    }

    summary = build_check_in_summary(_check_in(), photos, analyses)

    assert summary.aggregation_status == "ready"
    assert summary.overall_severity == 5
    assert summary.skin_health_index == pytest.approx(70)
    assert summary.needs_doctor is True
    assert summary.region_estimated_counts == {
        "left_cheek": 7,
        "nose": 2,
        "right_cheek": 6,
    }
    assert summary.total_estimated_count == 15
    assert summary.analyzed_view_count == 3
    assert summary.diary is not None
    assert summary.diary.sleep_hours == 7.5


def test_standard_summary_reports_missing_analysis_views() -> None:
    photos = [_photo(1, "front"), _photo(2, "left"), _photo(3, "right")]
    analyses = {
        1: _analysis(
            11,
            1,
            severity=3,
            index=80,
            needs_doctor=False,
            patches=[],
        )
    }

    summary = build_check_in_summary(_check_in(), photos, analyses)

    assert summary.aggregation_status == "partial"
    assert summary.missing_photo_views == []
    assert summary.missing_analysis_views == ["left", "right"]


def test_old_analysis_count_falls_back_to_acne_type_totals() -> None:
    assert (
        analysis_total_count(
            {
                "acne_types": {
                    "count_papule": 3,
                    "count_pustule": 2,
                    "unrelated": 99,
                }
            }
        )
        == 5
    )
