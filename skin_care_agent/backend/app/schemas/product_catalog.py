from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


RegulatoryType = Literal["cosmetic", "drug", "medical_device"]
ProductMatchType = Literal[
    "personal_exact",
    "standard_exact",
    "standard_alias",
    "prefix",
    "contains",
    "fuzzy",
]


class ProductFromStandardCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_request_id: UUID
    standard_product_id: int = Field(gt=0)
    display_name_override: str | None = None


class ProductSearchItemOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: Literal["personal", "standard"]
    match_type: ProductMatchType
    personal_product_id: int | None
    standard_product_id: int | None
    name: str
    brand_name: str | None
    formula_version: str | None
    product_category: str | None
    regulatory_type: RegulatoryType | None
    image_url: str | None
    image_expires_at: datetime | None
    in_cabinet: bool


class ProductSearchPageOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ProductSearchItemOut]
    next_cursor: str | None


class StandardProductDocumentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: int
    market_region: str
    language: str
    regulatory_type: RegulatoryType
    document_version: str
    effective_date: date | None
    registration_number: str | None
    source_name: str
    source_url: str
    indications_original_text: str | None
    content_sha256: str
    original_document_url: str | None
    original_document_expires_at: datetime | None


class StandardProductDetailOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    standard_product_id: int
    catalog_code: str
    brand_name: str
    official_name: str
    product_category: str
    formula_version: str
    key_strength: str | None
    regulatory_type: RegulatoryType
    registration_number: str | None
    market_region: str
    status: Literal["active", "inactive"]
    image_url: str | None
    image_expires_at: datetime | None
    current_document: StandardProductDocumentOut | None
