"""regional observation target fields

Revision ID: 0014_region_observation_targets
Revises: 0013_full_face_observations
Create Date: 2026-08-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0014_region_observation_targets"
down_revision: Union[str, None] = "0013_full_face_observations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "observation_records",
        sa.Column("recorded_timezone_offset_minutes", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "observation_records",
        sa.Column("recorded_local_date", sa.Date(), nullable=True),
    )
    op.create_index(
        "ix_observation_records_recorded_local_date",
        "observation_records",
        ["recorded_local_date"],
    )
    op.create_check_constraint(
        "ck_observation_records_timezone_offset",
        "observation_records",
        "recorded_timezone_offset_minutes IS NULL OR "
        "recorded_timezone_offset_minutes BETWEEN -840 AND 840",
    )

    op.add_column(
        "observation_targets",
        sa.Column("user_note", sa.Text(), nullable=True),
    )
    op.create_check_constraint(
        "ck_observation_targets_region_id",
        "observation_targets",
        "region_id IS NULL OR region_id IN "
        "('forehead', 'left_face', 'right_face', 'nose_area', 'mouth_area', 'chin')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_observation_targets_region_id",
        "observation_targets",
        type_="check",
    )
    op.drop_column("observation_targets", "user_note")

    op.drop_constraint(
        "ck_observation_records_timezone_offset",
        "observation_records",
        type_="check",
    )
    op.drop_index(
        "ix_observation_records_recorded_local_date",
        table_name="observation_records",
    )
    op.drop_column("observation_records", "recorded_local_date")
    op.drop_column("observation_records", "recorded_timezone_offset_minutes")
