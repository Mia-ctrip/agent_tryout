from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.full_face_observation import (
    FullFaceObservationFacts,
    validate_full_face_display,
)
from app.schemas.observation import ObservationNoteUpdate, ObservationOut
from app.services.full_face_sanitizer import sanitize_full_face_facts
from app.services.full_face_prompt import (
    FULL_FACE_OBSERVATION_MOCK,
    FULL_FACE_OBSERVATION_PROMPT_VERSION,
    FULL_FACE_OBSERVATION_SCHEMA_VERSION,
    FULL_FACE_OBSERVATION_USER_PROMPT,
)


def _valid_facts(**overrides: object) -> dict[str, object]:
    facts: dict[str, object] = {
        "main_locations": [" 两颊 "],
        "estimated_amount": "约 3 至 5 处",
        "distribution": "散在分布",
        "coverage": "占全脸可见范围较小",
        "daily_appearance": ["可见少量偏红的小点"],
        "unknowns": ["照片无法支持触感判断"],
        "summary": "两颊可见少量散在变化。",
    }
    facts.update(overrides)
    return facts


def test_full_face_facts_accept_exact_seven_neutral_fields_and_strip_items() -> None:
    facts = FullFaceObservationFacts.model_validate(_valid_facts())

    assert set(facts.model_dump()) == {
        "main_locations",
        "estimated_amount",
        "distribution",
        "coverage",
        "daily_appearance",
        "unknowns",
        "summary",
    }
    assert facts.main_locations == ["两颊"]
    assert validate_full_face_display(facts) is facts


def test_full_face_facts_reject_extra_score_long_summary_and_blank_items() -> None:
    with pytest.raises(ValidationError):
        FullFaceObservationFacts.model_validate(_valid_facts(skin_score=80))
    with pytest.raises(ValidationError):
        FullFaceObservationFacts.model_validate(_valid_facts(summary="变" * 201))
    with pytest.raises(ValidationError):
        FullFaceObservationFacts.model_validate(_valid_facts(unknowns=["  "]))


@pytest.mark.parametrize(
    "unsafe_text",
    ["诊断为痤疮", "可见丘疹", "存在脓疱", "严重", "炎症程度", "治疗", "用药", "建议使用", "推荐产品", "疗效"],
)
def test_display_validation_rejects_medical_advice_or_effect_claims(unsafe_text: str) -> None:
    facts = FullFaceObservationFacts.model_validate(_valid_facts(summary=unsafe_text))

    with pytest.raises(ValueError, match="unsafe_output"):
        validate_full_face_display(facts)


def test_sanitizer_rewrites_medical_classification_and_preserves_safe_facts() -> None:
    facts = FullFaceObservationFacts.model_validate(
        _valid_facts(
            main_locations=["脸颊", "下巴"],
            estimated_amount="较多",
            distribution="散在",
            coverage="部分区域",
            daily_appearance=["红色丘疹", "皮肤表面不平整"],
            unknowns=["光线可能影响颜色判断"],
            summary="脸颊和下巴可见较多散在红色丘疹。",
        )
    )

    result = sanitize_full_face_facts(facts)

    assert result.changed is True
    assert result.facts.main_locations == ["脸颊", "下巴"]
    assert result.facts.estimated_amount == "较多"
    assert result.facts.daily_appearance == ["红色小范围凸起", "皮肤表面不平整"]
    assert result.facts.summary == (
        "脸颊、下巴可见较多、散在的外观变化，主要表现为红色小范围凸起、皮肤表面不平整，"
        "覆盖部分区域。"
    )
    assert result.warnings == [
        {
            "field": "daily_appearance",
            "action": "rewrite_medical_term",
            "term": "丘疹",
        },
        {
            "field": "summary",
            "action": "rebuild_from_sanitized_facts",
            "term": "丘疹",
        },
    ]
    assert validate_full_face_display(result.facts) is result.facts


def test_sanitizer_drops_advice_and_keeps_a_non_empty_neutral_result() -> None:
    facts = FullFaceObservationFacts.model_validate(
        _valid_facts(
            daily_appearance=["建议使用某产品", "局部偏红"],
            unknowns=["推荐产品需要结合皮肤类型"],
            summary="建议使用某产品治疗。",
        )
    )

    result = sanitize_full_face_facts(facts)

    assert result.facts.daily_appearance == ["局部偏红"]
    assert result.facts.unknowns == ["单张照片无法支持触感和持续时间判断"]
    assert result.facts.summary == (
        "两颊可见约 3 至 5 处、散在分布的外观变化，主要表现为局部偏红，"
        "覆盖占全脸可见范围较小。"
    )
    assert result.changed is True
    assert validate_full_face_display(result.facts) is result.facts


def test_observation_http_contract_keeps_legacy_full_face_target_and_hides_failure() -> None:
    now = datetime(2026, 8, 21, tzinfo=timezone.utc)
    output = ObservationOut.model_validate(
        {
            "observation_id": 11,
            "client_request_id": UUID("11111111-1111-4111-8111-111111111111"),
            "recorded_at": now,
            "status": "saved",
            "created_at": now,
            "photo": None,
            "targets": [
                {
                    "target_id": 21,
                    "scope_type": "full_face",
                    "region_id": None,
                    "user_note": None,
                    "status": "needs_input",
                    "result_source": None,
                    "facts": None,
                    "completed_at": None,
                }
            ],
        }
    )

    target = output.targets[0]
    assert target.region_id is None
    assert "failure_code" not in target.model_dump()
    with pytest.raises(ValidationError):
        target.model_copy(update={"region_id": "left_cheek"}, deep=True).__class__.model_validate(
            {**target.model_dump(), "region_id": "left_cheek"}
        )


def test_note_replacement_trims_and_requires_one_to_500_characters() -> None:
    assert ObservationNoteUpdate(user_note="  今天偏红  ").user_note == "今天偏红"
    with pytest.raises(ValidationError):
        ObservationNoteUpdate(user_note="  ")
    with pytest.raises(ValidationError):
        ObservationNoteUpdate(user_note="字" * 501)


def test_versioned_prompt_and_mock_use_the_neutral_contract() -> None:
    assert FULL_FACE_OBSERVATION_PROMPT_VERSION == "full-face-observation-1.2.0"
    assert FULL_FACE_OBSERVATION_SCHEMA_VERSION == "full-face-observation-1.0.0"
    assert FULL_FACE_OBSERVATION_USER_PROMPT == "请只整理这张全脸照片能够直接支持的可见外观事实。"
    assert set(FULL_FACE_OBSERVATION_MOCK) == set(_valid_facts())
    facts = FullFaceObservationFacts.model_validate(FULL_FACE_OBSERVATION_MOCK)
    assert validate_full_face_display(facts) is facts
