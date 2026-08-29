from __future__ import annotations

from datetime import date, datetime
from typing import Literal

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
    recorded_local_date: date
    photo: ObservationPhotoOut | None
    target: ObservationTargetOut
    life_context_ids: list[LifeContextId]
    life_context_completed_at: datetime | None = None


class RegionEventDetailOut(RegionEventOut):
    timepoints: list[RegionEventTimepointOut]
