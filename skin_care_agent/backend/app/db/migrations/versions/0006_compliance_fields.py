"""ai_call_logs: add schema_errors / compliance_flags / validation_warnings

Revision ID: 0006_compliance_fields
Revises: 0005_reasoning_fields
Create Date: 2026-07-03

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0006_compliance_fields"
down_revision: Union[str, None] = "0005_reasoning_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_call_logs",
        sa.Column("schema_errors", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "ai_call_logs",
        sa.Column(
            "compliance_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )
    op.add_column(
        "ai_call_logs",
        sa.Column(
            "validation_warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("ai_call_logs", "validation_warnings")
    op.drop_column("ai_call_logs", "compliance_flags")
    op.drop_column("ai_call_logs", "schema_errors")
