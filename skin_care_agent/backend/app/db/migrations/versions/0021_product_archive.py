"""Add soft-archive support for personal products.

Revision ID: 0021
Revises: 0020_region_insights
Create Date: 2026-09-30 11:00:00.000000

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0021'
down_revision = '0020_region_insights'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('personal_products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index('ix_personal_products_archived_at', ['archived_at'])


def downgrade() -> None:
    with op.batch_alter_table('personal_products', schema=None) as batch_op:
        batch_op.drop_index('ix_personal_products_archived_at')
        batch_op.drop_column('archived_at')
