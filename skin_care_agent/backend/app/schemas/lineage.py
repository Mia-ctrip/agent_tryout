from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel


class LineageSnapshotOut(BaseModel):
    snapshot_id: int
    analysis_id: int
    photo_id: int
    check_in_id: Optional[int] = None
    patch_id: str
    view_type: str
    observed_on: date
    bbox_norm: list[float]
    area_ratio: float
    coverage: str
    dominant_type: str
    estimated_count: int
    inflammation: str
    severity: int
    match_info: Optional[dict[str, Any]] = None
    created_at: datetime


class LineageObservationOut(BaseModel):
    observation_id: int
    check_in_id: Optional[int] = None
    analysis_id: int
    photo_id: int
    view_type: str
    observed_on: date
    outcome: str
    advances_state: bool
    reason: str
    created_at: datetime


class LineageOut(BaseModel):
    lineage_id: int
    view_type: str
    region: str
    status: str
    first_seen_at: datetime
    last_seen_at: datetime
    first_seen_on: date
    last_seen_on: date
    last_observed_on: date
    last_seen_check_in_id: Optional[int] = None
    consecutive_missing_observations: int
    status_reason: str
    snapshot_count: int
    duration_days: int
    latest: Optional[LineageSnapshotOut] = None


class LineageDetailOut(LineageOut):
    snapshots: list[LineageSnapshotOut]
    observations: list[LineageObservationOut]
    trend: dict[str, Any]
