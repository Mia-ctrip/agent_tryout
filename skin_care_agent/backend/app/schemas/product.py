from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator


ProductName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=120),
]
ProductUseNote = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=500),
]


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID
    name: ProductName


class ProductOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    product_id: int
    client_request_id: UUID
    name: str
    created_at: datetime
    use_count: int = 0
    last_used_at: datetime | None = None
    source_type: Literal["custom", "standard"] = "custom"
    standard_product_id: int | None = None
    brand_name: str | None = None
    formula_version: str | None = None
    regulatory_type: Literal["cosmetic", "drug", "medical_device"] | None = None
    image_url: str | None = None
    image_expires_at: datetime | None = None


class ProductUseProductOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    product_id: int
    name: str
    brand_name: str | None = None
    formula_version: str | None = None
    image_asset_id: int | None = None
    document_id: int | None = None
    document_version: str | None = None
    image_url: str | None = None
    image_expires_at: datetime | None = None


class ProductUseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID
    used_at: datetime
    used_timezone_offset_minutes: int = Field(ge=-840, le=840)
    product_ids: list[int] = Field(default_factory=list, max_length=50)
    note: ProductUseNote | None = None

    @field_validator("used_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("used_at must include a timezone")
        return value

    @field_validator("product_ids")
    @classmethod
    def require_distinct_positive_ids(cls, values: list[int]) -> list[int]:
        if any(value <= 0 for value in values):
            raise ValueError("product_ids must be positive")
        if len(set(values)) != len(values):
            raise ValueError("product_ids must not contain duplicates")
        return values

    @field_validator("note", mode="before")
    @classmethod
    def blank_note_is_absent(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value


class ProductUseOut(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    product_use_id: int
    client_request_id: UUID
    used_at: datetime
    used_timezone_offset_minutes: int
    note: str | None = None
    created_at: datetime
    products: list[ProductUseProductOut]


class ProductDetailOut(ProductOut):
    uses: list[ProductUseOut]
