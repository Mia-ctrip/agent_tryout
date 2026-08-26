"""standard product catalog

Revision ID: 0018_standard_product_catalog
Revises: 0017_life_contexts
Create Date: 2026-08-24
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0018_standard_product_catalog"
down_revision: Union[str, None] = "0017_life_contexts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "catalog_import_batches",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("catalog_version", sa.String(length=120), nullable=False),
        sa.Column("manifest_sha256", sa.String(length=64), nullable=False),
        sa.Column("source_name", sa.String(length=180), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "catalog_version",
            "manifest_sha256",
            name="uq_catalog_import_batches_version",
        ),
        sa.CheckConstraint(
            "char_length(btrim(catalog_version)) > 0",
            name="ck_catalog_import_batches_catalog_version",
        ),
        sa.CheckConstraint(
            "char_length(manifest_sha256) = 64",
            name="ck_catalog_import_batches_manifest_sha256",
        ),
        sa.CheckConstraint(
            "char_length(btrim(source_name)) > 0",
            name="ck_catalog_import_batches_source_name",
        ),
    )

    op.create_table(
        "product_image_assets",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column(
            "owner_user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("storage_key", name="uq_product_image_assets_storage_key"),
        sa.CheckConstraint(
            "source_type IN ('catalog', 'user')",
            name="ck_product_image_assets_source_type",
        ),
        sa.CheckConstraint(
            "(source_type = 'catalog' AND owner_user_id IS NULL) OR "
            "(source_type = 'user' AND owner_user_id IS NOT NULL)",
            name="ck_product_image_assets_source_owner",
        ),
        sa.CheckConstraint("char_length(sha256) = 64", name="ck_product_image_assets_sha256"),
        sa.CheckConstraint("byte_size > 0", name="ck_product_image_assets_byte_size"),
        sa.CheckConstraint(
            "width > 0 AND height > 0",
            name="ck_product_image_assets_dimensions",
        ),
        sa.CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_product_image_assets_storage_key",
        ),
    )
    op.create_index("ix_product_image_assets_owner_user_id", "product_image_assets", ["owner_user_id"])

    op.create_table(
        "standard_products",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("catalog_code", sa.String(length=96), nullable=False, unique=True),
        sa.Column("brand_name", sa.String(length=120), nullable=False),
        sa.Column("official_name", sa.String(length=180), nullable=False),
        sa.Column("normalized_brand_name", sa.String(length=180), nullable=False),
        sa.Column("normalized_official_name", sa.String(length=240), nullable=False),
        sa.Column("product_category", sa.String(length=64), nullable=False),
        sa.Column("formula_version", sa.String(length=120), nullable=False),
        sa.Column("key_strength", sa.String(length=80), nullable=True),
        sa.Column("regulatory_type", sa.String(length=24), nullable=False),
        sa.Column("registration_number", sa.String(length=120), nullable=True),
        sa.Column("market_region", sa.String(length=16), nullable=False),
        sa.Column(
            "primary_image_asset_id",
            sa.BigInteger(),
            sa.ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "import_batch_id",
            sa.BigInteger(),
            sa.ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "char_length(btrim(brand_name)) > 0 AND "
            "char_length(btrim(official_name)) > 0 AND "
            "char_length(btrim(normalized_brand_name)) > 0 AND "
            "char_length(btrim(normalized_official_name)) > 0 AND "
            "char_length(btrim(product_category)) > 0 AND "
            "char_length(btrim(formula_version)) > 0",
            name="ck_standard_products_nonblank_names",
        ),
        sa.CheckConstraint(
            "regulatory_type IN ('cosmetic', 'drug', 'medical_device')",
            name="ck_standard_products_regulatory_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')",
            name="ck_standard_products_status",
        ),
    )

    op.create_table(
        "standard_product_aliases",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "standard_product_id",
            sa.BigInteger(),
            sa.ForeignKey("standard_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("alias", sa.String(length=240), nullable=False),
        sa.Column("normalized_alias", sa.String(length=240), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=True),
        sa.Column(
            "import_batch_id",
            sa.BigInteger(),
            sa.ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "standard_product_id",
            "normalized_alias",
            name="uq_standard_product_aliases_normalized",
        ),
        sa.CheckConstraint(
            "char_length(btrim(alias)) > 0 AND char_length(btrim(normalized_alias)) > 0",
            name="ck_standard_product_aliases_nonblank",
        ),
    )
    op.create_index("ix_standard_product_aliases_standard_product_id", "standard_product_aliases", ["standard_product_id"])

    op.create_table(
        "standard_product_documents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "standard_product_id",
            sa.BigInteger(),
            sa.ForeignKey("standard_products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("market_region", sa.String(length=16), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False),
        sa.Column("regulatory_type", sa.String(length=24), nullable=False),
        sa.Column("document_version", sa.String(length=120), nullable=False),
        sa.Column("effective_date", sa.Date(), nullable=True),
        sa.Column("registration_number", sa.String(length=120), nullable=True),
        sa.Column("source_name", sa.String(length=180), nullable=False),
        sa.Column("source_url", sa.String(length=512), nullable=False),
        sa.Column("indications_original_text", sa.Text(), nullable=True),
        sa.Column("source_document_storage_key", sa.String(length=512), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "import_batch_id",
            sa.BigInteger(),
            sa.ForeignKey("catalog_import_batches.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "standard_product_id",
            "market_region",
            "language",
            "document_version",
            name="uq_standard_product_documents_version",
        ),
        sa.CheckConstraint(
            "regulatory_type IN ('cosmetic', 'drug', 'medical_device')",
            name="ck_standard_product_documents_regulatory_type",
        ),
        sa.CheckConstraint(
            "char_length(content_sha256) = 64",
            name="ck_standard_product_documents_content_sha256",
        ),
        sa.CheckConstraint(
            "char_length(btrim(document_version)) > 0 AND "
            "char_length(btrim(source_name)) > 0 AND char_length(btrim(source_url)) > 0",
            name="ck_standard_product_documents_nonblank_source",
        ),
    )
    op.create_index(
        "ix_standard_product_documents_standard_product_id",
        "standard_product_documents",
        ["standard_product_id"],
    )
    op.create_index(
        "uq_standard_product_documents_current_region_language",
        "standard_product_documents",
        ["standard_product_id", "market_region", "language"],
        unique=True,
        postgresql_where=sa.text("is_current"),
    )

    op.create_table(
        "product_asset_cleanup",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("asset_type", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.String(length=120), nullable=False),
        sa.Column(
            "import_batch_id",
            sa.BigInteger(),
            sa.ForeignKey("catalog_import_batches.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cleaned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("storage_key", name="uq_product_asset_cleanup_storage_key"),
        sa.CheckConstraint(
            "char_length(btrim(storage_key)) > 0",
            name="ck_product_asset_cleanup_storage_key",
        ),
    )

    op.create_index(
        "ix_standard_products_normalized_brand_name_trgm",
        "standard_products",
        ["normalized_brand_name"],
        postgresql_using="gin",
        postgresql_ops={"normalized_brand_name": "public.gin_trgm_ops"},
    )
    op.create_index(
        "ix_standard_products_normalized_official_name_trgm",
        "standard_products",
        ["normalized_official_name"],
        postgresql_using="gin",
        postgresql_ops={"normalized_official_name": "public.gin_trgm_ops"},
    )
    op.create_index(
        "ix_standard_product_aliases_normalized_alias_trgm",
        "standard_product_aliases",
        ["normalized_alias"],
        postgresql_using="gin",
        postgresql_ops={"normalized_alias": "public.gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index(
        "ix_standard_product_aliases_normalized_alias_trgm",
        table_name="standard_product_aliases",
    )
    op.drop_index(
        "ix_standard_products_normalized_official_name_trgm",
        table_name="standard_products",
    )
    op.drop_index(
        "ix_standard_products_normalized_brand_name_trgm",
        table_name="standard_products",
    )
    op.drop_table("product_asset_cleanup")
    op.drop_index(
        "uq_standard_product_documents_current_region_language",
        table_name="standard_product_documents",
    )
    op.drop_index(
        "ix_standard_product_documents_standard_product_id",
        table_name="standard_product_documents",
    )
    op.drop_table("standard_product_documents")
    op.drop_index(
        "ix_standard_product_aliases_standard_product_id",
        table_name="standard_product_aliases",
    )
    op.drop_table("standard_product_aliases")
    op.drop_table("standard_products")
    op.drop_index("ix_product_image_assets_owner_user_id", table_name="product_image_assets")
    op.drop_table("product_image_assets")
    op.drop_table("catalog_import_batches")
