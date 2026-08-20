"""make patch lineages check-in observation aware

Revision ID: 0011_check_in_lineages
Revises: 0010_check_in_diary
Create Date: 2026-07-15

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0011_check_in_lineages"
down_revision: Union[str, None] = "0010_check_in_diary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "photos",
        sa.Column("lineage_tracked_analysis_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "photos",
        sa.Column("lineage_tracked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_photos_lineage_tracked_analysis_id",
        "photos",
        "analyses",
        ["lineage_tracked_analysis_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("patch_lineages", sa.Column("first_seen_on", sa.Date(), nullable=True))
    op.add_column("patch_lineages", sa.Column("last_seen_on", sa.Date(), nullable=True))
    op.add_column("patch_lineages", sa.Column("last_observed_on", sa.Date(), nullable=True))
    op.add_column(
        "patch_lineages",
        sa.Column("last_seen_check_in_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "patch_lineages",
        sa.Column(
            "consecutive_missing_observations",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "patch_lineages",
        sa.Column(
            "status_reason",
            sa.String(length=64),
            nullable=False,
            server_default="present_in_latest_observation",
        ),
    )
    op.create_foreign_key(
        "fk_patch_lineages_last_seen_check_in_id",
        "patch_lineages",
        "check_ins",
        ["last_seen_check_in_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "patch_lineage_snapshots",
        sa.Column("check_in_id", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "patch_lineage_snapshots",
        sa.Column("observed_on", sa.Date(), nullable=True),
    )
    op.create_foreign_key(
        "fk_patch_lineage_snapshots_check_in_id",
        "patch_lineage_snapshots",
        "check_ins",
        ["check_in_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "patch_lineage_observations",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "lineage_id",
            sa.BigInteger(),
            sa.ForeignKey("patch_lineages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "check_in_id",
            sa.BigInteger(),
            sa.ForeignKey("check_ins.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "analysis_id",
            sa.BigInteger(),
            sa.ForeignKey("analyses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "photo_id",
            sa.BigInteger(),
            sa.ForeignKey("photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("view_type", sa.String(length=16), nullable=False),
        sa.Column("observed_on", sa.Date(), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("advances_state", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reason", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "outcome IN ('present', 'missing')",
            name="ck_patch_lineage_observations_outcome",
        ),
        sa.UniqueConstraint(
            "lineage_id",
            "photo_id",
            name="uq_patch_lineage_observations_lineage_photo",
        ),
    )

    op.create_index(
        "ix_patch_lineages_last_observed_on",
        "patch_lineages",
        ["last_observed_on"],
    )
    op.create_index(
        "ix_patch_lineage_snapshots_check_in_id",
        "patch_lineage_snapshots",
        ["check_in_id"],
    )
    op.create_index(
        "ix_patch_lineage_snapshots_observed_on",
        "patch_lineage_snapshots",
        ["observed_on"],
    )
    for column in (
        "lineage_id",
        "check_in_id",
        "analysis_id",
        "photo_id",
        "user_id",
        "observed_on",
    ):
        op.create_index(
            f"ix_patch_lineage_observations_{column}",
            "patch_lineage_observations",
            [column],
        )

    op.execute(
        """
        UPDATE patch_lineage_snapshots AS snapshot
        SET check_in_id = photo.check_in_id,
            observed_on = COALESCE(
                check_in.observed_on,
                (COALESCE(photo.taken_at, snapshot.created_at) AT TIME ZONE 'UTC')::date
            )
        FROM photos AS photo
        LEFT JOIN check_ins AS check_in ON check_in.id = photo.check_in_id
        WHERE photo.id = snapshot.photo_id
        """
    )
    op.execute(
        """
        UPDATE patch_lineage_snapshots
        SET observed_on = (created_at AT TIME ZONE 'UTC')::date
        WHERE observed_on IS NULL
        """
    )
    op.execute(
        """
        UPDATE patch_lineages
        SET first_seen_on = (first_seen_at AT TIME ZONE 'UTC')::date,
            last_seen_on = (last_seen_at AT TIME ZONE 'UTC')::date,
            last_observed_on = (last_seen_at AT TIME ZONE 'UTC')::date,
            status = 'active',
            consecutive_missing_observations = 0,
            status_reason = 'backfilled_present_without_missing_evidence'
        """
    )
    op.execute(
        """
        UPDATE patch_lineages AS lineage
        SET last_seen_check_in_id = latest.check_in_id
        FROM (
            SELECT DISTINCT ON (lineage_id)
                   lineage_id, check_in_id
            FROM patch_lineage_snapshots
            ORDER BY lineage_id, observed_on DESC, created_at DESC, id DESC
        ) AS latest
        WHERE latest.lineage_id = lineage.id
        """
    )
    op.execute(
        """
        INSERT INTO patch_lineage_observations (
            lineage_id, check_in_id, analysis_id, photo_id, user_id,
            view_type, observed_on, outcome, advances_state, reason, created_at
        )
        SELECT DISTINCT ON (lineage_id, photo_id)
               lineage_id, check_in_id, analysis_id, photo_id, user_id,
               view_type, observed_on, 'present', true, 'backfilled_snapshot', created_at
        FROM patch_lineage_snapshots
        ORDER BY lineage_id, photo_id, observed_on DESC, created_at DESC, id DESC
        ON CONFLICT (lineage_id, photo_id) DO NOTHING
        """
    )
    op.execute(
        """
        UPDATE photos AS photo
        SET lineage_tracked_analysis_id = latest.id,
            lineage_tracked_at = latest.created_at
        FROM (
            SELECT DISTINCT ON (analysis.photo_id)
                   analysis.photo_id, analysis.id, analysis.created_at
            FROM analyses AS analysis
            JOIN photos AS source_photo ON source_photo.id = analysis.photo_id
            LEFT JOIN check_ins AS source_check_in
                   ON source_check_in.id = source_photo.check_in_id
            WHERE analysis.deleted_at IS NULL
              AND (
                  source_photo.check_in_id IS NULL
                  OR source_check_in.status = 'complete'
              )
            ORDER BY analysis.photo_id, analysis.created_at DESC, analysis.id DESC
        ) AS latest
        WHERE latest.photo_id = photo.id
        """
    )

    op.alter_column("patch_lineages", "first_seen_on", nullable=False)
    op.alter_column("patch_lineages", "last_seen_on", nullable=False)
    op.alter_column("patch_lineages", "last_observed_on", nullable=False)
    op.alter_column("patch_lineage_snapshots", "observed_on", nullable=False)


def downgrade() -> None:
    op.drop_table("patch_lineage_observations")

    op.drop_index(
        "ix_patch_lineage_snapshots_observed_on",
        table_name="patch_lineage_snapshots",
    )
    op.drop_index(
        "ix_patch_lineage_snapshots_check_in_id",
        table_name="patch_lineage_snapshots",
    )
    op.drop_constraint(
        "fk_patch_lineage_snapshots_check_in_id",
        "patch_lineage_snapshots",
        type_="foreignkey",
    )
    op.drop_column("patch_lineage_snapshots", "observed_on")
    op.drop_column("patch_lineage_snapshots", "check_in_id")

    op.drop_index("ix_patch_lineages_last_observed_on", table_name="patch_lineages")
    op.drop_constraint(
        "fk_patch_lineages_last_seen_check_in_id",
        "patch_lineages",
        type_="foreignkey",
    )
    op.drop_column("patch_lineages", "status_reason")
    op.drop_column("patch_lineages", "consecutive_missing_observations")
    op.drop_column("patch_lineages", "last_seen_check_in_id")
    op.drop_column("patch_lineages", "last_observed_on")
    op.drop_column("patch_lineages", "last_seen_on")
    op.drop_column("patch_lineages", "first_seen_on")

    op.drop_constraint(
        "fk_photos_lineage_tracked_analysis_id",
        "photos",
        type_="foreignkey",
    )
    op.drop_column("photos", "lineage_tracked_at")
    op.drop_column("photos", "lineage_tracked_analysis_id")
