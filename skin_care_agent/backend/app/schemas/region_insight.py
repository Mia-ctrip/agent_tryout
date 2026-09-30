"""Structured output for region comparison / stage trend (prompt sources in services/prompt)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


Item = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)]
# Prompts ask for <= 24 chars; a little slack avoids retries on punctuation/width drift.
Headline = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)]

Reliability = Literal["较高", "有限", "不足"]
EvidenceStrength = Literal["较明确", "有限", "无法可靠判断"]
ComparisonDimension = Literal[
    "visible_amount",
    "distribution",
    "coverage",
    "color_prominence",
    "elevation",
    "surface",
    "location_pattern",
]
OverallChange = Literal[
    "相关可见表现总体减少",
    "相关可见表现总体增加",
    "相关可见表现大致相近",
    "呈现混合变化",
    "无法可靠判断",
]
DimensionTrendValue = Literal[
    "总体减少", "总体增加", "大致稳定", "存在波动", "混合变化", "无法可靠判断"
]
OverallTrend = Literal[
    "相关可见表现总体减少",
    "相关可见表现总体增加",
    "相关可见表现大致稳定",
    "相关可见表现存在波动",
    "呈现混合变化",
    "无法可靠判断趋势",
]
TimepointSource = Literal["image", "stored_facts"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ComparisonReliability(_Strict):
    level: Reliability
    reasons: list[Item] = Field(max_length=6)
    comparable_dimensions: list[Item] = Field(max_length=8)
    limited_dimensions: list[Item] = Field(max_length=8)


class ComparisonSide(_Strict):
    main_locations: list[Item] = Field(max_length=6)
    estimated_amount: ShortText
    distribution: ShortText
    coverage: ShortText
    key_appearance: list[Item] = Field(max_length=6)


class ComparisonChange(_Strict):
    dimension: ComparisonDimension
    location: ShortText
    photo_a: ShortText
    photo_b: ShortText
    change: Item
    evidence_strength: EvidenceStrength


class RegionComparisonResult(_Strict):
    comparison_reliability: ComparisonReliability
    photo_a: ComparisonSide
    photo_b: ComparisonSide
    changes: list[ComparisonChange] = Field(max_length=8)
    overall_change: OverallChange
    headline: Headline
    unknowns: list[Item] = Field(max_length=6)
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=250)]


class SeriesReliability(_Strict):
    level: Reliability
    reasons: list[Item] = Field(max_length=6)
    usable_timepoints: list[Item] = Field(max_length=30)
    limited_timepoints: list[Item] = Field(max_length=30)


class TrendTimepointFact(_Strict):
    timepoint_id: Item
    local_date: ShortText
    source: TimepointSource
    main_locations: list[Item] = Field(max_length=4)
    estimated_amount: ShortText
    distribution: ShortText
    key_appearance: list[Item] = Field(max_length=4)
    quality_limits: list[Item] = Field(max_length=4)


class DimensionTrend(_Strict):
    trend: DimensionTrendValue
    evidence: list[Item] = Field(max_length=8)


class DimensionTrends(_Strict):
    visible_amount: DimensionTrend
    distribution: DimensionTrend
    coverage: DimensionTrend
    color_prominence: DimensionTrend
    elevation_and_surface: DimensionTrend
    location_pattern: DimensionTrend


class TrendPhase(_Strict):
    start_timepoint: Item
    end_timepoint: Item
    pattern: Item
    evidence: ShortText


class NotableTimepoint(_Strict):
    timepoint_id: Item
    reason: Item


class RegionTrendResult(_Strict):
    series_reliability: SeriesReliability
    timepoint_facts: list[TrendTimepointFact] = Field(max_length=30)
    dimension_trends: DimensionTrends
    phases: list[TrendPhase] = Field(max_length=4)
    notable_timepoints: list[NotableTimepoint] = Field(max_length=6)
    overall_trend: OverallTrend
    headline: Headline
    unknowns: list[Item] = Field(max_length=6)
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
