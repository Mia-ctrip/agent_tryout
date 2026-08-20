from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


CheckInKind = Literal["quick", "standard"]
CheckInStatus = Literal["draft", "complete"]
PhotoViewType = Literal["front", "left", "right"]
CheckInAggregationStatus = Literal["empty", "partial", "ready"]
MenstrualPhase = Literal["pre_period", "during_period", "post_period", "not_in_period"]
DietTag = Literal["spicy", "sugary", "dairy", "fried", "alcohol"]
ProductName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=80),
]
DiaryNotes = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
]


class CheckInDiary(BaseModel):
    """用户主动填写的生活与产品记录；字段缺失表示当天未记录。"""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    sleep_quality: int | None = Field(default=None, ge=1, le=5)
    stress_level: int | None = Field(default=None, ge=1, le=5)
    menstrual_phase: MenstrualPhase | None = None
    diet_tags: list[DietTag] | None = Field(default=None, max_length=5)
    skincare_changed: bool | None = None
    new_skincare_products: list[ProductName] | None = Field(default=None, max_length=10)
    topical_products: list[ProductName] | None = Field(
        default=None,
        max_length=10,
        description="仅保存用户主动填写的外用产品或药品名称，不代表系统推荐",
    )
    notes: DiaryNotes | None = None

    @field_validator("diet_tags", "new_skincare_products", "topical_products")
    @classmethod
    def deduplicate_list(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        result: list[str] = []
        seen: set[str] = set()
        for item in value:
            key = item.casefold()
            if key not in seen:
                seen.add(key)
                result.append(item)
        return result


class CheckInCreate(BaseModel):
    observed_on: date
    kind: CheckInKind = "standard"
    diary: CheckInDiary | None = None
    client_request_id: UUID | None = None


class CheckInPhotoOut(BaseModel):
    photo_id: int
    view_type: PhotoViewType
    width: int | None = None
    height: int | None = None
    taken_at: datetime | None = None
    quality_status: str | None = None
    quality_meta: dict[str, Any] | None = None
    url: str
    url_expires_at: datetime


class CheckInViewAnalysisOut(BaseModel):
    view_type: PhotoViewType
    photo_id: int
    analysis_id: int
    analysis_created_at: datetime
    overall_severity: int | None = None
    skin_health_index: int | None = None
    needs_doctor: bool
    total_estimated_count: int
    region_estimated_counts: dict[str, int]


class CheckInAnalysisSummaryOut(BaseModel):
    check_in_id: int
    kind: CheckInKind
    check_in_status: CheckInStatus
    observed_on: date
    aggregation_status: CheckInAggregationStatus
    required_views: list[PhotoViewType]
    missing_photo_views: list[PhotoViewType]
    missing_analysis_views: list[PhotoViewType]
    photo_count: int
    analyzed_view_count: int
    overall_severity: int | None = None
    skin_health_index: float | None = None
    needs_doctor: bool = False
    total_estimated_count: int = 0
    region_estimated_counts: dict[str, int]
    latest_analysis_at: datetime | None = None
    diary: CheckInDiary | None = None
    view_summaries: list[CheckInViewAnalysisOut]


class CheckInOut(BaseModel):
    check_in_id: int
    client_request_id: UUID | None = None
    kind: CheckInKind
    status: CheckInStatus
    observed_on: date
    completed_at: datetime | None = None
    created_at: datetime
    diary: CheckInDiary | None = None
    diary_updated_at: datetime | None = None
    photo_count: int
    photos: list[CheckInPhotoOut]
