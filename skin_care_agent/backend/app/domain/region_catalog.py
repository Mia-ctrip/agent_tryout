from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal, cast


RegionId = Literal[
    "forehead",
    "left_face",
    "right_face",
    "nose_area",
    "mouth_area",
    "chin",
]

REGION_IDS: tuple[RegionId, ...] = (
    "forehead",
    "left_face",
    "right_face",
    "nose_area",
    "mouth_area",
    "chin",
)


@dataclass(frozen=True)
class RegionDefinition:
    region_id: RegionId
    label: str
    direction_note: str


REGION_DEFINITIONS: dict[RegionId, RegionDefinition] = {
    "forehead": RegionDefinition("forehead", "额头", "面部中央上方的额头区域"),
    "left_face": RegionDefinition(
        "left_face",
        "你的左侧脸",
        "用户本人真实左侧；自拍预览是否镜像都不改变这个方向",
    ),
    "right_face": RegionDefinition(
        "right_face",
        "你的右侧脸",
        "用户本人真实右侧；自拍预览是否镜像都不改变这个方向",
    ),
    "nose_area": RegionDefinition("nose_area", "鼻周", "鼻部及紧邻鼻翼范围"),
    "mouth_area": RegionDefinition("mouth_area", "口周", "嘴唇、嘴角及周围范围"),
    "chin": RegionDefinition("chin", "下巴", "下唇下方至下巴下缘中央"),
}


def normalize_region_ids(values: Iterable[str]) -> tuple[RegionId, ...]:
    received = tuple(values)
    if not 1 <= len(received) <= len(REGION_IDS):
        raise ValueError("select one to six regions")
    if len(set(received)) != len(received):
        raise ValueError("region IDs must be unique")
    if any(value not in REGION_IDS for value in received):
        raise ValueError("unsupported region ID")
    selected = set(received)
    return tuple(cast(RegionId, region_id) for region_id in REGION_IDS if region_id in selected)
