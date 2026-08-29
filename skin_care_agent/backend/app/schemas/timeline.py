from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

from app.domain.region_catalog import RegionId
from app.schemas.observation import ObservationResultSource, ObservationTargetStatus
from app.schemas.product import ProductUseProductOut


class RegionEventTimelineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["region_event"] = "region_event"
    timeline_id: str
    occurred_at: datetime
    event_id: int
    region_id: RegionId
    status: Literal["current", "ended"]
    started_local_date: date
    last_valid_local_date: date
    timepoint_count: int
    sources: list[ObservationResultSource]


class FullFaceTimelineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["full_face_observation"] = "full_face_observation"
    timeline_id: str
    occurred_at: datetime
    observation_id: int
    recorded_at: datetime
    target_status: ObservationTargetStatus
    source: ObservationResultSource | None = None


class ProductUseTimelineItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["product_use"] = "product_use"
    timeline_id: str
    occurred_at: datetime
    product_use_id: int
    used_at: datetime
    products: list[ProductUseProductOut]
    note: str | None = None
    source: Literal["user_record"] = "user_record"


TimelineItem = Annotated[
    Union[RegionEventTimelineItem, FullFaceTimelineItem, ProductUseTimelineItem],
    Field(discriminator="kind"),
]
