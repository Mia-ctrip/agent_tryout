from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class PatchLineage(Base, IdMixin, TimestampMixin):
    """一条持续存在的痘斑病灶群追踪主线；不同拍摄视角互相隔离。"""

    __tablename__ = "patch_lineages"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    view_type: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    region: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")

    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_seen_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_seen_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_observed_on: Mapped[date] = mapped_column(Date, nullable=False)
    last_seen_check_in_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("check_ins.id", ondelete="SET NULL"),
        nullable=True,
    )
    consecutive_missing_observations: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    status_reason: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="present_in_latest_observation",
    )
    snapshot_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PatchLineageSnapshot(Base, IdMixin):
    """一次分析中，某个 patch 被匹配到 lineage 后保存的属性快照。"""

    __tablename__ = "patch_lineage_snapshots"

    lineage_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("patch_lineages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    analysis_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    photo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("photos.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    patch_id: Mapped[str] = mapped_column(String(16), nullable=False)
    check_in_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("check_ins.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    observed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    view_type: Mapped[str] = mapped_column(String(16), nullable=False, default="legacy")
    region: Mapped[str] = mapped_column(String(32), nullable=False)
    bbox_norm: Mapped[list[float]] = mapped_column(JSONB, nullable=False)
    area_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    coverage: Mapped[str] = mapped_column(String(16), nullable=False)
    dominant_type: Mapped[str] = mapped_column(String(16), nullable=False)
    estimated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inflammation: Mapped[str] = mapped_column(String(16), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    match_info: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PatchLineageObservation(Base, IdMixin):
    """一次同视角有效照片对某条 lineage 提供的 present/missing 证据。"""

    __tablename__ = "patch_lineage_observations"
    __table_args__ = (
        UniqueConstraint(
            "lineage_id",
            "photo_id",
            name="uq_patch_lineage_observations_lineage_photo",
        ),
    )

    lineage_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("patch_lineages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    check_in_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("check_ins.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    analysis_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    photo_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("photos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    view_type: Mapped[str] = mapped_column(String(16), nullable=False)
    observed_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    advances_state: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
