from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
import unicodedata
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.product import PersonalProduct, ProductUse, ProductUseProduct
from app.models.product_catalog import (
    ProductImageAsset,
    StandardProduct,
    StandardProductDocument,
)
from app.schemas.product import (
    ProductDetailOut,
    ProductOut,
    ProductUseOut,
    ProductUseProductOut,
)
from app.services.product_image_service import ValidatedProductImage, user_product_image_key
from app.services.storage_service.factory import get_storage


def _find_product_by_request(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
) -> PersonalProduct | None:
    return db.scalar(
        select(PersonalProduct).where(
            PersonalProduct.user_id == user_id,
            PersonalProduct.client_request_id == client_request_id,
            PersonalProduct.deleted_at.is_(None),
        )
    )


def _find_use_by_request(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
) -> ProductUse | None:
    return db.scalar(
        select(ProductUse).where(
            ProductUse.user_id == user_id,
            ProductUse.client_request_id == client_request_id,
            ProductUse.deleted_at.is_(None),
        )
    )


def get_product_for_request(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
) -> ProductOut | None:
    product = _find_product_by_request(
        db,
        user_id=user_id,
        client_request_id=client_request_id,
    )
    if product is None:
        return None
    return _product_out(db, product)


def normalize_personal_product_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())[:180]


def _normalize_custom_product_name(value: str) -> str:
    name = value.strip()
    if not name:
        raise HTTPException(status_code=422, detail="product name must not be blank")
    if len(name) > 120:
        raise HTTPException(status_code=422, detail="product name must be at most 120 characters")
    return name


def normalize_display_override(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        raise HTTPException(status_code=422, detail="display name must not be blank")
    if len(normalized) > 120:
        raise HTTPException(
            status_code=422,
            detail="display name must be at most 120 characters",
        )
    return normalized


@dataclass(frozen=True)
class ResolvedProductSnapshot:
    product_id: int
    name: str
    brand_name: str | None
    formula_version: str | None
    image_asset_id: int | None
    document_id: int | None


def resolve_product_snapshot(
    db: Session,
    product: PersonalProduct,
) -> ResolvedProductSnapshot:
    if product.standard_product_id is None:
        return ResolvedProductSnapshot(
            product_id=product.id,
            name=product.display_name_override or product.name,
            brand_name=None,
            formula_version=None,
            image_asset_id=product.user_image_asset_id,
            document_id=None,
        )

    standard = db.get(StandardProduct, product.standard_product_id)
    if standard is None or standard.deleted_at is not None:
        raise HTTPException(status_code=409, detail="linked standard product is unavailable")
    document_id = db.scalar(
        select(StandardProductDocument.id)
        .where(
            StandardProductDocument.standard_product_id == standard.id,
            StandardProductDocument.is_current.is_(True),
            StandardProductDocument.archived_at.is_(None),
        )
        .order_by(StandardProductDocument.id.desc())
        .limit(1)
    )
    return ResolvedProductSnapshot(
        product_id=product.id,
        name=product.display_name_override or standard.official_name,
        brand_name=standard.brand_name,
        formula_version=standard.formula_version,
        image_asset_id=standard.primary_image_asset_id,
        document_id=document_id,
    )


def _delete_new_unreferenced_image(
    db: Session,
    *,
    storage_key: str | None,
    storage_was_written: bool,
) -> None:
    if not storage_was_written or storage_key is None:
        return
    try:
        asset_exists = db.scalar(
            select(ProductImageAsset.id).where(ProductImageAsset.storage_key == storage_key)
        )
    except Exception:
        return
    if asset_exists is None:
        get_storage().delete(storage_key)


def create_custom_product(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
    name: str,
    image: ValidatedProductImage | None,
) -> tuple[ProductOut, bool]:
    existing = _find_product_by_request(
        db,
        user_id=user_id,
        client_request_id=client_request_id,
    )
    if existing is not None:
        return _product_out(db, existing), False

    product_name = _normalize_custom_product_name(name)
    storage_key: str | None = None
    storage_was_written = False
    image_asset: ProductImageAsset | None = None
    storage = get_storage()
    product = PersonalProduct(
        user_id=user_id,
        client_request_id=client_request_id,
        name=product_name,
        normalized_name=normalize_personal_product_name(product_name),
    )
    try:
        if image is not None:
            storage_key = user_product_image_key(
                user_id=user_id,
                client_request_id=client_request_id,
                extension=image.extension,
            )
            if not storage.exists(storage_key):
                storage.put(storage_key, image.data, image.mime_type)
                storage_was_written = True
            image_asset = ProductImageAsset(
                storage_key=storage_key,
                mime_type=image.mime_type,
                byte_size=len(image.data),
                width=image.width,
                height=image.height,
                sha256=image.sha256,
                source_type="user",
                owner_user_id=user_id,
            )
            db.add(image_asset)
            db.flush()
            product.user_image_asset_id = image_asset.id
        db.add(product)
        db.commit()
    except IntegrityError:
        db.rollback()
        _delete_new_unreferenced_image(
            db,
            storage_key=storage_key,
            storage_was_written=storage_was_written,
        )
        existing = _find_product_by_request(
            db,
            user_id=user_id,
            client_request_id=client_request_id,
        )
        if existing is None:
            raise
        return _product_out(db, existing), False
    except Exception:
        db.rollback()
        _delete_new_unreferenced_image(
            db,
            storage_key=storage_key,
            storage_was_written=storage_was_written,
        )
        raise
    db.refresh(product)
    return _product_out(db, product), True


def create_product(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
    name: str,
) -> tuple[ProductOut, bool]:
    return create_custom_product(
        db,
        user_id=user_id,
        client_request_id=client_request_id,
        name=name,
        image=None,
    )


def add_standard_product_to_cabinet(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
    standard_product_id: int,
    display_name_override: str | None,
) -> tuple[PersonalProduct, bool]:
    request_match = _find_product_by_request(
        db,
        user_id=user_id,
        client_request_id=client_request_id,
    )
    if request_match is not None:
        return request_match, False

    standard = db.scalar(
        select(StandardProduct).where(
            StandardProduct.id == standard_product_id,
            StandardProduct.deleted_at.is_(None),
        )
    )
    if standard is None:
        raise HTTPException(status_code=404, detail="standard product not found")
    if standard.status != "active":
        raise HTTPException(status_code=409, detail="standard product is inactive")

    linked = db.scalar(
        select(PersonalProduct).where(
            PersonalProduct.user_id == user_id,
            PersonalProduct.standard_product_id == standard_product_id,
            PersonalProduct.deleted_at.is_(None),
        )
    )
    if linked is not None:
        return linked, False

    product = PersonalProduct(
        user_id=user_id,
        client_request_id=client_request_id,
        name=standard.official_name[:120],
        normalized_name=normalize_personal_product_name(standard.official_name),
        standard_product_id=standard.id,
        display_name_override=normalize_display_override(display_name_override),
    )
    db.add(product)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        winner = db.scalar(
            select(PersonalProduct).where(
                PersonalProduct.user_id == user_id,
                PersonalProduct.standard_product_id == standard_product_id,
                PersonalProduct.deleted_at.is_(None),
            )
        )
        if winner is None:
            winner = _find_product_by_request(
                db,
                user_id=user_id,
                client_request_id=client_request_id,
            )
        if winner is None:
            raise
        return winner, False
    db.refresh(product)
    return product, True


def _product_out(
    db: Session,
    product: PersonalProduct,
    *,
    use_count: int = 0,
    last_used_at=None,
) -> ProductOut:
    standard = None
    if product.standard_product_id is not None:
        standard = db.scalar(
            select(StandardProduct).where(
                StandardProduct.id == product.standard_product_id,
                StandardProduct.deleted_at.is_(None),
            )
        )
    name = (
        product.display_name_override
        or (standard.official_name if standard is not None else None)
        or product.name
    )
    image_url = None
    image_expires_at = None
    image_asset_id = (
        standard.primary_image_asset_id
        if standard is not None
        else product.user_image_asset_id
    )
    if image_asset_id is not None:
        asset = db.get(ProductImageAsset, image_asset_id)
        if (
            asset is not None
            and asset.deleted_at is None
            and asset.archived_at is None
            and (
                (asset.source_type == "catalog" and asset.owner_user_id is None)
                or (
                    asset.source_type == "user"
                    and asset.owner_user_id == product.user_id
                )
            )
        ):
            signed = get_storage().signed_url(asset.storage_key)
            image_url = signed.url
            image_expires_at = signed.expires_at
    return ProductOut(
        product_id=product.id,
        client_request_id=product.client_request_id,
        name=name,
        created_at=product.created_at,
        use_count=use_count,
        last_used_at=last_used_at,
        source_type="standard" if product.standard_product_id is not None else "custom",
        standard_product_id=product.standard_product_id,
        brand_name=standard.brand_name if standard is not None else None,
        formula_version=standard.formula_version if standard is not None else None,
        regulatory_type=standard.regulatory_type if standard is not None else None,
        image_url=image_url,
        image_expires_at=image_expires_at,
    )


def list_products(db: Session, *, user_id: int) -> list[ProductOut]:
    rows = db.execute(
        select(
            PersonalProduct,
            func.count(ProductUseProduct.product_use_id),
            func.max(ProductUse.used_at),
        )
        .outerjoin(
            ProductUseProduct,
            ProductUseProduct.product_id == PersonalProduct.id,
        )
        .outerjoin(
            ProductUse,
            and_(
                ProductUse.id == ProductUseProduct.product_use_id,
                ProductUse.deleted_at.is_(None),
            ),
        )
        .where(
            PersonalProduct.user_id == user_id,
            PersonalProduct.deleted_at.is_(None),
        )
        .group_by(PersonalProduct.id)
        .order_by(
            func.max(ProductUse.used_at).desc().nullslast(),
            PersonalProduct.created_at.desc(),
            PersonalProduct.id.desc(),
        )
    ).all()
    return [
        _product_out(db, product, use_count=int(use_count), last_used_at=last_used_at)
        for product, use_count, last_used_at in rows
    ]


def _load_use_products(
    db: Session,
    use_ids: Sequence[int],
) -> dict[int, list[ProductUseProduct]]:
    if not use_ids:
        return {}
    rows = db.execute(
        select(ProductUseProduct)
        .where(
            ProductUseProduct.product_use_id.in_(use_ids),
        )
        .order_by(ProductUseProduct.product_use_id, ProductUseProduct.product_id)
    ).all()
    grouped: dict[int, list[ProductUseProduct]] = {use_id: [] for use_id in use_ids}
    for (association,) in rows:
        grouped.setdefault(association.product_use_id, []).append(association)
    return grouped


def _snapshot_image_out(
    db: Session,
    *,
    image_asset_id: int | None,
    user_id: int,
) -> tuple[str | None, object | None]:
    if image_asset_id is None:
        return None, None
    asset = db.get(ProductImageAsset, image_asset_id)
    if (
        asset is None
        or asset.deleted_at is not None
        or (
            not (asset.source_type == "catalog" and asset.owner_user_id is None)
            and not (asset.source_type == "user" and asset.owner_user_id == user_id)
        )
    ):
        return None, None
    signed = get_storage().signed_url(asset.storage_key)
    return signed.url, signed.expires_at


def _use_out(
    db: Session,
    product_use: ProductUse,
    products: Sequence[ProductUseProduct],
) -> ProductUseOut:
    document_ids = {product.document_id_snapshot for product in products if product.document_id_snapshot}
    documents = {
        document.id: document
        for document in db.scalars(
            select(StandardProductDocument).where(StandardProductDocument.id.in_(document_ids))
        ).all()
    } if document_ids else {}
    return ProductUseOut(
        product_use_id=product_use.id,
        client_request_id=product_use.client_request_id,
        used_at=product_use.used_at,
        used_timezone_offset_minutes=product_use.used_timezone_offset_minutes,
        note=product_use.note,
        created_at=product_use.created_at,
        products=[
            ProductUseProductOut(
                product_id=product.product_id,
                name=product.name_snapshot,
                brand_name=product.brand_snapshot,
                formula_version=product.formula_version_snapshot,
                image_asset_id=product.image_asset_id_snapshot,
                document_id=product.document_id_snapshot,
                document_version=(
                    documents[product.document_id_snapshot].document_version
                    if product.document_id_snapshot in documents
                    else None
                ),
                image_url=_snapshot_image_out(
                    db,
                    image_asset_id=product.image_asset_id_snapshot,
                    user_id=product_use.user_id,
                )[0],
                image_expires_at=_snapshot_image_out(
                    db,
                    image_asset_id=product.image_asset_id_snapshot,
                    user_id=product_use.user_id,
                )[1],
            )
            for product in products
        ],
    )


def create_product_use(
    db: Session,
    *,
    user_id: int,
    client_request_id: UUID,
    used_at,
    used_timezone_offset_minutes: int,
    product_ids: list[int],
    note: str | None,
) -> tuple[ProductUseOut, bool]:
    existing = _find_use_by_request(
        db,
        user_id=user_id,
        client_request_id=client_request_id,
    )
    if existing is not None:
        products = _load_use_products(db, [existing.id]).get(existing.id, [])
        return _use_out(db, existing, products), False

    products: list[PersonalProduct] = []
    if product_ids:
        loaded = db.scalars(
            select(PersonalProduct).where(
                PersonalProduct.user_id == user_id,
                PersonalProduct.id.in_(product_ids),
                PersonalProduct.deleted_at.is_(None),
            )
        ).all()
        by_id = {product.id: product for product in loaded}
        if len(by_id) != len(product_ids):
            raise HTTPException(status_code=404, detail="product not found")
        products = [by_id[product_id] for product_id in product_ids]

    product_use = ProductUse(
        user_id=user_id,
        client_request_id=client_request_id,
        used_at=used_at,
        used_timezone_offset_minutes=used_timezone_offset_minutes,
        note=note.strip() if note is not None else None,
    )
    db.add(product_use)
    try:
        db.flush()
        for product in products:
            snapshot = resolve_product_snapshot(db, product)
            db.add(
                ProductUseProduct(
                    product_use_id=product_use.id,
                    product_id=product.id,
                    name_snapshot=snapshot.name,
                    brand_snapshot=snapshot.brand_name,
                    formula_version_snapshot=snapshot.formula_version,
                    image_asset_id_snapshot=snapshot.image_asset_id,
                    document_id_snapshot=snapshot.document_id,
                )
            )
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = _find_use_by_request(
            db,
            user_id=user_id,
            client_request_id=client_request_id,
        )
        if existing is None:
            raise
        existing_products = _load_use_products(db, [existing.id]).get(existing.id, [])
        return _use_out(db, existing, existing_products), False
    db.refresh(product_use)
    snapshots = _load_use_products(db, [product_use.id]).get(product_use.id, [])
    return _use_out(db, product_use, snapshots), True


def list_product_uses(
    db: Session,
    *,
    user_id: int,
    limit: int,
    before_id: int | None,
) -> list[ProductUseOut]:
    statement = select(ProductUse).where(
        ProductUse.user_id == user_id,
        ProductUse.deleted_at.is_(None),
    )
    if before_id is not None:
        statement = statement.where(ProductUse.id < before_id)
    uses = list(
        db.scalars(
            statement.order_by(ProductUse.used_at.desc(), ProductUse.id.desc()).limit(
                max(1, min(limit, 100))
            )
        ).all()
    )
    products_by_use = _load_use_products(db, [product_use.id for product_use in uses])
    return [
        _use_out(db, product_use, products_by_use.get(product_use.id, []))
        for product_use in uses
    ]


def get_product_use(db: Session, *, user_id: int, use_id: int) -> ProductUseOut:
    product_use = db.get(ProductUse, use_id)
    if product_use is None or product_use.user_id != user_id or product_use.deleted_at is not None:
        raise HTTPException(status_code=404, detail="product use not found")
    products = _load_use_products(db, [use_id]).get(use_id, [])
    return _use_out(db, product_use, products)


def get_product_detail(db: Session, *, user_id: int, product_id: int) -> ProductDetailOut:
    product = db.get(PersonalProduct, product_id)
    if product is None or product.user_id != user_id or product.deleted_at is not None:
        raise HTTPException(status_code=404, detail="product not found")
    uses = list(
        db.scalars(
            select(ProductUse)
            .join(ProductUseProduct, ProductUseProduct.product_use_id == ProductUse.id)
            .where(
                ProductUseProduct.product_id == product_id,
                ProductUse.user_id == user_id,
                ProductUse.deleted_at.is_(None),
            )
            .order_by(ProductUse.used_at.desc(), ProductUse.id.desc())
        ).all()
    )
    products_by_use = _load_use_products(db, [product_use.id for product_use in uses])
    return ProductDetailOut(
        **_product_out(
            db,
            product,
            use_count=len(uses),
            last_used_at=uses[0].used_at if uses else None,
            ).model_dump(),
            uses=[
                _use_out(db, product_use, products_by_use.get(product_use.id, []))
                for product_use in uses
            ],
        )
