from __future__ import annotations

import pytest

from app.schemas.region_observation import RegionObservationFacts, validate_region_display
from app.services.region_observation_prompt import (
    REGION_OBSERVATION_PROMPT_VERSION,
    REGION_OBSERVATION_SCHEMA_VERSION,
    build_region_system_prompt,
)
from app.services.region_sanitizer import sanitize_region_facts


def _facts(**overrides: object) -> RegionObservationFacts:
    values: dict[str, object] = {
        "main_locations": ["你的左侧脸"],
        "estimated_amount": "可见少量变化",
        "distribution": "散在分布",
        "coverage": "占所选区域可见范围较小",
        "daily_appearance": ["局部偏红并有轻微颗粒感"],
        "unknowns": ["照片分辨率限制细节观察"],
        "summary": "你的左侧脸可见少量散在的偏红和颗粒感。",
    }
    values.update(overrides)
    return RegionObservationFacts.model_validate(values)


def test_left_face_output_rejects_right_or_full_face_claims() -> None:
    for text in ("右侧脸可见变化", "全脸可见变化", "下巴可见变化"):
        with pytest.raises(ValueError, match="outside_selected_region"):
            validate_region_display(_facts(summary=text), "left_face")


def test_region_output_keeps_existing_medical_and_advice_boundary() -> None:
    with pytest.raises(ValueError, match="unsafe_output"):
        validate_region_display(_facts(summary="左侧脸可见丘疹"), "left_face")


def test_region_prompt_carries_stable_id_boundary_and_user_direction() -> None:
    prompt = build_region_system_prompt("left_face")

    assert "region_id: left_face" in prompt
    assert "用户本人真实左侧" in prompt
    assert "自拍预览是否镜像都不改变" in prompt
    assert "不得输出未选区域" in prompt
    assert REGION_OBSERVATION_PROMPT_VERSION == "region-observation-1.0.0"
    assert REGION_OBSERVATION_SCHEMA_VERSION == "region-observation-1.0.0"


def test_region_sanitizer_drops_foreign_items_and_rebuilds_summary() -> None:
    result = sanitize_region_facts(
        _facts(
            main_locations=["你的左侧脸", "下巴"],
            daily_appearance=["左侧脸局部偏红", "右侧脸有颗粒感"],
            summary="左侧脸和右侧脸都有变化。",
        ),
        "left_face",
    )

    assert result.facts is not None
    assert result.facts.main_locations == ["你的左侧脸"]
    assert result.facts.daily_appearance == ["左侧脸局部偏红"]
    assert "右侧" not in result.facts.summary
    assert result.changed is True
    assert validate_region_display(result.facts, "left_face") is result.facts


def test_region_sanitizer_returns_no_result_when_only_foreign_observations_remain() -> None:
    result = sanitize_region_facts(
        _facts(
            main_locations=["右侧脸"],
            estimated_amount="无法判断",
            distribution="无法判断",
            coverage="无法判断",
            daily_appearance=["下巴偏红"],
            summary="右侧脸和下巴可见变化。",
        ),
        "left_face",
    )

    assert result.facts is None
    assert result.changed is True
