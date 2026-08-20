from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class ChatMessage(Base, IdMixin, TimestampMixin):
    """一次问答对。业务表，只落成功的问答；失败/合规拦截去 ai_call_logs。"""

    __tablename__ = "chat_messages"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ai_call_log_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("ai_call_logs.id", ondelete="SET NULL"), nullable=True
    )
    analysis_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("analyses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    user_message: Mapped[str] = mapped_column(Text, nullable=False)
    assistant_message: Mapped[str] = mapped_column(Text, nullable=False)

    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)

    # 命中医疗兜底时置 true，assistant_message 直接是服务端预设回复
    medical_intervention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # 前端传的上下文摘要（analysis_id / history 长度等）+ 合规命中信息
    context_meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    compliance_flags: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True
    )

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
