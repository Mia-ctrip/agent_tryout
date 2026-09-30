"""Prompts for region comparison / stage trend.

Source of truth is `tools/vision-prompt-lab/prompt/skin_{compare,trend}.md`; the copies in
`app/services/prompt/` are loaded verbatim so lab iterations can be synced by copying the
file and bumping the version constant here. Placeholders are replaced by exact token, so
the JSON skeletons inside the prompt text never need brace escaping.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Final, Literal

from app.domain.region_catalog import REGION_DEFINITIONS, RegionId
from app.services.region_observation_prompt import _mouth_area_note


REGION_COMPARISON_PROMPT_VERSION: Final = "region-comparison-1.1.0"
REGION_COMPARISON_SCHEMA_VERSION: Final = "region-comparison-1.1.0"
REGION_TREND_PROMPT_VERSION: Final = "region-timeline-trend-2.0.0"
REGION_TREND_SCHEMA_VERSION: Final = "region-timeline-trend-2.0.0"

_PROMPT_DIR: Final = Path(__file__).with_name("prompt")
_SECTIONS: Final = ("## SYSTEM PROMPT", "## USER PROMPT", "## RETRY PROMPT")

CropMode = Literal["region_crop", "full_photo"]


@dataclass(frozen=True)
class TrendPromptTimepoint:
    timepoint_id: str
    local_date: str
    image_index: int | None
    crop: CropMode | None
    stored_facts: dict[str, Any] | None


@lru_cache
def _sections(filename: str) -> tuple[str, str, str]:
    text = (_PROMPT_DIR / filename).read_text(encoding="utf-8")
    positions = [text.index(marker) for marker in _SECTIONS]
    if positions != sorted(positions):
        raise RuntimeError(f"{filename}: prompt sections out of order")
    bounds = [*positions, len(text)]
    parts = []
    for index, marker in enumerate(_SECTIONS):
        body = text[bounds[index] + len(marker) : bounds[index + 1]].strip()
        parts.append(body.removesuffix("---").strip())
    return parts[0], parts[1], parts[2]


def _fill(template: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        template = template.replace("{" + key + "}", value)
    return template


def _region_values(region_id: RegionId) -> dict[str, str]:
    definition = REGION_DEFINITIONS[region_id]
    return {
        "region_id": region_id,
        "region_label": definition.label,
        "region_direction_note": definition.direction_note,
    }


def build_comparison_messages_text(
    region_id: RegionId,
    *,
    photo_a_id: str,
    photo_a_time: str,
    photo_a_crop: CropMode,
    photo_b_id: str,
    photo_b_time: str,
    photo_b_crop: CropMode,
) -> tuple[str, str, str]:
    system, user, retry = _sections("skin_compare.md")
    values = {
        **_region_values(region_id),
        "photo_a_id": photo_a_id,
        "photo_a_time": photo_a_time,
        "photo_a_crop": photo_a_crop,
        "photo_b_id": photo_b_id,
        "photo_b_time": photo_b_time,
        "photo_b_crop": photo_b_crop,
    }
    return _fill(system, values) + _mouth_area_note(region_id), _fill(user, values), retry


def build_trend_messages_text(
    region_id: RegionId,
    points: list[TrendPromptTimepoint],
    *,
    window_start_date: str,
    window_end_date: str,
) -> tuple[str, str, str]:
    system, user, retry = _sections("skin_trend.md")
    metadata = json.dumps([asdict(point) for point in points], ensure_ascii=False, indent=1)
    values = {
        **_region_values(region_id),
        "timepoint_metadata": metadata,
        "window_start_date": window_start_date,
        "window_end_date": window_end_date,
    }
    return _fill(system, values) + _mouth_area_note(region_id), _fill(user, values), retry


def comparison_mock_result() -> dict[str, Any]:
    side = {
        "main_locations": ["中央偏左"],
        "estimated_amount": "约 3 处",
        "distribution": "主要集中于中央偏左",
        "coverage": "占可见范围较小",
        "key_appearance": ["浅红小范围隆起"],
    }
    return {
        "comparison_reliability": {
            "level": "有限",
            "reasons": ["两张照片曝光略有差异"],
            "comparable_dimensions": ["visible_amount", "distribution"],
            "limited_dimensions": ["color_prominence"],
        },
        "photo_a": side,
        "photo_b": {**side, "estimated_amount": "约 2 处"},
        "changes": [
            {
                "dimension": "visible_amount",
                "location": "中央偏左",
                "photo_a": "约 3 处",
                "photo_b": "约 2 处",
                "change": "B 中清晰可见的隆起样变化较 A 少",
                "evidence_strength": "有限",
            }
        ],
        "overall_change": "相关可见表现大致相近",
        "headline": "可见数量相近，分布位置相同",
        "unknowns": ["曝光差异使颜色不宜直接比较"],
        "summary": "两张照片目标区域可见范围接近，数量与分布可粗略比较；主要聚集位置均在中央偏左。"
        "B 图曝光略高，颜色不宜直接比较。",
    }


def trend_mock_result(points: list[TrendPromptTimepoint]) -> dict[str, Any]:
    def tag(point: TrendPromptTimepoint) -> str:
        return f"{point.timepoint_id}[{'图' if point.image_index is not None else '记录'}]"

    first, last = points[0], points[-1]
    unknown = {"trend": "无法可靠判断", "evidence": []}
    return {
        "series_reliability": {
            "level": "有限",
            "reasons": ["部分时间点只有已存事实"],
            "usable_timepoints": [p.timepoint_id for p in points if p.image_index is not None],
            "limited_timepoints": [p.timepoint_id for p in points if p.image_index is None],
        },
        "timepoint_facts": [
            {
                "timepoint_id": point.timepoint_id,
                "local_date": point.local_date,
                "source": "image" if point.image_index is not None else "stored_facts",
                "main_locations": ["中央偏左"],
                "estimated_amount": "约 3 处",
                "distribution": "集中",
                "key_appearance": [],
                "quality_limits": [],
            }
            for point in points
        ],
        "dimension_trends": {
            "visible_amount": {
                "trend": "大致稳定",
                "evidence": [f"{tag(first)}：约 3 处", f"{tag(last)}：约 3 处"],
            },
            "distribution": {"trend": "大致稳定", "evidence": [f"{tag(first)}：集中"]},
            "coverage": dict(unknown),
            "color_prominence": dict(unknown),
            "elevation_and_surface": dict(unknown),
            "location_pattern": {"trend": "大致稳定", "evidence": [f"{tag(last)}：中央偏左"]},
        },
        "phases": [],
        "notable_timepoints": [],
        "overall_trend": "相关可见表现大致稳定",
        "headline": "可见表现大致稳定",
        "unknowns": [],
        "summary": "时间窗口内可见数量与分布大致稳定，主要聚集位置未见明显改变。",
    }
