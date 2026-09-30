from __future__ import annotations

import copy
import json
import re

import pytest
from pydantic import ValidationError

from app.schemas.region_insight import RegionComparisonResult, RegionTrendResult
from app.services.region_insight_prompt import (
    REGION_COMPARISON_PROMPT_VERSION,
    REGION_TREND_PROMPT_VERSION,
    TrendPromptTimepoint,
    build_comparison_messages_text,
    build_trend_messages_text,
    comparison_mock_result,
    trend_mock_result,
)
from app.services.region_insight_validation import (
    validate_comparison_result,
    validate_trend_result,
)


_PLACEHOLDER = re.compile(r"\{(?:region_id|region_label|region_direction_note|photo_[ab]_\w+|"
                          r"timepoint_metadata|window_(?:start|end)_date)\}")


def _points(count: int = 4, images: tuple[int, ...] = (1, 2, 4)) -> list[TrendPromptTimepoint]:
    return [
        TrendPromptTimepoint(
            timepoint_id=f"T{index}",
            local_date=f"2026-09-{index:02d}",
            image_index=(images.index(index) + 1) if index in images else None,
            crop="region_crop" if index in images else None,
            stored_facts={"estimated_amount": f"约 {10 - index} 处"},
        )
        for index in range(1, count + 1)
    ]


def test_versions_match_prompt_sources() -> None:
    assert REGION_COMPARISON_PROMPT_VERSION == "region-comparison-1.1.0"
    assert REGION_TREND_PROMPT_VERSION == "region-timeline-trend-2.0.0"


def test_comparison_prompt_resolves_every_placeholder() -> None:
    system, user, retry = build_comparison_messages_text(
        "chin",
        photo_a_id="T1", photo_a_time="2026-09-01", photo_a_crop="region_crop",
        photo_b_id="T2", photo_b_time="2026-09-09", photo_b_crop="full_photo",
    )
    for text in (system, user, retry):
        assert not _PLACEHOLDER.search(text)
    assert "region_id: `chin`" in system
    assert "`full_photo`" in user
    assert '"headline": ""' in system  # JSON skeleton braces are untouched
    assert "## USER PROMPT" not in system and "## RETRY PROMPT" not in user
    assert retry.startswith("上一个结果未通过")


def test_trend_prompt_embeds_metadata_json_and_window() -> None:
    points = _points()
    system, user, _ = build_trend_messages_text(
        "left_face", points, window_start_date="2026-08-10", window_end_date="2026-09-04"
    )
    assert not _PLACEHOLDER.search(system) and not _PLACEHOLDER.search(user)
    assert "2026-08-10" in user and "2026-09-04" in user
    start = user.index("[")
    metadata, _ = json.JSONDecoder().raw_decode(user[start:])
    assert [item["timepoint_id"] for item in metadata] == ["T1", "T2", "T3", "T4"]
    assert metadata[2]["image_index"] is None and metadata[2]["crop"] is None
    assert "你的左侧脸" in system or "左侧脸" in system


# ---------------------------------------------------------------- comparison


def _comparison(**overrides) -> dict:
    data = comparison_mock_result()
    data.update(overrides)
    return data


def test_mock_comparison_passes_all_checks() -> None:
    result = RegionComparisonResult.model_validate(comparison_mock_result())
    assert validate_comparison_result(result, "chin") is result


def test_comparison_schema_rejects_unknown_enum_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        RegionComparisonResult.model_validate(_comparison(overall_change="变好了"))
    with pytest.raises(ValidationError):
        RegionComparisonResult.model_validate(_comparison(score=3))
    bad = _comparison()
    bad["changes"][0]["evidence_strength"] = "高"
    with pytest.raises(ValidationError):
        RegionComparisonResult.model_validate(bad)


def test_insufficient_comparison_must_withhold_direction_and_headline() -> None:
    data = _comparison()
    data["comparison_reliability"]["level"] = "不足"
    with pytest.raises(ValueError, match="insufficient_requires_unknown"):
        validate_comparison_result(RegionComparisonResult.model_validate(data), "chin")

    data["overall_change"] = "无法可靠判断"
    with pytest.raises(ValueError, match="headline_must_be_empty"):
        validate_comparison_result(RegionComparisonResult.model_validate(data), "chin")

    data["headline"] = ""
    data["changes"][0]["evidence_strength"] = "较明确"
    with pytest.raises(ValueError, match="insufficient_strong_evidence"):
        validate_comparison_result(RegionComparisonResult.model_validate(data), "chin")

    for change in data["changes"]:
        change["evidence_strength"] = "有限"
    validate_comparison_result(RegionComparisonResult.model_validate(data), "chin")


@pytest.mark.parametrize(
    ("field", "value", "reason"),
    [
        ("headline", "局部偏红改善明显", "evaluative"),
        ("summary", "B 中可见数量减少，说明产品有效。", "evaluative"),
        ("summary", "B 中这颗痘痘已经消失。", "identity_tracking"),
        ("summary", "B 中额头也可见少量隆起。", "outside_selected_region"),
        ("summary", "B 中可见丘疹数量减少。", "unsafe_output"),
        ("summary", "睡眠规律后可见数量减少。", "context_reference"),
    ],
)
def test_comparison_compliance_rejects_unsafe_language(field, value, reason) -> None:
    result = RegionComparisonResult.model_validate(_comparison(**{field: value}))
    with pytest.raises(ValueError, match=reason):
        validate_comparison_result(result, "chin")


def test_neutral_words_containing_banned_fragments_are_allowed() -> None:
    result = RegionComparisonResult.model_validate(
        _comparison(summary="两张照片均为有效时间点，B 中该局部偏红外观较 A 不明显，为短期轻微波动。")
    )
    validate_comparison_result(result, "chin")


# ---------------------------------------------------------------- trend


def _trend(points: list[TrendPromptTimepoint] | None = None) -> dict:
    return copy.deepcopy(trend_mock_result(points or _points()))


def _check_trend(data: dict, points: list[TrendPromptTimepoint] | None = None):
    result = RegionTrendResult.model_validate(data)
    return validate_trend_result(result, points or _points(), "chin")


def test_mock_trend_passes_all_checks() -> None:
    _check_trend(_trend())


def test_timepoint_facts_must_mirror_input_order_and_source() -> None:
    data = _trend()
    data["timepoint_facts"] = data["timepoint_facts"][:-1]
    with pytest.raises(ValueError, match="timepoint_facts_mismatch"):
        _check_trend(data)

    data = _trend()
    data["timepoint_facts"][0], data["timepoint_facts"][1] = (
        data["timepoint_facts"][1], data["timepoint_facts"][0]
    )
    with pytest.raises(ValueError, match="timepoint_facts_mismatch"):
        _check_trend(data)

    data = _trend()
    data["timepoint_facts"][2]["source"] = "image"  # T3 had no image
    with pytest.raises(ValueError, match="source_mismatch"):
        _check_trend(data)


def test_evidence_must_reference_input_timepoints_with_honest_source() -> None:
    data = _trend()
    data["dimension_trends"]["visible_amount"]["evidence"].append("T9[图]：约 2 处")
    with pytest.raises(ValueError, match="unknown_timepoint:T9"):
        _check_trend(data)

    data = _trend()
    data["dimension_trends"]["visible_amount"]["evidence"].append("T3[图]：约 7 处")
    with pytest.raises(ValueError, match="image_source_without_image:T3"):
        _check_trend(data)

    data = _trend()
    data["dimension_trends"]["visible_amount"]["evidence"].append("第三次约 7 处")
    with pytest.raises(ValueError, match="evidence_format"):
        _check_trend(data)


def test_record_only_dimension_cannot_claim_direction() -> None:
    data = _trend()
    data["dimension_trends"]["coverage"] = {
        "trend": "总体减少",
        "evidence": ["T1[记录]：较大", "T3[记录]：较小"],
    }
    with pytest.raises(ValueError, match="record_only_direction:coverage"):
        _check_trend(data)
    data["dimension_trends"]["coverage"]["trend"] = "存在波动"
    _check_trend(data)


def test_color_trend_needs_three_image_timepoints() -> None:
    data = _trend()
    data["dimension_trends"]["color_prominence"] = {
        "trend": "总体减少",
        "evidence": ["T1[图]：偏红", "T4[图]：浅红"],
    }
    with pytest.raises(ValueError, match="color_requires_images"):
        _check_trend(data)
    data["dimension_trends"]["color_prominence"]["evidence"].insert(1, "T2[图]：偏红")
    _check_trend(data)


def test_directional_trend_needs_evidence() -> None:
    data = _trend()
    data["dimension_trends"]["distribution"] = {"trend": "总体增加", "evidence": []}
    with pytest.raises(ValueError, match="direction_without_evidence:distribution"):
        _check_trend(data)


def test_phases_and_notable_timepoints_reference_known_ordered_ids() -> None:
    data = _trend()
    data["phases"] = [
        {"start_timepoint": "T3", "end_timepoint": "T1", "pattern": "数量减少", "evidence": "…"}
    ]
    with pytest.raises(ValueError, match="phase_order"):
        _check_trend(data)
    data = _trend()
    data["notable_timepoints"] = [{"timepoint_id": "T7", "reason": "数量明显不同"}]
    with pytest.raises(ValueError, match="unknown_timepoint:T7"):
        _check_trend(data)


def test_unreliable_series_withholds_headline_and_direction() -> None:
    data = _trend()
    data["series_reliability"]["level"] = "不足"
    with pytest.raises(ValueError, match="insufficient_requires_unknown"):
        _check_trend(data)
    data["overall_trend"] = "无法可靠判断趋势"
    with pytest.raises(ValueError, match="headline_must_be_empty"):
        _check_trend(data)
    data["headline"] = ""
    _check_trend(data)


@pytest.mark.parametrize(
    "text",
    ["近两周可见表现明显好转", "进入恢复期", "停用后反弹", "可能与熬夜有关", "左侧脸也有变化"],
)
def test_trend_compliance_rejects_unsafe_language(text: str) -> None:
    data = _trend()
    data["summary"] = text
    with pytest.raises(ValueError):
        _check_trend(data)
