"""derived region comparisons and stage trends

Revision ID: 0020_region_insights
Revises: 0019_personal_product_links
Create Date: 2026-09-29
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0020_region_insights"
down_revision: Union[str, None] = "0019_personal_product_links"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "region_insights",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "region_event_id",
            sa.BigInteger(),
            sa.ForeignKey("region_events.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("region_id", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="processing"),
        sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("input_fingerprint", sa.String(length=64), nullable=False),
        sa.Column(
            "earlier_target_id",
            sa.BigInteger(),
            sa.ForeignKey("observation_targets.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "later_target_id",
            sa.BigInteger(),
            sa.ForeignKey("observation_targets.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("referenced_target_ids", postgresql.JSONB(), nullable=False),
        sa.Column("timepoint_map", postgresql.JSONB(), nullable=False),
        sa.Column("input_meta", postgresql.JSONB(), nullable=True),
        sa.Column("result", postgresql.JSONB(), nullable=True),
        sa.Column("prompt_version", sa.String(length=64), nullable=False),
        sa.Column("schema_version", sa.String(length=64), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column("trace_id", sa.String(length=64), nullable=True),
        sa.Column("failure_code", sa.String(length=48), nullable=True),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("kind IN ('comparison', 'trend')", name="ck_region_insights_kind"),
        sa.CheckConstraint(
            "status IN ('processing', 'completed', 'degraded', 'failed')",
            name="ck_region_insights_status",
        ),
        sa.CheckConstraint(
            "region_id IN ('forehead', 'left_face', 'right_face', "
            "'nose_area', 'mouth_area', 'chin')",
            name="ck_region_insights_region_id",
        ),
        sa.CheckConstraint(
            "(kind = 'comparison' AND earlier_target_id IS NOT NULL "
            "AND later_target_id IS NOT NULL) OR "
            "(kind = 'trend' AND earlier_target_id IS NULL AND later_target_id IS NULL)",
            name="ck_region_insights_comparison_pair",
        ),
    )
    op.create_index(
        "uq_region_insights_user_kind_fingerprint",
        "region_insights",
        ["user_id", "kind", "input_fingerprint"],
        unique=True,
    )
    op.create_index(
        "ix_region_insights_event_kind",
        "region_insights",
        ["user_id", "region_event_id", "kind", "superseded_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_region_insights_event_kind", table_name="region_insights")
    op.drop_index("uq_region_insights_user_kind_fingerprint", table_name="region_insights")
    op.drop_table("region_insights")
