"""region event organization

Revision ID: 0015_region_events
Revises: 0014_region_observation_targets
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0015_region_events"
down_revision: Union[str, None] = "0014_region_observation_targets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "region_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("region_id", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "previous_event_id",
            sa.BigInteger(),
            sa.ForeignKey("region_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("started_local_date", sa.Date(), nullable=False),
        sa.Column("last_valid_local_date", sa.Date(), nullable=True),
        sa.Column("ended_local_date", sa.Date(), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_reason", sa.String(length=24), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "region_id IN ('forehead', 'left_face', 'right_face', "
            "'nose_area', 'mouth_area', 'chin')",
            name="ck_region_events_region_id",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'current', 'ended')",
            name="ck_region_events_status",
        ),
        sa.CheckConstraint(
            "end_reason IS NULL OR end_reason IN ('user_ended', 'replaced')",
            name="ck_region_events_end_reason",
        ),
    )
    op.create_index("ix_region_events_user_id", "region_events", ["user_id"])
    op.create_index("ix_region_events_region_id", "region_events", ["region_id"])
    op.create_index("ix_region_events_user_status", "region_events", ["user_id", "status"])
    op.create_index(
        "uq_region_events_user_region_current",
        "region_events",
        ["user_id", "region_id"],
        unique=True,
        postgresql_where=sa.text("status = 'current' AND deleted_at IS NULL"),
    )
    op.create_index(
        "uq_region_events_user_region_pending",
        "region_events",
        ["user_id", "region_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending' AND deleted_at IS NULL"),
    )
    op.add_column("observation_targets", sa.Column("region_event_id", sa.BigInteger()))
    op.create_foreign_key(
        "fk_observation_targets_region_event_id",
        "observation_targets",
        "region_events",
        ["region_event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_observation_targets_region_event_id",
        "observation_targets",
        ["region_event_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_observation_targets_region_event_id", table_name="observation_targets")
    op.drop_constraint(
        "fk_observation_targets_region_event_id",
        "observation_targets",
        type_="foreignkey",
    )
    op.drop_column("observation_targets", "region_event_id")
    op.drop_index("uq_region_events_user_region_pending", table_name="region_events")
    op.drop_index("uq_region_events_user_region_current", table_name="region_events")
    op.drop_index("ix_region_events_user_status", table_name="region_events")
    op.drop_index("ix_region_events_region_id", table_name="region_events")
    op.drop_index("ix_region_events_user_id", table_name="region_events")
    op.drop_table("region_events")
