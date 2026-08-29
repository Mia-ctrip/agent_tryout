from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class ObservationRecord(Base, IdMixin, TimestampMixin):
    __tablename__ = "observation_records"
    __table_args__ = (
        Index(
            "uq_observation_records_user_client_request_id",
            "user_id",
            "client_request_id",
            unique=True,
        ),
        CheckConstraint("status IN ('saved')", name="ck_observation_records_status"),
        CheckConstraint(
            "recorded_timezone_offset_minutes IS NULL OR "
            "recorded_timezone_offset_minutes BETWEEN -840 AND 840",
            name="ck_observation_records_timezone_offset",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_request_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    recorded_timezone_offset_minutes: Mapped[Optional[int]] = mapped_column(
        SmallInteger, nullable=True
    )
    recorded_local_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    photo_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("photos.id", ondelete="RESTRICT"), nullable=True, unique=True
    )
    user_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    life_context_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="saved")


class ObservationTarget(Base, IdMixin, TimestampMixin):
    __tablename__ = "observation_targets"
    __table_args__ = (
        CheckConstraint(
            "(scope_type = 'full_face' AND region_id IS NULL) OR "
            "(scope_type = 'region' AND region_id IS NOT NULL)",
            name="ck_observation_targets_scope_region",
        ),
        CheckConstraint(
            "status IN ('queued', 'processing', 'completed', 'needs_input')",
            name="ck_observation_targets_status",
        ),
        CheckConstraint(
            "result_source IS NULL OR result_source IN ('photo_analysis', 'user_record')",
            name="ck_observation_targets_result_source",
        ),
        CheckConstraint(
            "region_id IS NULL OR region_id IN "
            "('forehead', 'left_face', 'right_face', 'nose_area', 'mouth_area', 'chin')",
            name="ck_observation_targets_region_id",
        ),
        Index(
            "uq_observation_targets_record_full_face",
            "record_id",
            unique=True,
            postgresql_where=text("scope_type = 'full_face' AND region_id IS NULL"),
        ),
        Index(
            "uq_observation_targets_record_region",
            "record_id",
            "region_id",
            unique=True,
            postgresql_where=text("scope_type = 'region' AND region_id IS NOT NULL"),
        ),
    )

    record_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("observation_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scope_type: Mapped[str] = mapped_column(String(16), nullable=False, default="full_face")
    region_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    region_event_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("region_events.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    result_source: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    facts: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    trace_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    prompt_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    schema_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    failure_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
