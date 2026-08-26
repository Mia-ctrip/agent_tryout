"""full-face observation records and targets

Revision ID: 0013_full_face_observations
Revises: 0012_app_foundation
Create Date: 2026-08-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0013_full_face_observations"
down_revision: Union[str, None] = "0012_app_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "observation_records",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "photo_id",
            sa.BigInteger(),
            sa.ForeignKey("photos.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("user_note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="saved"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('saved')", name="ck_observation_records_status"),
        sa.UniqueConstraint("photo_id", name="uq_observation_records_photo_id"),
    )
    op.create_index("ix_observation_records_user_id", "observation_records", ["user_id"])
    op.create_index(
        "ix_observation_records_recorded_at", "observation_records", ["recorded_at"]
    )
    op.create_index(
        "uq_observation_records_user_client_request_id",
        "observation_records",
        ["user_id", "client_request_id"],
        unique=True,
    )

    op.create_table(
        "observation_targets",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "record_id",
            sa.BigInteger(),
            sa.ForeignKey("observation_records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scope_type", sa.String(length=16), nullable=False, server_default="full_face"),
        sa.Column("region_id", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("result_source", sa.String(length=24), nullable=True),
        sa.Column("facts", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column("trace_id", sa.String(length=64), nullable=True),
        sa.Column("prompt_version", sa.String(length=64), nullable=True),
        sa.Column("schema_version", sa.String(length=64), nullable=True),
        sa.Column("failure_code", sa.String(length=32), nullable=True),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(scope_type = 'full_face' AND region_id IS NULL) OR "
            "(scope_type = 'region' AND region_id IS NOT NULL)",
            name="ck_observation_targets_scope_region",
        ),
        sa.CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'needs_input')",
            name="ck_observation_targets_status",
        ),
        sa.CheckConstraint(
            "result_source IS NULL OR result_source IN ('photo_analysis', 'user_record')",
            name="ck_observation_targets_result_source",
        ),
    )
    op.create_index("ix_observation_targets_record_id", "observation_targets", ["record_id"])
    op.create_index("ix_observation_targets_user_id", "observation_targets", ["user_id"])
    op.create_index("ix_observation_targets_trace_id", "observation_targets", ["trace_id"])
    op.create_index(
        "uq_observation_targets_record_full_face",
        "observation_targets",
        ["record_id"],
        unique=True,
        postgresql_where=sa.text("scope_type = 'full_face' AND region_id IS NULL"),
    )
    op.create_index(
        "uq_observation_targets_record_region",
        "observation_targets",
        ["record_id", "region_id"],
        unique=True,
        postgresql_where=sa.text("scope_type = 'region' AND region_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_observation_targets_record_region", table_name="observation_targets")
    op.drop_index("uq_observation_targets_record_full_face", table_name="observation_targets")
    op.drop_index("ix_observation_targets_trace_id", table_name="observation_targets")
    op.drop_index("ix_observation_targets_user_id", table_name="observation_targets")
    op.drop_index("ix_observation_targets_record_id", table_name="observation_targets")
    op.drop_table("observation_targets")

    op.drop_index(
        "uq_observation_records_user_client_request_id", table_name="observation_records"
    )
    op.drop_index("ix_observation_records_recorded_at", table_name="observation_records")
    op.drop_index("ix_observation_records_user_id", table_name="observation_records")
    op.drop_table("observation_records")
