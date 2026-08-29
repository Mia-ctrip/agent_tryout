from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from datetime import datetime
import json
import math
import unicodedata

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.product_catalog import (
    ProductImageAsset,
    StandardProduct,
    StandardProductDocument,
)
from app.schemas.product_catalog import (
    ProductSearchItemOut,
    ProductSearchPageOut,
    StandardProductDetailOut,
    StandardProductDocumentOut,
)
from app.services.storage_service.factory import get_storage


_CURSOR_VERSION = 1


@dataclass(frozen=True)
class SearchCursor:
    bucket: int
    similarity: float
    source_order: int
    stable_id: int


def normalize_product_search_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())


def encode_search_cursor(cursor: SearchCursor) -> str:
    payload = json.dumps(
        {
            "v": _CURSOR_VERSION,
            "b": cursor.bucket,
            "s": cursor.similarity,
            "o": cursor.source_order,
            "i": cursor.stable_id,
        },
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode("ascii")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_search_cursor(value: str) -> SearchCursor:
    try:
        padded = value + "=" * (-len(value) % 4)
        payload = json.loads(base64.b64decode(padded, altchars=b"-_", validate=True))
        if not isinstance(payload, dict) or set(payload) != {"v", "b", "s", "o", "i"}:
            raise ValueError
        if payload["v"] != _CURSOR_VERSION:
            raise ValueError
        bucket = payload["b"]
        similarity = payload["s"]
        source_order = payload["o"]
        stable_id = payload["i"]
        if type(bucket) is not int or not 0 <= bucket <= 5:
            raise ValueError
        if type(similarity) not in {int, float} or not math.isfinite(similarity):
            raise ValueError
        if not 0 <= similarity <= 1:
            raise ValueError
        if type(source_order) is not int or source_order not in {0, 1}:
            raise ValueError
        if type(stable_id) is not int or stable_id <= 0:
            raise ValueError
    except (
        UnicodeEncodeError,
        ValueError,
        TypeError,
        json.JSONDecodeError,
        binascii.Error,
    ) as exc:
        raise HTTPException(status_code=400, detail="invalid search cursor") from exc
    return SearchCursor(
        bucket=bucket,
        similarity=float(similarity),
        source_order=source_order,
        stable_id=stable_id,
    )


def search_product_options(
    db: Session,
    *,
    user_id: int,
    query: str,
    limit: int,
    cursor: str | None,
) -> ProductSearchPageOut:
    normalized_query = normalize_product_search_query(query)
    if not normalized_query:
        raise HTTPException(
            status_code=422,
            detail="search query must contain letters or numbers",
        )
    decoded_cursor = decode_search_cursor(cursor) if cursor is not None else None
    page_limit = max(1, min(limit, 50))
    rows = db.execute(
        text(_SEARCH_SQL),
        {
            "user_id": user_id,
            "normalized_query": normalized_query,
            "prefix_pattern": f"{normalized_query}%",
            "contains_pattern": f"%{normalized_query}%",
            "cursor_present": decoded_cursor is not None,
            "cursor_bucket": decoded_cursor.bucket if decoded_cursor is not None else 0,
            "cursor_similarity": (
                decoded_cursor.similarity if decoded_cursor is not None else 0.0
            ),
            "cursor_source_order": (
                decoded_cursor.source_order if decoded_cursor is not None else 0
            ),
            "cursor_stable_id": decoded_cursor.stable_id if decoded_cursor is not None else 0,
            "fetch_limit": page_limit + 1,
        },
    ).mappings().all()

    has_more = len(rows) > page_limit
    page_rows = rows[:page_limit]
    items = [_search_item_out(db, row, user_id=user_id) for row in page_rows]
    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        next_cursor = encode_search_cursor(
            SearchCursor(
                bucket=int(last["bucket"]),
                similarity=float(last["similarity"]),
                source_order=int(last["source_order"]),
                stable_id=int(last["stable_id"]),
            )
        )
    return ProductSearchPageOut(items=items, next_cursor=next_cursor)


def get_standard_product_detail(
    db: Session,
    *,
    user_id: int,
    standard_product_id: int,
) -> StandardProductDetailOut:
    product = db.scalar(
        select(StandardProduct).where(
            StandardProduct.id == standard_product_id,
            StandardProduct.deleted_at.is_(None),
        )
    )
    if product is None:
        raise HTTPException(status_code=404, detail="standard product not found")

    document = db.scalar(
        select(StandardProductDocument)
        .where(
            StandardProductDocument.standard_product_id == product.id,
            StandardProductDocument.is_current.is_(True),
            StandardProductDocument.deleted_at.is_(None),
        )
        .order_by(
            (StandardProductDocument.market_region == product.market_region).desc(),
            StandardProductDocument.effective_date.desc().nullslast(),
            StandardProductDocument.id.desc(),
        )
        .limit(1)
    )
    image_url, image_expires_at = _signed_image(
        db,
        product.primary_image_asset_id,
        user_id=user_id,
    )
    document_out = None
    if document is not None:
        original_document_url = None
        original_document_expires_at = None
        if document.source_document_storage_key is not None:
            signed = get_storage().signed_url(document.source_document_storage_key)
            original_document_url = signed.url
            original_document_expires_at = signed.expires_at
        document_out = StandardProductDocumentOut(
            document_id=document.id,
            market_region=document.market_region,
            language=document.language,
            regulatory_type=document.regulatory_type,
            document_version=document.document_version,
            effective_date=document.effective_date,
            registration_number=document.registration_number,
            source_name=document.source_name,
            source_url=document.source_url,
            indications_original_text=document.indications_original_text,
            content_sha256=document.content_sha256,
            original_document_url=original_document_url,
            original_document_expires_at=original_document_expires_at,
        )
    return StandardProductDetailOut(
        standard_product_id=product.id,
        catalog_code=product.catalog_code,
        brand_name=product.brand_name,
        official_name=product.official_name,
        product_category=product.product_category,
        formula_version=product.formula_version,
        key_strength=product.key_strength,
        regulatory_type=product.regulatory_type,
        registration_number=product.registration_number,
        market_region=product.market_region,
        status=product.status,
        image_url=image_url,
        image_expires_at=image_expires_at,
        current_document=document_out,
    )


def _search_item_out(db: Session, row, *, user_id: int) -> ProductSearchItemOut:
    image_url, image_expires_at = _signed_image(
        db,
        row["image_asset_id"],
        user_id=user_id,
    )
    return ProductSearchItemOut(
        source_type=row["source_type"],
        match_type=row["match_type"],
        personal_product_id=row["personal_product_id"],
        standard_product_id=row["standard_product_id"],
        name=row["name"],
        brand_name=row["brand_name"],
        formula_version=row["formula_version"],
        product_category=row["product_category"],
        regulatory_type=row["regulatory_type"],
        image_url=image_url,
        image_expires_at=image_expires_at,
        in_cabinet=row["in_cabinet"],
    )


def _signed_image(
    db: Session,
    asset_id: int | None,
    *,
    user_id: int,
) -> tuple[str | None, datetime | None]:
    if asset_id is None:
        return None, None
    asset = db.get(ProductImageAsset, asset_id)
    if (
        asset is None
        or asset.deleted_at is not None
        or asset.archived_at is not None
        or (
            asset.source_type == "catalog"
            and asset.owner_user_id is not None
        )
        or (
            asset.source_type == "user"
            and asset.owner_user_id != user_id
        )
    ):
        return None, None
    signed = get_storage().signed_url(asset.storage_key)
    return signed.url, signed.expires_at


_SEARCH_SQL = """
WITH alias_matches AS (
    SELECT
        alias.standard_product_id,
        bool_or(alias.normalized_alias = :normalized_query) AS alias_exact,
        bool_or(alias.normalized_alias LIKE :prefix_pattern) AS alias_prefix,
        bool_or(alias.normalized_alias LIKE :contains_pattern) AS alias_contains,
        max(similarity(alias.normalized_alias, :normalized_query))::double precision
            AS alias_similarity
    FROM standard_product_aliases AS alias
    WHERE alias.deleted_at IS NULL
      AND (
        alias.normalized_alias = :normalized_query
        OR alias.normalized_alias LIKE :prefix_pattern
        OR alias.normalized_alias LIKE :contains_pattern
        OR alias.normalized_alias % :normalized_query
      )
    GROUP BY alias.standard_product_id
),
personal_candidates AS (
    SELECT
        CASE
            WHEN personal.normalized_name = :normalized_query THEN 0
            WHEN personal.normalized_name LIKE :prefix_pattern THEN 3
            WHEN personal.normalized_name LIKE :contains_pattern THEN 4
            ELSE 5
        END AS bucket,
        similarity(personal.normalized_name, :normalized_query)::double precision AS similarity,
        0 AS source_order,
        personal.id AS stable_id,
        'personal'::varchar AS source_type,
        CASE
            WHEN personal.normalized_name = :normalized_query THEN 'personal_exact'
            WHEN personal.normalized_name LIKE :prefix_pattern THEN 'prefix'
            WHEN personal.normalized_name LIKE :contains_pattern THEN 'contains'
            ELSE 'fuzzy'
        END::varchar AS match_type,
        personal.id AS personal_product_id,
        personal.standard_product_id AS standard_product_id,
        coalesce(
            personal.display_name_override,
            linked_standard.official_name,
            personal.name
        ) AS name,
        linked_standard.brand_name AS brand_name,
        linked_standard.formula_version AS formula_version,
        linked_standard.product_category AS product_category,
        linked_standard.regulatory_type AS regulatory_type,
        coalesce(
            personal.user_image_asset_id,
            linked_standard.primary_image_asset_id
        ) AS image_asset_id,
        true AS in_cabinet
    FROM personal_products AS personal
    LEFT JOIN standard_products AS linked_standard
      ON linked_standard.id = personal.standard_product_id
     AND linked_standard.deleted_at IS NULL
    WHERE personal.user_id = :user_id
      AND personal.deleted_at IS NULL
      AND (
        personal.normalized_name = :normalized_query
        OR personal.normalized_name LIKE :prefix_pattern
        OR personal.normalized_name LIKE :contains_pattern
        OR personal.normalized_name % :normalized_query
      )
),
standard_candidates AS (
    SELECT
        CASE
            WHEN standard.normalized_official_name = :normalized_query
              OR standard.normalized_brand_name = :normalized_query THEN 1
            WHEN coalesce(aliases.alias_exact, false) THEN 2
            WHEN standard.normalized_official_name LIKE :prefix_pattern
              OR standard.normalized_brand_name LIKE :prefix_pattern
              OR coalesce(aliases.alias_prefix, false) THEN 3
            WHEN standard.normalized_official_name LIKE :contains_pattern
              OR standard.normalized_brand_name LIKE :contains_pattern
              OR coalesce(aliases.alias_contains, false) THEN 4
            ELSE 5
        END AS bucket,
        greatest(
            similarity(standard.normalized_official_name, :normalized_query),
            similarity(standard.normalized_brand_name, :normalized_query),
            coalesce(aliases.alias_similarity, 0)
        )::double precision AS similarity,
        1 AS source_order,
        standard.id AS stable_id,
        'standard'::varchar AS source_type,
        CASE
            WHEN standard.normalized_official_name = :normalized_query
              OR standard.normalized_brand_name = :normalized_query THEN 'standard_exact'
            WHEN coalesce(aliases.alias_exact, false) THEN 'standard_alias'
            WHEN standard.normalized_official_name LIKE :prefix_pattern
              OR standard.normalized_brand_name LIKE :prefix_pattern
              OR coalesce(aliases.alias_prefix, false) THEN 'prefix'
            WHEN standard.normalized_official_name LIKE :contains_pattern
              OR standard.normalized_brand_name LIKE :contains_pattern
              OR coalesce(aliases.alias_contains, false) THEN 'contains'
            ELSE 'fuzzy'
        END::varchar AS match_type,
        cabinet.id AS personal_product_id,
        standard.id AS standard_product_id,
        standard.official_name AS name,
        standard.brand_name AS brand_name,
        standard.formula_version AS formula_version,
        standard.product_category AS product_category,
        standard.regulatory_type AS regulatory_type,
        standard.primary_image_asset_id AS image_asset_id,
        cabinet.id IS NOT NULL AS in_cabinet
    FROM standard_products AS standard
    LEFT JOIN alias_matches AS aliases
      ON aliases.standard_product_id = standard.id
    LEFT JOIN personal_products AS cabinet
      ON cabinet.standard_product_id = standard.id
     AND cabinet.user_id = :user_id
     AND cabinet.deleted_at IS NULL
    WHERE standard.status = 'active'
      AND standard.deleted_at IS NULL
      AND (
        standard.normalized_official_name = :normalized_query
        OR standard.normalized_brand_name = :normalized_query
        OR standard.normalized_official_name LIKE :prefix_pattern
        OR standard.normalized_brand_name LIKE :prefix_pattern
        OR standard.normalized_official_name LIKE :contains_pattern
        OR standard.normalized_brand_name LIKE :contains_pattern
        OR standard.normalized_official_name % :normalized_query
        OR standard.normalized_brand_name % :normalized_query
        OR aliases.standard_product_id IS NOT NULL
      )
),
all_candidates AS (
    SELECT * FROM personal_candidates
    UNION ALL
    SELECT * FROM standard_candidates
)
SELECT *
FROM all_candidates
WHERE NOT :cursor_present
   OR bucket > :cursor_bucket
   OR (bucket = :cursor_bucket AND similarity < :cursor_similarity)
   OR (
        bucket = :cursor_bucket
        AND similarity = :cursor_similarity
        AND source_order > :cursor_source_order
   )
   OR (
        bucket = :cursor_bucket
        AND similarity = :cursor_similarity
        AND source_order = :cursor_source_order
        AND stable_id > :cursor_stable_id
   )
ORDER BY bucket, similarity DESC, source_order, stable_id
LIMIT :fetch_limit
"""
