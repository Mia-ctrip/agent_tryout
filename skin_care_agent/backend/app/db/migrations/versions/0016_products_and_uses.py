"""personal products and actual product uses

Revision ID: 0016_products_and_uses
Revises: 0015_region_events
Create Date: 2026-08-24
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0016_products_and_uses"
down_revision: Union[str, None] = "0015_region_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "personal_products",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_request_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "char_length(btrim(name)) BETWEEN 1 AND 120",
            name="ck_personal_products_name",
        ),
    )
    op.create_index("ix_personal_products_user_id", "personal_products", ["user_id"])
    op.create_index(
        "ix_personal_products_user_created",
        "personal_products",
        ["user_id", "created_at"],
    )
    op.create_index(
        "uq_personal_products_user_client_request_id",
        "personal_products",
        ["user_id", "client_request_id"],
        unique=True,
    )

    op.create_table(
        "product_uses",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_request_id", sa.Uuid(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_timezone_offset_minutes", sa.SmallInteger(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "used_timezone_offset_minutes BETWEEN -840 AND 840",
            name="ck_product_uses_timezone_offset",
        ),
        sa.CheckConstraint(
            "note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500",
            name="ck_product_uses_note",
        ),
    )
    op.create_index("ix_product_uses_user_id", "product_uses", ["user_id"])
    op.create_index("ix_product_uses_used_at", "product_uses", ["used_at"])
    op.create_index(
        "ix_product_uses_user_used_at",
        "product_uses",
        ["user_id", "used_at"],
    )
    op.create_index(
        "uq_product_uses_user_client_request_id",
        "product_uses",
        ["user_id", "client_request_id"],
        unique=True,
    )

    op.create_table(
        "product_use_products",
        sa.Column(
            "product_use_id",
            sa.BigInteger(),
            sa.ForeignKey("product_uses.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("personal_products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index(
        "ix_product_use_products_product_id",
        "product_use_products",
        ["product_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_product_use_products_product_id", table_name="product_use_products")
    op.drop_table("product_use_products")
    op.drop_index(
        "uq_product_uses_user_client_request_id",
        table_name="product_uses",
    )
    op.drop_index("ix_product_uses_user_used_at", table_name="product_uses")
    op.drop_index("ix_product_uses_used_at", table_name="product_uses")
    op.drop_index("ix_product_uses_user_id", table_name="product_uses")
    op.drop_table("product_uses")
    op.drop_index(
        "uq_personal_products_user_client_request_id",
        table_name="personal_products",
    )
    op.drop_index("ix_personal_products_user_created", table_name="personal_products")
    op.drop_index("ix_personal_products_user_id", table_name="personal_products")
    op.drop_table("personal_products")
