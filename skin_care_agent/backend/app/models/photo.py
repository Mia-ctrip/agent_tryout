from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Photo(Base, IdMixin, TimestampMixin):
    __tablename__ = "photos"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    check_in_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("check_ins.id", ondelete="SET NULL"), nullable=True, index=True
    )
    view_type: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    client_request_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)

    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    processed_storage_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    taken_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    quality_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    quality_meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    lineage_tracked_analysis_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("analyses.id", ondelete="SET NULL"),
        nullable=True,
    )
    lineage_tracked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
