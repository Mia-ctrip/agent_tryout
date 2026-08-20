"""add structured diary data to check-ins

Revision ID: 0010_check_in_diary
Revises: 0009_check_ins
Create Date: 2026-07-14

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0010_check_in_diary"
down_revision: Union[str, None] = "0009_check_ins"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "check_ins",
        sa.Column(
            "diary_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "check_ins",
        sa.Column("diary_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_check_ins_diary_data_object",
        "check_ins",
        "diary_data IS NULL OR jsonb_typeof(diary_data) = 'object'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_check_ins_diary_data_object", "check_ins", type_="check")
    op.drop_column("check_ins", "diary_updated_at")
    op.drop_column("check_ins", "diary_data")
