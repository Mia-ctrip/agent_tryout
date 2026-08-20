from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class CheckIn(Base, IdMixin, TimestampMixin):
    """一次用户记录；standard 记录包含正面、左侧、右侧三张标准照片。"""

    __tablename__ = "check_ins"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="standard")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    observed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    diary_data: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB(none_as_null=True),
        nullable=True,
    )
    diary_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    client_request_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
