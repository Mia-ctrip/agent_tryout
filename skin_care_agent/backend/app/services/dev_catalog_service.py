from __future__ import annotations

import hashlib
import re
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product_catalog import (
    CatalogImportBatch,
    ProductImageAsset,
    StandardProduct,
    StandardProductAlias,
    StandardProductDocument,
)
from app.services.catalog_import_service import normalize_product_search_text
from app.services.product_image_service import ValidatedProductImage
from app.services.storage_service.factory import get_storage


_SOURCE_NAME = "development-form"


def get_product_for_request(db: Session, *, client_request_id: UUID) -> StandardProduct | None:
    return db.scalar(
        select(StandardProduct).where(
            StandardProduct.catalog_code == _catalog_code(client_request_id),
            StandardProduct.deleted_at.is_(None),
        )
    )


def create_cosmetic_product(
    db: Session,
    *,
    client_request_id: UUID,
    brand_name: str,
    official_name: str,
    product_category: str,
    formula_version: str,
    market_region: str,
    key_strength: str | None,
    instructions: str | None,
    search_keywords: str | None,
    image: ValidatedProductImage,
) -> tuple[StandardProduct, bool]:
    existing = get_product_for_request(db, client_request_id=client_request_id)
    if existing is not None:
        return existing, False

    brand_name = _required_text("brand_name", brand_name, 120)
    official_name = _required_text("official_name", official_name, 180)
    product_category = _required_text("product_category", product_category, 64)
    formula_version = _required_text("formula_version", formula_version, 120)
    market_region = _required_text("market_region", market_region, 16)
    key_strength = _optional_text("key_strength", key_strength, 80)
    instructions = _optional_text("instructions", instructions, 5000)
    aliases = _search_aliases(search_keywords)
    normalized_brand_name = normalize_product_search_text(brand_name)
    normalized_official_name = normalize_product_search_text(official_name)
    if not normalized_brand_name or not normalized_official_name:
        raise HTTPException(status_code=422, detail="product names must contain letters or numbers")

    storage_key = _storage_key(client_request_id, image.extension)
    storage = get_storage()
    storage_was_written = False
    try:
        if not storage.exists(storage_key):
            storage.put(storage_key, image.data, image.mime_type)
            storage_was_written = True

        batch = CatalogImportBatch(
            catalog_version=f"dev-form-{client_request_id}",
            manifest_sha256=_request_fingerprint(
                client_request_id=client_request_id,
                brand_name=brand_name,
                official_name=official_name,
                product_category=product_category,
                formula_version=formula_version,
                market_region=market_region,
                key_strength=key_strength,
                instructions=instructions,
                search_keywords="\x1f".join(aliases),
                image_sha256=image.sha256,
            ),
            source_name=_SOURCE_NAME,
        )
        image_asset = ProductImageAsset(
            storage_key=storage_key,
            mime_type=image.mime_type,
            byte_size=len(image.data),
            width=image.width,
            height=image.height,
            sha256=image.sha256,
            source_type="catalog",
            owner_user_id=None,
        )
        db.add_all([batch, image_asset])
        db.flush()
        product = StandardProduct(
            catalog_code=_catalog_code(client_request_id),
            brand_name=brand_name,
            official_name=official_name,
            normalized_brand_name=normalized_brand_name,
            normalized_official_name=normalized_official_name,
            product_category=product_category,
            formula_version=formula_version,
            key_strength=key_strength,
            regulatory_type="cosmetic",
            registration_number=None,
            market_region=market_region,
            primary_image_asset_id=image_asset.id,
            status="active",
            import_batch_id=batch.id,
        )
        db.add(product)
        db.flush()
        db.add_all(
            StandardProductAlias(
                standard_product_id=product.id,
                alias=alias,
                normalized_alias=normalize_product_search_text(alias),
                language="zh-CN",
                import_batch_id=batch.id,
            )
            for alias in aliases
        )
        if instructions is not None:
            db.add(
                StandardProductDocument(
                    standard_product_id=product.id,
                    market_region=market_region,
                    language="zh-CN",
                    regulatory_type="cosmetic",
                    document_version=f"dev-form-{client_request_id}",
                    effective_date=None,
                    registration_number=None,
                    source_name="本地体验表单",
                    source_url=f"dev-form://catalog/products/{client_request_id}",
                    indications_original_text=instructions,
                    source_document_storage_key=None,
                    content_sha256=hashlib.sha256(
                        instructions.encode("utf-8")
                    ).hexdigest(),
                    is_current=True,
                    archived_at=None,
                    import_batch_id=batch.id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        _delete_new_unreferenced_image(
            db,
            storage_key=storage_key,
            storage_was_written=storage_was_written,
        )
        existing = get_product_for_request(db, client_request_id=client_request_id)
        if existing is None:
            raise
        return existing, False
    except Exception:
        db.rollback()
        _delete_new_unreferenced_image(
            db,
            storage_key=storage_key,
            storage_was_written=storage_was_written,
        )
        raise
    db.refresh(product)
    return product, True


def _catalog_code(client_request_id: UUID) -> str:
    return f"dev-form-{client_request_id.hex}"


def _storage_key(client_request_id: UUID, extension: str) -> str:
    return f"product-images/catalog/dev-form/{client_request_id}.{extension}"


def _request_fingerprint(**fields: object) -> str:
    content = "\n".join(f"{key}={value or ''}" for key, value in sorted(fields.items()))
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _delete_new_unreferenced_image(
    db: Session,
    *,
    storage_key: str,
    storage_was_written: bool,
) -> None:
    if not storage_was_written:
        return
    try:
        asset_exists = db.scalar(
            select(ProductImageAsset.id).where(ProductImageAsset.storage_key == storage_key)
        )
    except Exception:
        return
    if asset_exists is None:
        get_storage().delete(storage_key)


def _required_text(field_name: str, value: str, maximum_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail=f"{field_name} must not be blank")
    if len(normalized) > maximum_length:
        raise HTTPException(status_code=422, detail=f"{field_name} is too long")
    return normalized


def _optional_text(field_name: str, value: str | None, maximum_length: int) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > maximum_length:
        raise HTTPException(status_code=422, detail=f"{field_name} is too long")
    return normalized


def _search_aliases(value: str | None) -> list[str]:
    if value is None:
        return []
    aliases: list[str] = []
    normalized_aliases: set[str] = set()
    for raw_alias in re.split(r"[,，;；\r\n]+", value):
        alias = raw_alias.strip()
        if not alias:
            continue
        if len(alias) > 240:
            raise HTTPException(status_code=422, detail="search keyword is too long")
        normalized_alias = normalize_product_search_text(alias)
        if not normalized_alias:
            raise HTTPException(
                status_code=422,
                detail="search keyword must contain letters or numbers",
            )
        if normalized_alias not in normalized_aliases:
            aliases.append(alias)
            normalized_aliases.add(normalized_alias)
    if len(aliases) > 20:
        raise HTTPException(status_code=422, detail="too many search keywords")
    return aliases
