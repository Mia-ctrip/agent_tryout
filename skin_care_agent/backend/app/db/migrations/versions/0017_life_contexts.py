"""observation life contexts

Revision ID: 0017_life_contexts
Revises: 0016_products_and_uses
Create Date: 2026-08-24
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0017_life_contexts"
down_revision: Union[str, None] = "0016_products_and_uses"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "observation_records",
        sa.Column("life_context_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "observation_life_contexts",
        sa.Column(
            "observation_id",
            sa.BigInteger(),
            sa.ForeignKey("observation_records.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("context_id", sa.String(length=32), primary_key=True),
        sa.CheckConstraint(
            "context_id IN ('sleep', 'stress', 'diet', 'mood', 'menstrual_cycle', 'care_change')",
            name="ck_observation_life_contexts_context_id",
        ),
    )
    op.create_index(
        "ix_observation_life_contexts_context_id",
        "observation_life_contexts",
        ["context_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_observation_life_contexts_context_id",
        table_name="observation_life_contexts",
    )
    op.drop_table("observation_life_contexts")
    op.drop_column("observation_records", "life_context_completed_at")
