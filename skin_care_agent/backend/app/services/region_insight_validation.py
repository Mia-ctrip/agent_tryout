"""Reference, consistency and compliance checks for region comparison / trend output.

Schema shape is enforced by Pydantic (`app.schemas.region_insight`); these checks cover
what a schema cannot: that every cited timepoint was really in the request, that `[图]`
is only claimed where an image was sent, that "insufficient" results carry no direction,
and that no evaluative, causal, medical or cross-region wording reaches the user.
Every failure raises ``ValueError("<code>[:detail]")`` so callers can retry once.
"""

from __future__ import annotations

import re
from typing import Any, Final, Iterable, Sequence

from app.domain.region_catalog import RegionId
from app.schemas.full_face_observation import _UNSAFE_DISPLAY_TERMS
from app.schemas.region_insight import DimensionTrend, RegionComparisonResult, RegionTrendResult
from app.schemas.region_observation import foreign_location_terms, non_skin_feature_term
from app.services.region_insight_prompt import TrendPromptTimepoint


_EVALUATIVE: Final = re.compile(
    r"改善|好转|变好|变差|恶化|恢复|复发|爆发|反弹|起效|治愈|健康|无效|(?<!无)有效(?!时间点|观察|记录)"
)
_IDENTITY_TRACKING: Final = re.compile(r"(这|那|该|同一)颗")
_CONTEXT_TERMS: Final = re.compile(
    r"产品|护肤品|药物|饮食|睡眠|熬夜|月经|经期|激素|生活方式|天气"
)
_EVIDENCE: Final = re.compile(r"^(T\d+)\[(图|记录)\][：:]")
_RECORD_ONLY_ALLOWED: Final = frozenset({"存在波动", "无法可靠判断"})
_COLOR_MIN_IMAGE_TIMEPOINTS: Final = 3


def _strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def _check_compliance(payload: dict[str, Any], region_id: RegionId) -> None:
    text = "\n".join(_strings(payload))
    folded = text.casefold()
    for term in _UNSAFE_DISPLAY_TERMS:
        if term.casefold() in folded:
            raise ValueError(f"unsafe_output:{term}")
    if match := _EVALUATIVE.search(text):
        raise ValueError(f"evaluative:{match.group(0)}")
    if match := _IDENTITY_TRACKING.search(text):
        raise ValueError(f"identity_tracking:{match.group(0)}")
    if match := _CONTEXT_TERMS.search(text):
        raise ValueError(f"context_reference:{match.group(0)}")
    for term in foreign_location_terms(region_id):
        if term.casefold() in folded:
            raise ValueError(f"outside_selected_region:{term}")
    if term := non_skin_feature_term(text):
        raise ValueError(f"unsafe_output:non_skin_feature:{term}")


def validate_comparison_result(
    result: RegionComparisonResult,
    region_id: RegionId,
) -> RegionComparisonResult:
    withheld = result.overall_change == "无法可靠判断"
    if result.comparison_reliability.level == "不足":
        if not withheld:
            raise ValueError("insufficient_requires_unknown")
    if withheld and result.headline:
        raise ValueError("headline_must_be_empty")
    if result.comparison_reliability.level == "不足" and any(
        change.evidence_strength == "较明确" for change in result.changes
    ):
        raise ValueError("insufficient_strong_evidence")
    _check_compliance(result.model_dump(), region_id)
    return result


def _parse_evidence(
    name: str,
    dimension: DimensionTrend,
    known: dict[str, TrendPromptTimepoint],
) -> list[tuple[str, str]]:
    parsed: list[tuple[str, str]] = []
    for item in dimension.evidence:
        match = _EVIDENCE.match(item)
        if match is None:
            raise ValueError(f"evidence_format:{name}")
        timepoint_id, source = match.group(1), match.group(2)
        point = known.get(timepoint_id)
        if point is None:
            raise ValueError(f"unknown_timepoint:{timepoint_id}")
        if source == "图" and point.image_index is None:
            raise ValueError(f"image_source_without_image:{timepoint_id}")
        parsed.append((timepoint_id, source))
    return parsed


def validate_trend_result(
    result: RegionTrendResult,
    points: Sequence[TrendPromptTimepoint],
    region_id: RegionId,
) -> RegionTrendResult:
    known = {point.timepoint_id: point for point in points}
    order = {point.timepoint_id: index for index, point in enumerate(points)}

    if [fact.timepoint_id for fact in result.timepoint_facts] != list(order):
        raise ValueError("timepoint_facts_mismatch")
    for fact in result.timepoint_facts:
        expected = "image" if known[fact.timepoint_id].image_index is not None else "stored_facts"
        if fact.source != expected:
            raise ValueError(f"source_mismatch:{fact.timepoint_id}")

    for name, dimension in result.dimension_trends:
        evidence = _parse_evidence(name, dimension, known)
        if dimension.trend != "无法可靠判断" and not evidence:
            raise ValueError(f"direction_without_evidence:{name}")
        if (
            evidence
            and all(source == "记录" for _, source in evidence)
            and dimension.trend not in _RECORD_ONLY_ALLOWED
        ):
            raise ValueError(f"record_only_direction:{name}")
        if name == "color_prominence" and dimension.trend != "无法可靠判断":
            images = {timepoint_id for timepoint_id, source in evidence if source == "图"}
            if len(images) < _COLOR_MIN_IMAGE_TIMEPOINTS:
                raise ValueError("color_requires_images")

    referenced = [
        *result.series_reliability.usable_timepoints,
        *result.series_reliability.limited_timepoints,
        *(item.timepoint_id for item in result.notable_timepoints),
    ]
    for phase in result.phases:
        referenced.extend((phase.start_timepoint, phase.end_timepoint))
    for timepoint_id in referenced:
        if timepoint_id not in known:
            raise ValueError(f"unknown_timepoint:{timepoint_id}")
    for phase in result.phases:
        if order[phase.start_timepoint] > order[phase.end_timepoint]:
            raise ValueError("phase_order")

    withheld = result.overall_trend == "无法可靠判断趋势"
    if result.series_reliability.level == "不足" and not withheld:
        raise ValueError("insufficient_requires_unknown")
    if withheld and result.headline:
        raise ValueError("headline_must_be_empty")

    _check_compliance(result.model_dump(), region_id)
    return result
