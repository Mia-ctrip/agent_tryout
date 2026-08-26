from __future__ import annotations

from sqlalchemy import CheckConstraint

from app.models.product_catalog import (
    CatalogImportBatch,
    ProductAssetCleanup,
    ProductImageAsset,
    StandardProduct,
    StandardProductAlias,
    StandardProductDocument,
)


def _checks(table: object) -> dict[str, str]:
    return {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints  # type: ignore[attr-defined]
        if isinstance(constraint, CheckConstraint)
    }


def test_standard_product_uses_formula_level_identity_and_current_image() -> None:
    product = StandardProduct(
        catalog_code="synthetic-cleanser-v1",
        brand_name="合成品牌",
        official_name="合成洁面",
        product_category="cleanser",
        formula_version="v1",
        regulatory_type="cosmetic",
        market_region="CN",
        primary_image_asset_id=7,
        status="active",
        import_batch_id=3,
    )

    assert product.catalog_code == "synthetic-cleanser-v1"
    assert product.regulatory_type == "cosmetic"
    table = StandardProduct.__table__
    assert {
        "catalog_code",
        "brand_name",
        "official_name",
        "normalized_brand_name",
        "normalized_official_name",
        "product_category",
        "formula_version",
        "primary_image_asset_id",
        "status",
        "import_batch_id",
    } <= {column.name for column in table.columns}
    checks = _checks(table)
    assert "ck_standard_products_nonblank_names" in checks
    assert "ck_standard_products_regulatory_type" in checks
    assert "ck_standard_products_status" in checks


def test_document_keeps_indications_source_and_version_separately() -> None:
    document = StandardProductDocument(
        standard_product_id=9,
        market_region="CN",
        language="zh-CN",
        document_version="2026-01",
        source_name="合成监管来源",
        source_url="https://invalid.example/fixture",
        indications_original_text="仅用于自动化测试的合成原文",
        content_sha256="a" * 64,
        is_current=True,
        import_batch_id=3,
    )

    assert document.indications_original_text.startswith("仅用于")
    table = StandardProductDocument.__table__
    assert {"source_name", "source_url", "document_version", "content_sha256"} <= {
        column.name for column in table.columns
    }
    assert "uq_standard_product_documents_version" in {
        constraint.name for constraint in table.constraints
    }
    assert any(
        index.name == "uq_standard_product_documents_current_region_language"
        and index.unique
        for index in table.indexes
    )


def test_catalog_assets_enforce_source_ownership_and_immutable_metadata() -> None:
    image_checks = _checks(ProductImageAsset.__table__)
    assert "ck_product_image_assets_source_owner" in image_checks
    assert "ck_product_image_assets_sha256" in image_checks
    assert "ck_product_image_assets_byte_size" in image_checks
    assert "ck_product_image_assets_dimensions" in image_checks
    assert ProductImageAsset.__table__.c.owner_user_id.nullable is True

    alias = StandardProductAlias.__table__
    assert "uq_standard_product_aliases_normalized" in {
        constraint.name for constraint in alias.constraints
    }
    assert CatalogImportBatch.__table__.c.manifest_sha256.nullable is False
    assert ProductAssetCleanup.__table__.c.storage_key.nullable is False
