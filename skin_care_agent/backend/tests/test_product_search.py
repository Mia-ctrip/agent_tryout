from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.product_catalog import (
    ProductFromStandardCreate,
    StandardProductDetailOut,
    StandardProductDocumentOut,
)
from app.services.product_service import normalize_display_override
from app.services.product_search_service import (
    SearchCursor,
    decode_search_cursor,
    encode_search_cursor,
    normalize_product_search_query,
)


def test_search_normalization_handles_full_width_case_spacing_and_punctuation() -> None:
    assert normalize_product_search_query("  Ｓｙｎｔｈｅｔｉｃ， Cleanser！ ") == "syntheticcleanser"


def test_search_cursor_round_trips_all_stable_sort_fields() -> None:
    cursor = SearchCursor(bucket=4, similarity=0.625, source_order=1, stable_id=83)

    encoded = encode_search_cursor(cursor)

    assert encoded.isascii()
    assert "+" not in encoded and "/" not in encoded and "=" not in encoded
    assert decode_search_cursor(encoded) == cursor


@pytest.mark.parametrize(
    "cursor",
    ["not-base64", "e30", "eyJ2IjoyfQ"],
)
def test_search_cursor_rejects_malformed_or_incomplete_values(cursor: str) -> None:
    with pytest.raises(HTTPException) as error:
        decode_search_cursor(cursor)

    assert error.value.status_code == 400
    assert error.value.detail == "invalid search cursor"


def test_standard_detail_contract_keeps_only_original_document_fields() -> None:
    document = StandardProductDocumentOut(
        document_id=17,
        market_region="CN",
        language="zh-CN",
        regulatory_type="drug",
        document_version="2026-01",
        effective_date=date(2026, 1, 1),
        registration_number="SYN-DRUG-001",
        source_name="合成监管来源",
        source_url="https://invalid.example/fixture",
        indications_original_text="仅用于自动化测试的合成适应症原文",
        content_sha256="a" * 64,
        original_document_url=None,
        original_document_expires_at=None,
    )
    detail = StandardProductDetailOut(
        standard_product_id=8,
        catalog_code="synthetic-drug-v1",
        brand_name="合成药品品牌",
        official_name="合成药品凝胶",
        product_category="topical_gel",
        formula_version="v1",
        key_strength="1% synthetic",
        regulatory_type="drug",
        registration_number="SYN-DRUG-001",
        market_region="CN",
        status="active",
        image_url=None,
        image_expires_at=None,
        current_document=document,
    )

    payload = detail.model_dump()
    assert payload["current_document"]["indications_original_text"].startswith("仅用于")
    assert "summary" not in payload["current_document"]
    assert "recommendation" not in payload

    with pytest.raises(ValidationError):
        StandardProductDocumentOut(**document.model_dump(), summary="不得出现")


def test_cabinet_from_standard_request_rejects_nonpositive_product_id_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        ProductFromStandardCreate(
            client_request_id="1c84a717-2ae0-4d6a-8be3-1bb2f53e01ca",
            standard_product_id=0,
            display_name_override=None,
        )
    with pytest.raises(ValidationError):
        ProductFromStandardCreate(
            client_request_id="1c84a717-2ae0-4d6a-8be3-1bb2f53e01ca",
            standard_product_id=8,
            display_name_override=None,
            recommendation="不得出现",
        )


def test_cabinet_display_override_is_trimmed_or_absent() -> None:
    assert normalize_display_override(None) is None
    assert normalize_display_override("  我的洁面  ") == "我的洁面"


@pytest.mark.parametrize("value", ["   ", "长" * 121])
def test_cabinet_display_override_rejects_blank_or_long_values(value: str) -> None:
    with pytest.raises(HTTPException) as error:
        normalize_display_override(value)

    assert error.value.status_code == 422
