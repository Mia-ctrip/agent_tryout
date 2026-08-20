"""ai_usage_counters

Revision ID: 0002_ai_usage
Revises: 0001_init
Create Date: 2026-07-01

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0002_ai_usage"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_usage_counters",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("user_id", "kind", "usage_date", name="uq_ai_usage_key"),
    )


def downgrade() -> None:
    op.drop_table("ai_usage_counters")
