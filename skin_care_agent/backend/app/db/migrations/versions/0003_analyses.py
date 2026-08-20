"""analyses + ai_call_logs

Revision ID: 0003_analyses
Revises: 0002_ai_usage
Create Date: 2026-07-02

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0003_analyses"
down_revision: Union[str, None] = "0002_ai_usage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_call_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column(
            "input_meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ai_call_logs_user_id", "ai_call_logs", ["user_id"])
    op.create_index("ix_ai_call_logs_kind", "ai_call_logs", ["kind"])
    op.create_index("ix_ai_call_logs_status", "ai_call_logs", ["status"])

    op.create_table(
        "analyses",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "photo_id",
            sa.BigInteger(),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ai_call_log_id",
            sa.BigInteger(),
            sa.ForeignKey("ai_call_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column(
            "parsed_result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("overall_severity", sa.Integer(), nullable=True),
        sa.Column("skin_health_index", sa.Integer(), nullable=True),
        sa.Column(
            "needs_doctor", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_analyses_user_id", "analyses", ["user_id"])
    op.create_index("ix_analyses_photo_id", "analyses", ["photo_id"])
    op.create_index("ix_analyses_created_at", "analyses", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_analyses_created_at", table_name="analyses")
    op.drop_index("ix_analyses_photo_id", table_name="analyses")
    op.drop_index("ix_analyses_user_id", table_name="analyses")
    op.drop_table("analyses")
    op.drop_index("ix_ai_call_logs_status", table_name="ai_call_logs")
    op.drop_index("ix_ai_call_logs_kind", table_name="ai_call_logs")
    op.drop_index("ix_ai_call_logs_user_id", table_name="ai_call_logs")
    op.drop_table("ai_call_logs")
