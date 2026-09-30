from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class RegionInsight(Base, IdMixin, TimestampMixin):
    """Derived, regenerable region comparison or stage trend (spec 6.9).

    One row per input fingerprint. Comparisons are cached per photo pair and prompt
    version; a trend gets a new row when its window changes and the previous completed
    row is marked ``superseded_at`` only after the new one is published.
    """

    __tablename__ = "region_insights"
    __table_args__ = (
        CheckConstraint("kind IN ('comparison', 'trend')", name="ck_region_insights_kind"),
        CheckConstraint(
            "status IN ('processing', 'completed', 'degraded', 'failed')",
            name="ck_region_insights_status",
        ),
        CheckConstraint(
            "region_id IN ('forehead', 'left_face', 'right_face', "
            "'nose_area', 'mouth_area', 'chin')",
            name="ck_region_insights_region_id",
        ),
        CheckConstraint(
            "(kind = 'comparison' AND earlier_target_id IS NOT NULL "
            "AND later_target_id IS NOT NULL) OR "
            "(kind = 'trend' AND earlier_target_id IS NULL AND later_target_id IS NULL)",
            name="ck_region_insights_comparison_pair",
        ),
        Index(
            "uq_region_insights_user_kind_fingerprint",
            "user_id",
            "kind",
            "input_fingerprint",
            unique=True,
        ),
        Index(
            "ix_region_insights_event_kind",
            "user_id",
            "region_event_id",
            "kind",
            "superseded_at",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    region_event_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("region_events.id", ondelete="CASCADE"), nullable=False
    )
    region_id: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="processing")
    # Bumped on each (re)claim; a worker only writes back if its attempt is still current.
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    input_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    earlier_target_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("observation_targets.id", ondelete="CASCADE"), nullable=True
    )
    later_target_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("observation_targets.id", ondelete="CASCADE"), nullable=True
    )
    referenced_target_ids: Mapped[list[int]] = mapped_column(JSONB, nullable=False)
    # T-id → target, date, image/crop mode; kept server side so model output can only cite
    # timepoints that were actually sent.
    timepoint_map: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    input_meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(64), nullable=False)
    schema_version: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    trace_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    failure_code: Mapped[Optional[str]] = mapped_column(String(48), nullable=True)
    processing_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
