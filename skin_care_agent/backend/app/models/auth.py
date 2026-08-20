from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class UserIdentity(Base, IdMixin):
    """平台无关的登录身份；同一用户未来可绑定不同 provider。"""

    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_subject",
            name="uq_user_identities_provider_subject",
        ),
        UniqueConstraint(
            "user_id",
            "provider",
            name="uq_user_identities_user_provider",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(320), nullable=False)
    secret_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class AuthSession(Base, IdMixin):
    """可撤销、可轮换的 App 登录会话；数据库中只保存 token 哈希。"""

    __tablename__ = "auth_sessions"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    access_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
    )
    access_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    refresh_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )
    device_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    device_name: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class UserConsent(Base, IdMixin):
    """用户对某一明确版本协议的接受或撤回记录。"""

    __tablename__ = "user_consents"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "consent_type",
            "version",
            name="uq_user_consents_user_type_version",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consent_type: Mapped[str] = mapped_column(String(32), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="app")
    app_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
