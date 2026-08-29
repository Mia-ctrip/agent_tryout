from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


REGULATORY_TYPES = ("cosmetic", "drug", "medical_device")
STANDARD_PRODUCT_STATUSES = ("active", "inactive")
IMAGE_SOURCE_TYPES = ("catalog", "user")


class CatalogImportBatch(Base, IdMixin, TimestampMixin):
    __tablename__ = "catalog_import_batches"
    __table_args__ = (
        UniqueConstraint("catalog_version", "manifest_sha256", name="uq_catalog_import_batches_version"),
        CheckConstraint(
            "char_length(btrim(catalog_version)) > 0",
            name="ck_catalog_import_batches_catalog_version",
        ),
        CheckConstraint(
            "char_length(manifest_sha256) = 64",
            name="ck_catalog_import_batches_manifest_sha256",
        ),
        CheckConstraint(
            "char_length(btrim(source_name)) > 0",
            name="ck_catalog_import_batches_source_name",
        ),
    )

    catalog_version: Mapped[str] = mapped_column(String(120), nullable=False)
    manifest_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_name: Mapped[str] = mapped_column(String(180), nullable=False)


class ProductImageAsset(Base, IdMixin, TimestampMixin):
    __tablename__ = "product_image_assets"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_product_image_assets_storage_key"),
        CheckConstraint(
            "source_type IN ('catalog', 'user')",
            name="ck_product_image_assets_source_type",
        ),
        CheckConstraint(
            "(source_type = 'catalog' AND owner_user_id IS NULL) OR "
            "(source_type = 'user' AND owner_user_id IS NOT NULL)",
            name="ck_product_image_assets_source_owner",
        ),
        CheckConstraint("char_length(sha256) = 64", name="ck_product_image_assets_sha256"),
        CheckConstraint("byte_size > 0", name="ck_product_image_assets_byte_size"),
        CheckConstraint(
            "width > 0 AND height > 0",
            name="ck_product_image_assets_dimensions",
        ),
        CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_product_image_assets_storage_key",
        ),
    )

    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False)
    owner_user_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class StandardProduct(Base, IdMixin, TimestampMixin):
    __tablename__ = "standard_products"
    __table_args__ = (
        CheckConstraint(
            "char_length(btrim(brand_name)) > 0 AND "
            "char_length(btrim(official_name)) > 0 AND "
            "char_length(btrim(normalized_brand_name)) > 0 AND "
            "char_length(btrim(normalized_official_name)) > 0 AND "
            "char_length(btrim(product_category)) > 0 AND "
            "char_length(btrim(formula_version)) > 0",
            name="ck_standard_products_nonblank_names",
        ),
        CheckConstraint(
            "regulatory_type IN ('cosmetic', 'drug', 'medical_device')",
            name="ck_standard_products_regulatory_type",
        ),
        CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_standard_products_status",
        ),
    )

    catalog_code: Mapped[str] = mapped_column(String(96), unique=True, nullable=False)
    brand_name: Mapped[str] = mapped_column(String(120), nullable=False)
    official_name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_brand_name: Mapped[str] = mapped_column(String(180), nullable=False)
    normalized_official_name: Mapped[str] = mapped_column(String(240), nullable=False)
    product_category: Mapped[str] = mapped_column(String(64), nullable=False)
    formula_version: Mapped[str] = mapped_column(String(120), nullable=False)
    key_strength: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    regulatory_type: Mapped[str] = mapped_column(String(24), nullable=False)
    registration_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    market_region: Mapped[str] = mapped_column(String(16), nullable=False)
    primary_image_asset_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    import_batch_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
        nullable=False,
    )


class StandardProductAlias(Base, IdMixin, TimestampMixin):
    __tablename__ = "standard_product_aliases"
    __table_args__ = (
        UniqueConstraint(
            "standard_product_id",
            "normalized_alias",
            name="uq_standard_product_aliases_normalized",
        ),
        CheckConstraint(
            "char_length(btrim(alias)) > 0 AND char_length(btrim(normalized_alias)) > 0",
            name="ck_standard_product_aliases_nonblank",
        ),
    )

    standard_product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("standard_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alias: Mapped[str] = mapped_column(String(240), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(240), nullable=False)
    language: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    import_batch_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
        nullable=False,
    )


class StandardProductDocument(Base, IdMixin, TimestampMixin):
    __tablename__ = "standard_product_documents"
    __table_args__ = (
        UniqueConstraint(
            "standard_product_id",
            "market_region",
            "language",
            "document_version",
            name="uq_standard_product_documents_version",
        ),
        CheckConstraint(
            "regulatory_type IN ('cosmetic', 'drug', 'medical_device')",
            name="ck_standard_product_documents_regulatory_type",
        ),
        CheckConstraint(
            "char_length(content_sha256) = 64",
            name="ck_standard_product_documents_content_sha256",
        ),
        CheckConstraint(
            "char_length(btrim(document_version)) > 0 AND "
            "char_length(btrim(source_name)) > 0 AND char_length(btrim(source_url)) > 0",
            name="ck_standard_product_documents_nonblank_source",
        ),
        Index(
            "uq_standard_product_documents_current_region_language",
            "standard_product_id",
            "market_region",
            "language",
            unique=True,
            postgresql_where=text("is_current"),
        ),
    )

    standard_product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("standard_products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    market_region: Mapped[str] = mapped_column(String(16), nullable=False)
    language: Mapped[str] = mapped_column(String(16), nullable=False)
    regulatory_type: Mapped[str] = mapped_column(String(24), nullable=False)
    document_version: Mapped[str] = mapped_column(String(120), nullable=False)
    effective_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    registration_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    source_name: Mapped[str] = mapped_column(String(180), nullable=False)
    source_url: Mapped[str] = mapped_column(String(512), nullable=False)
    indications_original_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_document_storage_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    import_batch_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
        nullable=False,
    )


class ProductAssetCleanup(Base, IdMixin, TimestampMixin):
    __tablename__ = "product_asset_cleanup"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_product_asset_cleanup_storage_key"),
        CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_product_asset_cleanup_storage_key",
        ),
    )

    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    import_batch_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("catalog_import_batches.id", ondelete="SET NULL"),
        nullable=True,
    )
    cleaned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
