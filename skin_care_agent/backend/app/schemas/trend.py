from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel


class DailyPoint(BaseModel):
    day: date
    source: Literal["check_in", "legacy"] | None = None
    check_in_id: int | None = None
    overall_severity: float | None = None
    skin_health_index: float | None = None
    total_estimated_count: int = 0
    analysis_count: int = 0
    check_in_count: int = 0


class RegionSummary(BaseModel):
    view_type: str = "legacy"
    region: str
    active_lineage_count: int
    dormant_lineage_count: int
    healed_lineage_count: int
    latest_dominant_type: str | None = None
    latest_coverage: str | None = None


class TrendSummaryOut(BaseModel):
    range_days: int
    start_date: date
    end_date: date
    total_analyses: int
    total_check_ins: int
    incomplete_check_ins: int
    superseded_check_ins: int
    total_legacy_records: int
    total_active_lineages: int
    total_new_lineages_in_range: int
    total_healed_lineages_in_range: int
    daily_points: list[DailyPoint]
    region_summaries: list[RegionSummary]
    highlights: list[str]
