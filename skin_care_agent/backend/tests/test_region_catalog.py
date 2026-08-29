from __future__ import annotations

import pytest

from app.domain.region_catalog import REGION_DEFINITIONS, REGION_IDS, normalize_region_ids


def test_region_catalog_uses_the_six_mvp_ids_in_display_order() -> None:
    assert REGION_IDS == (
        "forehead",
        "left_face",
        "right_face",
        "nose_area",
        "mouth_area",
        "chin",
    )
    assert [REGION_DEFINITIONS[region_id].label for region_id in REGION_IDS] == [
        "额头",
        "你的左侧脸",
        "你的右侧脸",
        "鼻周",
        "口周",
        "下巴",
    ]


def test_left_and_right_definitions_use_the_users_physical_direction() -> None:
    assert "用户本人真实左侧" in REGION_DEFINITIONS["left_face"].direction_note
    assert "用户本人真实右侧" in REGION_DEFINITIONS["right_face"].direction_note
    assert "镜像" in REGION_DEFINITIONS["left_face"].direction_note
    assert "镜像" in REGION_DEFINITIONS["right_face"].direction_note


@pytest.mark.parametrize(
    "region_ids",
    [
        [],
        ["forehead", "forehead"],
        ["other"],
        [
            "forehead",
            "left_face",
            "right_face",
            "nose_area",
            "mouth_area",
            "chin",
            "other",
        ],
    ],
)
def test_region_ids_reject_empty_duplicate_unknown_or_too_many_values(
    region_ids: list[str],
) -> None:
    with pytest.raises(ValueError):
        normalize_region_ids(region_ids)


def test_region_ids_are_normalized_to_catalog_order() -> None:
    assert normalize_region_ids(["chin", "forehead", "left_face"]) == (
        "forehead",
        "left_face",
        "chin",
    )
