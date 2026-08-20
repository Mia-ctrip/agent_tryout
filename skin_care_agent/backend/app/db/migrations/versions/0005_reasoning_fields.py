"""ai_call_logs: add reasoning_text / parse_strategy

Revision ID: 0005_reasoning_fields
Revises: 0004_ai_call_log_trace
Create Date: 2026-07-03

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0005_reasoning_fields"
down_revision: Union[str, None] = "0004_ai_call_log_trace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_call_logs", sa.Column("reasoning_text", sa.Text(), nullable=True))
    op.add_column(
        "ai_call_logs", sa.Column("parse_strategy", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("ai_call_logs", "parse_strategy")
    op.drop_column("ai_call_logs", "reasoning_text")
