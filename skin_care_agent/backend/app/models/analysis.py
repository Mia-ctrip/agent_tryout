from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class Analysis(Base, IdMixin, TimestampMixin):
    """成功的 vision_analyze 结果。失败只落 ai_call_logs。"""

    __tablename__ = "analyses"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    photo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("photos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ai_call_log_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("ai_call_logs.id", ondelete="SET NULL"), nullable=True
    )

    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)

    parsed_result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    # 冗余字段：趋势查询高频使用，直接列存避免每次 JSONB 抽取
    overall_severity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    skin_health_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    needs_doctor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
