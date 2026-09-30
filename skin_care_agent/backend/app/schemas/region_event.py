from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.region_catalog import RegionId, normalize_region_ids
from app.domain.life_context_catalog import LifeContextId
from app.schemas.observation import ObservationPhotoOut, ObservationTargetOut


RegionEventAction = Literal["auto_new", "auto_continue", "choice_required"]
RegionEventDecision = Literal["continue", "start_new"]


class RegionEventPreviewOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_id: RegionId
    action: RegionEventAction
    event_id: int | None = None
    event_status: Literal["pending", "current"] | None = None
    last_valid_local_date: date | None = None
    days_since_last: int | None = None


class RegionEventOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: int
    region_id: RegionId
    status: Literal["current", "ended"]
    started_local_date: date
    last_valid_local_date: date
    ended_local_date: date | None = None
    ended_at: datetime | None = None


class RegionEventPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_ids: list[RegionId]
    recorded_at: datetime
    recorded_timezone_offset_minutes: int

    @field_validator("region_ids")
    @classmethod
    def validate_region_ids(cls, values: list[RegionId]) -> list[RegionId]:
        return list(normalize_region_ids(values))


class RegionEventEndRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ended_at: datetime
    timezone_offset_minutes: int


class RegionEventTimepointOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observation_id: int
    recorded_at: datetime
    recorded_timezone_offset_minutes: int | None = None
    recorded_local_date: date
    photo: ObservationPhotoOut | None
    target: ObservationTargetOut
    life_context_ids: list[LifeContextId]
    life_context_completed_at: datetime | None = None


class RegionEventDetailOut(RegionEventOut):
    timepoints: list[RegionEventTimepointOut]


InsightStatus = Literal["processing", "completed", "degraded", "failed"]


class InsightTimepointRef(BaseModel):
    """Maps the model's T-ids back to real timepoints; never contains facts or photos."""

    model_config = ConfigDict(extra="ignore")

    timepoint_id: str
    target_id: int
    observation_id: int
    local_date: date
    image_index: int | None = None
    crop: Literal["region_crop", "full_photo"] | None = None


class RegionComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    earlier_target_id: int
    later_target_id: int


class RegionComparisonOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comparison_id: int
    event_id: int
    region_id: RegionId
    status: InsightStatus
    earlier_target_id: int
    later_target_id: int
    timepoints: list[InsightTimepointRef]
    result: dict[str, Any] | None = None
    failure_code: str | None = None
    prompt_version: str
    schema_version: str
    model: str | None = None
    completed_at: datetime | None = None


class RegionTrendProgressOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: int
    span_days: int
    eligible: bool
    missing_days: int
    missing_span_days: int
    window_start_date: date | None = None
    window_end_date: date | None = None


class RegionTrendOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trend_id: int
    status: InsightStatus
    timepoints: list[InsightTimepointRef]
    result: dict[str, Any] | None = None
    failure_code: str | None = None
    prompt_version: str
    schema_version: str
    model: str | None = None
    completed_at: datetime | None = None


class RegionInsightsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: int
    region_id: RegionId
    photo_timepoint_count: int
    comparison_eligible: bool
    default_pair: tuple[int, int] | None = None
    trend_progress: RegionTrendProgressOut
    # locked: below threshold; stale: eligible but current window has no attempt yet;
    # processing / failed: state of the current window's attempt; ready: published.
    trend_status: Literal["locked", "stale", "processing", "failed", "ready"]
    trend: RegionTrendOut | None = None
    trend_is_current: bool = False
