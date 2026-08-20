"""app identities, sessions, consents and mobile idempotency

Revision ID: 0012_app_foundation
Revises: 0011_check_in_lineages
Create Date: 2026-07-16

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0012_app_foundation"
down_revision: Union[str, None] = "0011_check_in_lineages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_identities",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_subject", sa.String(length=320), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "provider",
            "provider_subject",
            name="uq_user_identities_provider_subject",
        ),
        sa.UniqueConstraint(
            "user_id",
            "provider",
            name="uq_user_identities_user_provider",
        ),
    )
    op.create_index(
        "ix_user_identities_user_id",
        "user_identities",
        ["user_id"],
    )
    op.execute(
        """
        INSERT INTO user_identities (
            user_id, provider, provider_subject, verified_at, created_at
        )
        SELECT id, 'wechat', wx_openid, created_at, created_at
        FROM users
        WHERE wx_openid IS NOT NULL
        """
    )
    op.drop_constraint("users_wx_openid_key", "users", type_="unique")
    op.drop_column("users", "wx_openid")
    op.execute(
        """
        SELECT setval(
            pg_get_serial_sequence('users', 'id'),
            COALESCE(MAX(id), 1),
            MAX(id) IS NOT NULL
        )
        FROM users
        """
    )

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("access_token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("device_name", sa.String(length=128), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index(
        "ix_auth_sessions_access_expires_at",
        "auth_sessions",
        ["access_expires_at"],
    )
    op.create_index(
        "ix_auth_sessions_refresh_expires_at",
        "auth_sessions",
        ["refresh_expires_at"],
    )
    op.create_index("ix_auth_sessions_revoked_at", "auth_sessions", ["revoked_at"])

    op.create_table(
        "user_consents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("consent_type", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="app"),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.UniqueConstraint(
            "user_id",
            "consent_type",
            "version",
            name="uq_user_consents_user_type_version",
        ),
    )
    op.create_index("ix_user_consents_user_id", "user_consents", ["user_id"])

    op.add_column(
        "check_ins",
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "uq_check_ins_user_client_request_id",
        "check_ins",
        ["user_id", "client_request_id"],
        unique=True,
        postgresql_where=sa.text("client_request_id IS NOT NULL"),
    )
    op.add_column(
        "photos",
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "uq_photos_user_client_request_id",
        "photos",
        ["user_id", "client_request_id"],
        unique=True,
        postgresql_where=sa.text("client_request_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_photos_user_client_request_id", table_name="photos")
    op.drop_column("photos", "client_request_id")
    op.drop_index("uq_check_ins_user_client_request_id", table_name="check_ins")
    op.drop_column("check_ins", "client_request_id")

    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")

    op.drop_index("ix_auth_sessions_revoked_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_refresh_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_access_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.add_column("users", sa.Column("wx_openid", sa.String(length=64), nullable=True))
    op.execute(
        """
        UPDATE users AS target
        SET wx_openid = identity.provider_subject
        FROM user_identities AS identity
        WHERE identity.user_id = target.id
          AND identity.provider = 'wechat'
        """
    )
    op.create_unique_constraint("users_wx_openid_key", "users", ["wx_openid"])
    op.drop_index("ix_user_identities_user_id", table_name="user_identities")
    op.drop_table("user_identities")
