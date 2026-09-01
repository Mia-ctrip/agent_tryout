from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.domain.life_context_catalog import LifeContextId, normalize_life_context_ids
from app.domain.region_catalog import RegionId
from app.schemas.full_face_observation import FullFaceObservationFacts


ObservationTargetStatus = Literal["queued", "processing", "completed", "needs_input"]
ObservationResultSource = Literal["photo_analysis", "user_record"]
ObservationNote = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]


class ObservationPhotoOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    photo_id: int
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    taken_at: datetime | None = None
    quality_status: Literal["passed", "failed"] | None = None
    quality_meta: dict[str, Any] | None = None
    url: str
    url_expires_at: datetime


class ObservationTargetOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    target_id: int
    scope_type: Literal["full_face", "region"]
    region_id: RegionId | None = None
    user_note: str | None = None
    status: ObservationTargetStatus
    result_source: ObservationResultSource | None = None
    facts: FullFaceObservationFacts | None = None
    completed_at: datetime | None = None


class ObservationOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    observation_id: int
    client_request_id: UUID
    recorded_at: datetime
    recorded_timezone_offset_minutes: int | None = None
    recorded_local_date: date | None = None
    status: Literal["saved"]
    created_at: datetime
    life_context_ids: list[LifeContextId] = Field(default_factory=list)
    life_context_completed_at: datetime | None = None
    photo: ObservationPhotoOut | None = None
    targets: list[ObservationTargetOut]


class RegionTargetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    region_id: RegionId
    user_note: ObservationNote | None = None
    event_decision: Literal["continue", "start_new"] | None = None


class ObservationNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_note: ObservationNote


class ObservationLifeContextUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context_ids: list[LifeContextId]

    @field_validator("context_ids")
    @classmethod
    def validate_context_ids(cls, values: list[LifeContextId]) -> list[LifeContextId]:
        return list(normalize_life_context_ids(values))
