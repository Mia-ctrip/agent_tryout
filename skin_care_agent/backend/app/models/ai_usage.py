from __future__ import annotations

from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin


class AIUsageCounter(Base, IdMixin):
    """Daily per-user quota counter. Atomic increments via INSERT ... ON CONFLICT."""

    __tablename__ = "ai_usage_counters"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "usage_date", name="uq_ai_usage_key"),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # analyze / chat
    usage_date: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
