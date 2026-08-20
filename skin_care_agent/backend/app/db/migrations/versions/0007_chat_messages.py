"""chat_messages

Revision ID: 0007_chat_messages
Revises: 0006_compliance_fields
Create Date: 2026-07-03

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0007_chat_messages"
down_revision: Union[str, None] = "0006_compliance_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "ai_call_log_id",
            sa.BigInteger(),
            sa.ForeignKey("ai_call_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "analysis_id",
            sa.BigInteger(),
            sa.ForeignKey("analyses.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_message", sa.Text(), nullable=False),
        sa.Column("assistant_message", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column(
            "medical_intervention",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "context_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column(
            "compliance_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_messages_user_id", "chat_messages", ["user_id"])
    op.create_index("ix_chat_messages_analysis_id", "chat_messages", ["analysis_id"])
    op.create_index("ix_chat_messages_created_at", "chat_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_created_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_analysis_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_user_id", table_name="chat_messages")
    op.drop_table("chat_messages")
