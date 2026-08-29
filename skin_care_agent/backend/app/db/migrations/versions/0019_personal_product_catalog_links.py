"""link personal products to the standard catalog and preserve use snapshots

Revision ID: 0019_personal_product_links
Revises: 0018_standard_product_catalog
Create Date: 2026-08-24
"""

from __future__ import annotations

import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0019_personal_product_links"
down_revision: Union[str, None] = "0018_standard_product_catalog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_legacy_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in normalized if character.isalnum())[:180]


def upgrade() -> None:
    op.add_column(
        "personal_products",
        sa.Column(
            "standard_product_id",
            sa.BigInteger(),
            sa.ForeignKey("standard_products.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "personal_products",
        sa.Column("display_name_override", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "personal_products",
        sa.Column("normalized_name", sa.String(length=180), nullable=True),
    )
    op.add_column(
        "personal_products",
        sa.Column(
            "user_image_asset_id",
            sa.BigInteger(),
            sa.ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "product_use_products",
        sa.Column("name_snapshot", sa.String(length=180), nullable=True),
    )
    op.add_column(
        "product_use_products",
        sa.Column("brand_snapshot", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "product_use_products",
        sa.Column("formula_version_snapshot", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "product_use_products",
        sa.Column(
            "image_asset_id_snapshot",
            sa.BigInteger(),
            sa.ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.add_column(
        "product_use_products",
        sa.Column(
            "document_id_snapshot",
            sa.BigInteger(),
            sa.ForeignKey("standard_product_documents.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )

    connection = op.get_bind()
    legacy_products = connection.execute(
        sa.text("SELECT id, name FROM personal_products")
    ).mappings()
    for product in legacy_products:
        connection.execute(
            sa.text(
                "UPDATE personal_products SET normalized_name = :normalized_name "
                "WHERE id = :product_id"
            ),
            {
                "product_id": product["id"],
                "normalized_name": _normalize_legacy_name(product["name"]),
            },
        )
    connection.execute(
        sa.text(
            "UPDATE product_use_products AS association "
            "SET name_snapshot = product.name "
            "FROM personal_products AS product "
            "WHERE association.product_id = product.id"
        )
    )

    op.alter_column(
        "personal_products",
        "normalized_name",
        existing_type=sa.String(length=180),
        nullable=False,
    )
    op.alter_column(
        "product_use_products",
        "name_snapshot",
        existing_type=sa.String(length=180),
        nullable=False,
    )
    op.create_index(
        "uq_personal_products_user_standard_active",
        "personal_products",
        ["user_id", "standard_product_id"],
        unique=True,
        postgresql_where=sa.text("standard_product_id IS NOT NULL"),
    )
    op.create_index(
        "ix_personal_products_normalized_name_trgm",
        "personal_products",
        ["normalized_name"],
        postgresql_using="gin",
        postgresql_ops={"normalized_name": "public.gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index(
        "ix_personal_products_normalized_name_trgm",
        table_name="personal_products",
    )
    op.drop_index(
        "uq_personal_products_user_standard_active",
        table_name="personal_products",
    )
    op.drop_column("product_use_products", "document_id_snapshot")
    op.drop_column("product_use_products", "image_asset_id_snapshot")
    op.drop_column("product_use_products", "formula_version_snapshot")
    op.drop_column("product_use_products", "brand_snapshot")
    op.drop_column("product_use_products", "name_snapshot")
    op.drop_column("personal_products", "user_image_asset_id")
    op.drop_column("personal_products", "normalized_name")
    op.drop_column("personal_products", "display_name_override")
    op.drop_column("personal_products", "standard_product_id")
