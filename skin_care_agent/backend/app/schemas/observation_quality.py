from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.domain.region_catalog import RegionId


ObservationQualityStatus = Literal["passed", "failed"]
ObservationQualityIssueCode = Literal[
    "face_not_found",
    "multiple_faces",
    "face_too_far",
    "face_too_close",
    "face_off_angle",
    "poor_lighting",
    "blurry",
    "occluded",
    "low_resolution",
]


class NormalizedPoint(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class ObservationRegionGeometry(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    region_id: RegionId
    points: tuple[NormalizedPoint, ...] = Field(min_length=6)


class ObservationQualityIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    code: ObservationQualityIssueCode
    message: str
    region_id: RegionId | None = None


class ObservationQualityOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    status: ObservationQualityStatus
    primary_issue: ObservationQualityIssue | None = None
    issues: list[ObservationQualityIssue]
    metrics: dict[str, Any]
    regions: list[ObservationRegionGeometry]
