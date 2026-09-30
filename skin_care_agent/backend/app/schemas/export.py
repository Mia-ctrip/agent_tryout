from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.schemas.auth import ConsentStatusOut, UserOut


class ExportObservationTargetOut(BaseModel):
    scope_type: str
    region_id: Optional[str] = None
    status: str
    result_source: Optional[str] = None
    user_note: Optional[str] = None
    facts: Optional[dict[str, Any]] = None
    completed_at: Optional[datetime] = None


class ExportObservationOut(BaseModel):
    observation_id: int
    recorded_at: datetime
    user_note: Optional[str] = None
    life_context: list[str]
    targets: list[ExportObservationTargetOut]


class ExportRegionEventOut(BaseModel):
    region_event_id: int
    region_id: str
    status: str
    started_local_date: date
    last_valid_local_date: Optional[date] = None
    ended_local_date: Optional[date] = None
    end_reason: Optional[str] = None


class ExportProductUseProductOut(BaseModel):
    name_snapshot: str
    brand_snapshot: Optional[str] = None


class ExportProductUseOut(BaseModel):
    product_use_id: int
    used_at: datetime
    note: Optional[str] = None
    products: list[ExportProductUseProductOut]


class ExportPersonalProductOut(BaseModel):
    product_id: int
    name: str
    standard_product_id: Optional[int] = None
    created_at: datetime


class DataExportOut(BaseModel):
    generated_at: datetime
    user: UserOut
    consents: list[ConsentStatusOut]
    observations: list[ExportObservationOut]
    region_events: list[ExportRegionEventOut]
    personal_products: list[ExportPersonalProductOut]
    product_uses: list[ExportProductUseOut]
