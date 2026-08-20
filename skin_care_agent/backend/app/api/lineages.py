from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.check_in import CheckIn
from app.models.patch_lineage import (
    PatchLineage,
    PatchLineageObservation,
    PatchLineageSnapshot,
)
from app.models.photo import Photo
from app.models.user import User
from app.schemas.lineage import (
    LineageDetailOut,
    LineageObservationOut,
    LineageOut,
    LineageSnapshotOut,
)


router = APIRouter(prefix="/lineages", tags=["lineages"])


def _snap_to_out(s: PatchLineageSnapshot) -> LineageSnapshotOut:
    return LineageSnapshotOut(
        snapshot_id=s.id,
        analysis_id=s.analysis_id,
        photo_id=s.photo_id,
        check_in_id=s.check_in_id,
        patch_id=s.patch_id,
        view_type=s.view_type,
        observed_on=s.observed_on,
        bbox_norm=s.bbox_norm,
        area_ratio=s.area_ratio,
        coverage=s.coverage,
        dominant_type=s.dominant_type,
        estimated_count=s.estimated_count,
        inflammation=s.inflammation,
        severity=s.severity,
        match_info=s.match_info,
        created_at=s.created_at,
    )


def _observation_to_out(
    observation: PatchLineageObservation,
) -> LineageObservationOut:
    return LineageObservationOut(
        observation_id=observation.id,
        check_in_id=observation.check_in_id,
        analysis_id=observation.analysis_id,
        photo_id=observation.photo_id,
        view_type=observation.view_type,
        observed_on=observation.observed_on,
        outcome=observation.outcome,
        advances_state=observation.advances_state,
        reason=observation.reason,
        created_at=observation.created_at,
    )


def _duration_days(lineage: PatchLineage) -> int:
    return max(0, (lineage.last_seen_on - lineage.first_seen_on).days)


def _summarize_trend(snapshots: list[PatchLineageSnapshot]) -> dict[str, Any]:
    """按时间序列出关键变化摘要。"""
    if not snapshots:
        return {}
    snapshots = sorted(
        snapshots,
        key=lambda s: (s.observed_on, s.created_at, s.id),
    )
    first = snapshots[0]
    last = snapshots[-1]
    return {
        "count_delta": last.estimated_count - first.estimated_count,
        "severity_delta": last.severity - first.severity,
        "coverage_trajectory": [s.coverage for s in snapshots],
        "type_trajectory": [s.dominant_type for s in snapshots],
        "inflammation_start": first.inflammation,
        "inflammation_end": last.inflammation,
    }


def _lineage_to_out(
    lineage: PatchLineage,
    latest: Optional[PatchLineageSnapshot],
) -> LineageOut:
    return LineageOut(
        lineage_id=lineage.id,
        view_type=lineage.view_type,
        region=lineage.region,
        status=lineage.status,
        first_seen_at=lineage.first_seen_at,
        last_seen_at=lineage.last_seen_at,
        first_seen_on=lineage.first_seen_on,
        last_seen_on=lineage.last_seen_on,
        last_observed_on=lineage.last_observed_on,
        last_seen_check_in_id=lineage.last_seen_check_in_id,
        consecutive_missing_observations=(lineage.consecutive_missing_observations),
        status_reason=lineage.status_reason,
        snapshot_count=lineage.snapshot_count,
        duration_days=_duration_days(lineage),
        latest=_snap_to_out(latest) if latest is not None else None,
    )


@router.get("", response_model=list[LineageOut])
def list_lineages(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    region: Optional[str] = Query(default=None),
    view_type: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[LineageOut]:
    """当前用户的所有 lineage，按最新出现时间倒序。"""
    stmt = (
        select(PatchLineage)
        .where(
            PatchLineage.user_id == current_user.id,
            PatchLineage.deleted_at.is_(None),
        )
        .order_by(
            PatchLineage.last_observed_on.desc(),
            PatchLineage.id.desc(),
        )
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(PatchLineage.status == status_filter)
    if region:
        stmt = stmt.where(PatchLineage.region == region)
    if view_type:
        stmt = stmt.where(PatchLineage.view_type == view_type)

    lineages = list(db.execute(stmt).scalars())
    if not lineages:
        return []

    # 一次查所有 lineage 的最新 snapshot（O(N) 而不是 N+1）
    ids = [lineage.id for lineage in lineages]
    snap_stmt = (
        select(PatchLineageSnapshot)
        .where(PatchLineageSnapshot.lineage_id.in_(ids))
        .order_by(
            PatchLineageSnapshot.lineage_id,
            PatchLineageSnapshot.observed_on.desc(),
            PatchLineageSnapshot.created_at.desc(),
            PatchLineageSnapshot.id.desc(),
        )
    )
    latest_by_lineage: dict[int, PatchLineageSnapshot] = {}
    for snap in db.execute(snap_stmt).scalars():
        if snap.lineage_id not in latest_by_lineage:
            latest_by_lineage[snap.lineage_id] = snap

    return [_lineage_to_out(lineage, latest_by_lineage.get(lineage.id)) for lineage in lineages]


@router.get("/by-photo/{photo_id}", response_model=list[LineageOut])
def list_lineages_by_photo(
    photo_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[LineageOut]:
    """一张照片的所有 patch 对应的 lineage（用于展示"这张照片的每片痘斑是从哪来的"）。"""
    photo = db.get(Photo, photo_id)
    if photo is None or photo.deleted_at is not None or photo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="photo not found")

    # 找该 photo 相关的所有 snapshots → 拿唯一的 lineage_ids
    snaps = list(
        db.execute(
            select(PatchLineageSnapshot)
            .where(PatchLineageSnapshot.photo_id == photo_id)
            .order_by(PatchLineageSnapshot.created_at.desc())
        ).scalars()
    )
    if not snaps:
        return []

    lineage_ids = list({s.lineage_id for s in snaps})
    lineages = list(
        db.execute(select(PatchLineage).where(PatchLineage.id.in_(lineage_ids))).scalars()
    )

    latest_by_lineage: dict[int, PatchLineageSnapshot] = {}
    for snap in db.execute(
        select(PatchLineageSnapshot)
        .where(PatchLineageSnapshot.lineage_id.in_(lineage_ids))
        .order_by(
            PatchLineageSnapshot.lineage_id,
            PatchLineageSnapshot.observed_on.desc(),
            PatchLineageSnapshot.created_at.desc(),
            PatchLineageSnapshot.id.desc(),
        )
    ).scalars():
        if snap.lineage_id not in latest_by_lineage:
            latest_by_lineage[snap.lineage_id] = snap

    return [_lineage_to_out(lineage, latest_by_lineage.get(lineage.id)) for lineage in lineages]


@router.get("/by-check-in/{check_in_id}", response_model=list[LineageOut])
def list_lineages_by_check_in(
    check_in_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[LineageOut]:
    """本次 check-in 明确观察到 present 或 missing 的全部 lineage。"""
    check_in = db.get(CheckIn, check_in_id)
    if check_in is None or check_in.deleted_at is not None or check_in.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="check-in not found")

    observations = list(
        db.execute(
            select(PatchLineageObservation)
            .where(PatchLineageObservation.check_in_id == check_in_id)
            .order_by(
                PatchLineageObservation.observed_on,
                PatchLineageObservation.id,
            )
        ).scalars()
    )
    lineage_ids = list(dict.fromkeys(observation.lineage_id for observation in observations))
    if not lineage_ids:
        return []

    lineages = list(
        db.execute(
            select(PatchLineage)
            .where(
                PatchLineage.id.in_(lineage_ids),
                PatchLineage.user_id == current_user.id,
                PatchLineage.deleted_at.is_(None),
            )
            .order_by(
                PatchLineage.last_observed_on.desc(),
                PatchLineage.id.desc(),
            )
        ).scalars()
    )
    latest_by_lineage: dict[int, PatchLineageSnapshot] = {}
    for snapshot in db.execute(
        select(PatchLineageSnapshot)
        .where(PatchLineageSnapshot.lineage_id.in_(lineage_ids))
        .order_by(
            PatchLineageSnapshot.lineage_id,
            PatchLineageSnapshot.observed_on.desc(),
            PatchLineageSnapshot.created_at.desc(),
            PatchLineageSnapshot.id.desc(),
        )
    ).scalars():
        if snapshot.lineage_id not in latest_by_lineage:
            latest_by_lineage[snapshot.lineage_id] = snapshot
    return [_lineage_to_out(lineage, latest_by_lineage.get(lineage.id)) for lineage in lineages]


@router.get("/{lineage_id}", response_model=LineageDetailOut)
def get_lineage(
    lineage_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> LineageDetailOut:
    """一条 lineage 的完整时间线。"""
    lineage = db.get(PatchLineage, lineage_id)
    if lineage is None or lineage.deleted_at is not None or lineage.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="lineage not found")

    snaps = list(
        db.execute(
            select(PatchLineageSnapshot)
            .where(PatchLineageSnapshot.lineage_id == lineage_id)
            .order_by(
                PatchLineageSnapshot.observed_on.asc(),
                PatchLineageSnapshot.created_at.asc(),
                PatchLineageSnapshot.id.asc(),
            )
        ).scalars()
    )
    observations = list(
        db.execute(
            select(PatchLineageObservation)
            .where(PatchLineageObservation.lineage_id == lineage_id)
            .order_by(
                PatchLineageObservation.observed_on.asc(),
                PatchLineageObservation.created_at.asc(),
                PatchLineageObservation.id.asc(),
            )
        ).scalars()
    )

    return LineageDetailOut(
        **_lineage_to_out(lineage, snaps[-1] if snaps else None).model_dump(),
        snapshots=[_snap_to_out(s) for s in snaps],
        observations=[_observation_to_out(row) for row in observations],
        trend=_summarize_trend(snaps),
    )
