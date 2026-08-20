"""patch_lineages + patch_lineage_snapshots

Revision ID: 0008_lineages
Revises: 0007_chat_messages
Create Date: 2026-07-03

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0008_lineages"
down_revision: Union[str, None] = "0007_chat_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "patch_lineages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("region", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_patch_lineages_user_id", "patch_lineages", ["user_id"])
    op.create_index("ix_patch_lineages_region", "patch_lineages", ["region"])
    op.create_index(
        "ix_patch_lineages_user_region_status",
        "patch_lineages",
        ["user_id", "region", "status"],
    )
    op.create_index(
        "ix_patch_lineages_last_seen_at", "patch_lineages", ["last_seen_at"]
    )

    op.create_table(
        "patch_lineage_snapshots",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "lineage_id",
            sa.BigInteger(),
            sa.ForeignKey("patch_lineages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "analysis_id",
            sa.BigInteger(),
            sa.ForeignKey("analyses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "photo_id",
            sa.BigInteger(),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("patch_id", sa.String(length=16), nullable=False),
        sa.Column("region", sa.String(length=32), nullable=False),
        sa.Column(
            "bbox_norm", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("area_ratio", sa.Float(), nullable=False, server_default="0"),
        sa.Column("coverage", sa.String(length=16), nullable=False),
        sa.Column("dominant_type", sa.String(length=16), nullable=False),
        sa.Column("estimated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inflammation", sa.String(length=16), nullable=False),
        sa.Column("severity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "match_info", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_patch_lineage_snapshots_lineage_id",
        "patch_lineage_snapshots",
        ["lineage_id"],
    )
    op.create_index(
        "ix_patch_lineage_snapshots_analysis_id",
        "patch_lineage_snapshots",
        ["analysis_id"],
    )
    op.create_index(
        "ix_patch_lineage_snapshots_user_id",
        "patch_lineage_snapshots",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_patch_lineage_snapshots_user_id", table_name="patch_lineage_snapshots"
    )
    op.drop_index(
        "ix_patch_lineage_snapshots_analysis_id", table_name="patch_lineage_snapshots"
    )
    op.drop_index(
        "ix_patch_lineage_snapshots_lineage_id", table_name="patch_lineage_snapshots"
    )
    op.drop_table("patch_lineage_snapshots")

    op.drop_index("ix_patch_lineages_last_seen_at", table_name="patch_lineages")
    op.drop_index(
        "ix_patch_lineages_user_region_status", table_name="patch_lineages"
    )
    op.drop_index("ix_patch_lineages_region", table_name="patch_lineages")
    op.drop_index("ix_patch_lineages_user_id", table_name="patch_lineages")
    op.drop_table("patch_lineages")
