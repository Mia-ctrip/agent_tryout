from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class AICallLog(Base, IdMixin, TimestampMixin):
    """全量 AI 调用日志：成功/失败都落，用于成本核算 + 排障。

    一次业务请求（trace_id）可能对应多条日志（每次 fallback 一条）。
    """

    __tablename__ = "ai_call_logs"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # success / llm_failed / parse_failed / quota_exceeded / dead / retryable_exhausted
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    trace_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    attempt_seq: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    input_meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    request_payload: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    raw_response: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    reasoning_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parse_strategy: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # direct / extracted / failed / n/a（非 JSON 任务）
    schema_errors: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True
    )
    compliance_flags: Mapped[Optional[list[dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True
    )
    validation_warnings: Mapped[Optional[dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
