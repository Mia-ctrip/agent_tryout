from __future__ import annotations

from uuid import uuid4

from app.models.product import PersonalProduct, ProductUse, ProductUseProduct
from app.schemas.product import ProductUseProductOut


def test_personal_product_keeps_user_scoped_idempotency_and_a_plain_name() -> None:
    table = PersonalProduct.__table__

    assert table.name == "personal_products"
    assert {"id", "user_id", "client_request_id", "name", "created_at", "deleted_at"} <= {
        column.name for column in table.columns
    }
    unique_indexes = {
        tuple(column.name for column in index.columns) for index in table.indexes if index.unique
    }
    assert ("user_id", "client_request_id") in unique_indexes
    assert "brand" not in table.columns
    assert "platform_product_id" not in table.columns


def test_product_use_supports_real_time_optional_note_and_idempotency() -> None:
    table = ProductUse.__table__

    assert table.name == "product_uses"
    assert {
        "id",
        "user_id",
        "client_request_id",
        "used_at",
        "used_timezone_offset_minutes",
        "note",
        "created_at",
        "deleted_at",
    } <= {column.name for column in table.columns}
    unique_indexes = {
        tuple(column.name for column in index.columns) for index in table.indexes if index.unique
    }
    assert ("user_id", "client_request_id") in unique_indexes


def test_product_use_products_is_an_optional_many_to_many_association() -> None:
    table = ProductUseProduct.__table__

    assert table.name == "product_use_products"
    assert [column.name for column in table.primary_key.columns] == [
        "product_use_id",
        "product_id",
    ]
    foreign_keys = {
        (foreign_key.parent.name, foreign_key.target_fullname, foreign_key.ondelete)
        for foreign_key in table.foreign_keys
    }
    assert foreign_keys == {
        ("product_use_id", "product_uses.id", "CASCADE"),
        ("product_id", "personal_products.id", "CASCADE"),
        ("image_asset_id_snapshot", "product_image_assets.id", "RESTRICT"),
        ("document_id_snapshot", "standard_product_documents.id", "RESTRICT"),
    }


def test_personal_product_may_reference_standard_or_remain_custom() -> None:
    linked = PersonalProduct(
        user_id=1,
        client_request_id=uuid4(),
        name="加入时名称",
        normalized_name="加入时名称",
        standard_product_id=8,
    )
    custom = PersonalProduct(
        user_id=1,
        client_request_id=uuid4(),
        name="我的自建产品",
        normalized_name="我的自建产品",
        standard_product_id=None,
    )

    assert linked.standard_product_id == 8
    assert custom.standard_product_id is None


def test_use_association_carries_historical_snapshot() -> None:
    link = ProductUseProduct(
        product_use_id=2,
        product_id=3,
        name_snapshot="合成产品旧名",
        brand_snapshot="合成品牌",
        formula_version_snapshot="v1",
        image_asset_id_snapshot=4,
        document_id_snapshot=5,
    )

    assert link.name_snapshot == "合成产品旧名"


def test_product_use_response_exposes_immutable_product_snapshot_metadata() -> None:
    item = ProductUseProductOut(
        product_id=3,
        name="合成产品旧名",
        brand_name="合成品牌",
        formula_version="v1",
        image_asset_id=4,
        document_id=5,
        document_version="2026-01",
        image_url="https://storage.invalid/product-images/catalog/v1.png",
        image_expires_at=None,
    )

    assert item.model_dump() == {
        "product_id": 3,
        "name": "合成产品旧名",
        "brand_name": "合成品牌",
        "formula_version": "v1",
        "image_asset_id": 4,
        "document_id": 5,
        "document_version": "2026-01",
        "image_url": "https://storage.invalid/product-images/catalog/v1.png",
        "image_expires_at": None,
    }
