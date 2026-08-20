"""check-ins and photo view metadata

Revision ID: 0009_check_ins
Revises: 0008_lineages
Create Date: 2026-07-13

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0009_check_ins"
down_revision: Union[str, None] = "0008_lineages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "check_ins",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="standard"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('quick', 'standard')", name="ck_check_ins_kind"),
        sa.CheckConstraint("status IN ('draft', 'complete')", name="ck_check_ins_status"),
    )
    op.create_index("ix_check_ins_user_id", "check_ins", ["user_id"])
    op.create_index("ix_check_ins_observed_on", "check_ins", ["observed_on"])
    op.create_index(
        "ix_check_ins_user_observed_on",
        "check_ins",
        ["user_id", "observed_on"],
    )

    op.add_column("photos", sa.Column("check_in_id", sa.BigInteger(), nullable=True))
    op.add_column("photos", sa.Column("view_type", sa.String(length=16), nullable=True))
    op.add_column("photos", sa.Column("quality_status", sa.String(length=16), nullable=True))
    op.add_column(
        "photos",
        sa.Column("quality_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "photos", sa.Column("processed_storage_key", sa.String(length=512), nullable=True)
    )
    op.create_foreign_key(
        "fk_photos_check_in_id_check_ins",
        "photos",
        "check_ins",
        ["check_in_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_photos_view_type",
        "photos",
        "view_type IS NULL OR view_type IN ('front', 'left', 'right')",
    )
    op.create_check_constraint(
        "ck_photos_quality_status",
        "photos",
        "quality_status IS NULL OR quality_status IN ('pending', 'passed', 'failed')",
    )
    op.create_index("ix_photos_check_in_id", "photos", ["check_in_id"])
    op.create_index(
        "uq_photos_active_check_in_view",
        "photos",
        ["check_in_id", "view_type"],
        unique=True,
        postgresql_where=sa.text(
            "deleted_at IS NULL AND check_in_id IS NOT NULL AND view_type IS NOT NULL"
        ),
    )

    op.add_column(
        "patch_lineages",
        sa.Column(
            "view_type", sa.String(length=16), nullable=False, server_default="legacy"
        ),
    )
    op.add_column(
        "patch_lineage_snapshots",
        sa.Column(
            "view_type", sa.String(length=16), nullable=False, server_default="legacy"
        ),
    )
    op.create_index(
        "ix_patch_lineages_user_view_region_status",
        "patch_lineages",
        ["user_id", "view_type", "region", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_patch_lineages_user_view_region_status", table_name="patch_lineages"
    )
    op.drop_column("patch_lineage_snapshots", "view_type")
    op.drop_column("patch_lineages", "view_type")

    op.drop_index("uq_photos_active_check_in_view", table_name="photos")
    op.drop_index("ix_photos_check_in_id", table_name="photos")
    op.drop_constraint("ck_photos_quality_status", "photos", type_="check")
    op.drop_constraint("ck_photos_view_type", "photos", type_="check")
    op.drop_constraint("fk_photos_check_in_id_check_ins", "photos", type_="foreignkey")
    op.drop_column("photos", "processed_storage_key")
    op.drop_column("photos", "quality_meta")
    op.drop_column("photos", "quality_status")
    op.drop_column("photos", "view_type")
    op.drop_column("photos", "check_in_id")

    op.drop_index("ix_check_ins_user_observed_on", table_name="check_ins")
    op.drop_index("ix_check_ins_observed_on", table_name="check_ins")
    op.drop_index("ix_check_ins_user_id", table_name="check_ins")
    op.drop_table("check_ins")