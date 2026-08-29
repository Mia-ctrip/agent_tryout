from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class RegionEvent(Base, IdMixin, TimestampMixin):
    __tablename__ = "region_events"
    __table_args__ = (
        CheckConstraint(
            "region_id IN ('forehead', 'left_face', 'right_face', "
            "'nose_area', 'mouth_area', 'chin')",
            name="ck_region_events_region_id",
        ),
        CheckConstraint(
            "status IN ('pending', 'current', 'ended')",
            name="ck_region_events_status",
        ),
        CheckConstraint(
            "end_reason IS NULL OR end_reason IN ('user_ended', 'replaced')",
            name="ck_region_events_end_reason",
        ),
        Index(
            "uq_region_events_user_region_current",
            "user_id",
            "region_id",
            unique=True,
            postgresql_where=text("status = 'current' AND deleted_at IS NULL"),
        ),
        Index(
            "uq_region_events_user_region_pending",
            "user_id",
            "region_id",
            unique=True,
            postgresql_where=text("status = 'pending' AND deleted_at IS NULL"),
        ),
        Index("ix_region_events_user_status", "user_id", "status"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    region_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    previous_event_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("region_events.id", ondelete="SET NULL"), nullable=True
    )
    started_local_date: Mapped[date] = mapped_column(Date, nullable=False)
    last_valid_local_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ended_local_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_reason: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
