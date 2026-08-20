"""ai_call_logs: add trace_id / attempt_seq / request_payload

Revision ID: 0004_ai_call_log_trace
Revises: 0003_analyses
Create Date: 2026-07-03

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0004_ai_call_log_trace"
down_revision: Union[str, None] = "0003_analyses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_call_logs",
        sa.Column("trace_id", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "ai_call_logs",
        sa.Column("attempt_seq", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "ai_call_logs",
        sa.Column(
            "request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )
    op.create_index("ix_ai_call_logs_trace_id", "ai_call_logs", ["trace_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_call_logs_trace_id", table_name="ai_call_logs")
    op.drop_column("ai_call_logs", "request_payload")
    op.drop_column("ai_call_logs", "attempt_seq")
    op.drop_column("ai_call_logs", "trace_id")
