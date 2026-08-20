"""以 check-in 观察证据驱动的 patch lineage 追踪。"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import Analysis
from app.models.check_in import CheckIn
from app.models.patch_lineage import (
    PatchLineage,
    PatchLineageObservation,
    PatchLineageSnapshot,
)
from app.models.photo import Photo


logger = logging.getLogger(__name__)


# 匹配阈值（bbox 中心归一化距离，0~sqrt(2)）
MATCH_DISTANCE_THRESHOLD = 0.25

HEALED_AFTER_DAYS = 14
HEALED_AFTER_MISSING_OBSERVATIONS = 2


@dataclass
class TrackResult:
    """一次分析的 tracker 输出。"""

    new_lineage_count: int
    matched_lineage_count: int
    missing_observation_count: int
    snapshot_ids: list[int]
    observation_ids: list[int]
    skipped: bool = False
    skip_reason: Optional[str] = None


@dataclass(frozen=True)
class ObservationContext:
    photo: Photo
    check_in_id: Optional[int]
    view_type: str
    observed_on: date
    observed_at: datetime


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    """[x1,y1,x2,y2] → (cx, cy)。"""
    if not bbox or len(bbox) != 4:
        return (0.0, 0.0)
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


def _distance(c1: tuple[float, float], c2: tuple[float, float]) -> float:
    return ((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2) ** 0.5


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _skipped_result(reason: str) -> TrackResult:
    return TrackResult(
        new_lineage_count=0,
        matched_lineage_count=0,
        missing_observation_count=0,
        snapshot_ids=[],
        observation_ids=[],
        skipped=True,
        skip_reason=reason,
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _date_as_datetime(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _resolve_observation_context(
    db: Session,
    analysis: Analysis,
    *,
    photo: Optional[Photo],
    check_in: Optional[CheckIn],
    view_type: Optional[str],
) -> tuple[Optional[ObservationContext], Optional[str]]:
    if photo is None:
        photo = (
            db.execute(select(Photo).where(Photo.id == analysis.photo_id).with_for_update())
            .scalars()
            .first()
        )
    elif isinstance(photo, Photo):
        # 串行化同一照片的 tracker，避免并发强制重分析产生两套 lineage。
        db.refresh(photo, with_for_update=True)

    if (
        photo is None
        or getattr(photo, "deleted_at", None) is not None
        or photo.user_id != analysis.user_id
    ):
        return None, "photo_not_found"

    if photo.check_in_id is not None:
        if check_in is None:
            check_in = db.get(CheckIn, photo.check_in_id)
        if (
            check_in is None
            or check_in.id != photo.check_in_id
            or check_in.user_id != analysis.user_id
            or getattr(check_in, "deleted_at", None) is not None
        ):
            return None, "check_in_not_found"
        if check_in.status != "complete":
            return None, "check_in_not_complete"
        if not photo.view_type:
            return None, "photo_view_missing"
        return (
            ObservationContext(
                photo=photo,
                check_in_id=check_in.id,
                view_type=photo.view_type,
                observed_on=check_in.observed_on,
                observed_at=_date_as_datetime(check_in.observed_on),
            ),
            None,
        )

    recorded_at = (
        photo.taken_at
        or getattr(photo, "created_at", None)
        or getattr(analysis, "created_at", None)
        or _now()
    )
    recorded_at = _as_utc(recorded_at)
    return (
        ObservationContext(
            photo=photo,
            check_in_id=None,
            view_type=photo.view_type or view_type or "legacy",
            observed_on=recorded_at.date(),
            observed_at=recorded_at,
        ),
        None,
    )


def track_patches_for_analysis(
    db: Session,
    analysis: Analysis,
    *,
    photo: Optional[Photo] = None,
    check_in: Optional[CheckIn] = None,
    view_type: Optional[str] = None,
    commit: bool = True,
) -> TrackResult:
    """把一次有效同视角照片转换成 present/missing 观察并推进生命周期。"""
    context, skip_reason = _resolve_observation_context(
        db,
        analysis,
        photo=photo,
        check_in=check_in,
        view_type=view_type,
    )
    if context is None:
        logger.info(
            "tracker: skipped analysis_id=%s reason=%s",
            analysis.id,
            skip_reason,
        )
        return _skipped_result(skip_reason or "invalid_observation")

    photo = context.photo
    if photo.lineage_tracked_analysis_id is not None:
        logger.info(
            "tracker: skipped photo_id=%s analysis_id=%s already_tracked_by=%s",
            photo.id,
            analysis.id,
            photo.lineage_tracked_analysis_id,
        )
        return _skipped_result("photo_already_tracked")

    parsed = analysis.parsed_result or {}
    patches = parsed.get("acne_patches") or []
    now = _now()

    # 只有同一用户、同一视角、在当前日期已经存在的 lineage 才可被本照片观察。
    stmt = (
        select(PatchLineage)
        .where(
            PatchLineage.user_id == analysis.user_id,
            PatchLineage.view_type == context.view_type,
            PatchLineage.deleted_at.is_(None),
            PatchLineage.status.in_(["active", "dormant"]),
            PatchLineage.first_seen_on <= context.observed_on,
        )
        .order_by(PatchLineage.last_seen_on.desc(), PatchLineage.id.desc())
    )
    observed_lineages = list(db.execute(stmt).scalars())
    preexisting_lineage_ids = {lineage.id for lineage in observed_lineages}

    candidates_by_region: dict[str, list[PatchLineage]] = {}
    for lineage in observed_lineages:
        candidates_by_region.setdefault(lineage.region, []).append(lineage)

    # 对每个候选 lineage 拉它最后一条 snapshot，用来提供 bbox 中心比对
    latest_snapshot_by_lineage: dict[int, PatchLineageSnapshot] = {}
    if candidates_by_region and patches:
        all_ids = [lineage.id for group in candidates_by_region.values() for lineage in group]
        snap_stmt = (
            select(PatchLineageSnapshot)
            .where(PatchLineageSnapshot.lineage_id.in_(all_ids))
            .order_by(
                PatchLineageSnapshot.lineage_id,
                PatchLineageSnapshot.observed_on.desc(),
                PatchLineageSnapshot.created_at.desc(),
                PatchLineageSnapshot.id.desc(),
            )
        )
        # 每个 lineage 只保留最新一条
        for snap in db.execute(snap_stmt).scalars():
            if snap.lineage_id not in latest_snapshot_by_lineage:
                latest_snapshot_by_lineage[snap.lineage_id] = snap

    # 每条 lineage 一次分析最多匹配一次
    consumed_lineage_ids: set[int] = set()
    snapshots: list[PatchLineageSnapshot] = []
    observations: list[PatchLineageObservation] = []
    matched_count = 0
    new_count = 0
    missing_count = 0

    for patch in patches:
        if not isinstance(patch, dict):
            continue
        region = patch.get("region", "unknown")
        patch_id = patch.get("id", "")
        bbox = patch.get("bbox_norm") or [0.0, 0.0, 0.0, 0.0]
        center = _bbox_center(bbox)

        # 在该 region 的候选里找最近的 lineage
        region_candidates = candidates_by_region.get(region, [])
        best_lineage: Optional[PatchLineage] = None
        best_distance = float("inf")

        for lineage in region_candidates:
            if lineage.id in consumed_lineage_ids:
                continue
            snap = latest_snapshot_by_lineage.get(lineage.id)
            if snap is None:
                continue
            d = _distance(center, _bbox_center(snap.bbox_norm))
            if d < best_distance:
                best_distance = d
                best_lineage = lineage

        # 决策：匹配还是新建
        if best_lineage is not None and best_distance <= MATCH_DISTANCE_THRESHOLD:
            lineage = best_lineage
            consumed_lineage_ids.add(lineage.id)
            advances_state = context.observed_on > lineage.last_observed_on
            if advances_state:
                lineage.last_seen_at = context.observed_at
                lineage.last_seen_on = context.observed_on
                lineage.last_observed_on = context.observed_on
                lineage.last_seen_check_in_id = context.check_in_id
                lineage.consecutive_missing_observations = 0
                lineage.status = "active"
                lineage.status_reason = "present_in_latest_observation"
            lineage.snapshot_count = (lineage.snapshot_count or 0) + 1
            matched_count += 1
            match_info: dict[str, Any] = {
                "matched": True,
                "distance": round(best_distance, 4),
                "threshold": MATCH_DISTANCE_THRESHOLD,
                "advances_state": advances_state,
            }
            observation_reason = "matched_patch" if advances_state else "matched_patch_non_forward"
        else:
            lineage = PatchLineage(
                user_id=analysis.user_id,
                view_type=context.view_type,
                region=region,
                status="active",
                first_seen_at=context.observed_at,
                last_seen_at=context.observed_at,
                first_seen_on=context.observed_on,
                last_seen_on=context.observed_on,
                last_observed_on=context.observed_on,
                last_seen_check_in_id=context.check_in_id,
                consecutive_missing_observations=0,
                status_reason="present_in_latest_observation",
                snapshot_count=1,
            )
            db.add(lineage)
            db.flush()  # 拿到 id 用于关联 snapshot
            consumed_lineage_ids.add(lineage.id)
            candidates_by_region.setdefault(region, []).append(lineage)
            new_count += 1
            match_info = {
                "matched": False,
                "reason": (
                    "no_candidates"
                    if not region_candidates
                    else f"nearest_distance={round(best_distance, 4)} > threshold={MATCH_DISTANCE_THRESHOLD}"
                ),
            }
            advances_state = True
            observation_reason = "new_patch"

        snapshot = PatchLineageSnapshot(
            lineage_id=lineage.id,
            analysis_id=analysis.id,
            photo_id=photo.id,
            user_id=analysis.user_id,
            patch_id=patch_id,
            check_in_id=context.check_in_id,
            observed_on=context.observed_on,
            view_type=context.view_type,
            region=region,
            bbox_norm=bbox,
            area_ratio=float(patch.get("area_ratio") or 0.0),
            coverage=patch.get("coverage", "sparse"),
            dominant_type=patch.get("dominant_type", "mixed"),
            estimated_count=int(patch.get("estimated_count") or 0),
            inflammation=patch.get("inflammation", "none"),
            severity=int(patch.get("severity") or 1),
            match_info=match_info,
            created_at=now,
        )
        db.add(snapshot)
        snapshots.append(snapshot)
        latest_snapshot_by_lineage[lineage.id] = snapshot

        observation = PatchLineageObservation(
            lineage_id=lineage.id,
            check_in_id=context.check_in_id,
            analysis_id=analysis.id,
            photo_id=photo.id,
            user_id=analysis.user_id,
            view_type=context.view_type,
            observed_on=context.observed_on,
            outcome="present",
            advances_state=advances_state,
            reason=observation_reason,
            created_at=now,
        )
        db.add(observation)
        observations.append(observation)

    # 同视角有效照片没有匹配到既有 lineage，才是一条明确的 missing 证据。
    # 没上传照片、缺少该视角、分析未完成，都不会进入这里。
    for lineage in observed_lineages:
        if lineage.id not in preexisting_lineage_ids or lineage.id in consumed_lineage_ids:
            continue

        advances_state = context.observed_on > lineage.last_observed_on
        reason = "missing_non_forward_observation"
        if advances_state:
            lineage.last_observed_on = context.observed_on
            lineage.consecutive_missing_observations = (
                lineage.consecutive_missing_observations or 0
            ) + 1
            elapsed_days = (context.observed_on - lineage.last_seen_on).days
            if (
                lineage.consecutive_missing_observations >= HEALED_AFTER_MISSING_OBSERVATIONS
                and elapsed_days >= HEALED_AFTER_DAYS
            ):
                lineage.status = "healed"
                lineage.status_reason = "missing_in_repeated_check_ins_over_14_days"
                reason = "missing_healed_after_repeated_observations"
            else:
                lineage.status = "dormant"
                lineage.status_reason = "missing_in_comparable_check_in"
                reason = "missing_in_comparable_check_in"

        observation = PatchLineageObservation(
            lineage_id=lineage.id,
            check_in_id=context.check_in_id,
            analysis_id=analysis.id,
            photo_id=photo.id,
            user_id=analysis.user_id,
            view_type=context.view_type,
            observed_on=context.observed_on,
            outcome="missing",
            advances_state=advances_state,
            reason=reason,
            created_at=now,
        )
        db.add(observation)
        observations.append(observation)
        missing_count += 1

    # 该标记和 observation/snapshot 在同一事务中提交，保证一次照片只推进一次。
    photo.lineage_tracked_analysis_id = analysis.id
    photo.lineage_tracked_at = now
    db.flush()
    if commit:
        db.commit()
        for row in [*snapshots, *observations]:
            db.refresh(row)

    result = TrackResult(
        new_lineage_count=new_count,
        matched_lineage_count=matched_count,
        missing_observation_count=missing_count,
        snapshot_ids=[s.id for s in snapshots],
        observation_ids=[row.id for row in observations],
    )
    logger.info(
        "tracker: analysis_id=%s observed_on=%s view=%s new=%s matched=%s missing=%s snapshots=%s",
        analysis.id,
        context.observed_on,
        context.view_type,
        new_count,
        matched_count,
        missing_count,
        len(snapshots),
    )
    return result


def track_completed_check_in(db: Session, check_in: CheckIn) -> TrackResult:
    """原子地处理 check-in 中已有分析；尚未分析的视角会在分析成功后处理。"""
    if check_in.status != "complete":
        return _skipped_result("check_in_not_complete")

    db.flush()
    photos = list(
        db.execute(
            select(Photo)
            .where(
                Photo.check_in_id == check_in.id,
                Photo.deleted_at.is_(None),
            )
            .order_by(Photo.id)
        ).scalars()
    )
    from app.services.check_in_aggregation import load_latest_analyses

    latest_by_photo = load_latest_analyses(db, [photo.id for photo in photos])
    results = [
        track_patches_for_analysis(
            db,
            analysis,
            photo=photo,
            check_in=check_in,
            commit=False,
        )
        for photo in photos
        if (analysis := latest_by_photo.get(photo.id)) is not None
    ]
    db.commit()

    result = TrackResult(
        new_lineage_count=sum(row.new_lineage_count for row in results),
        matched_lineage_count=sum(row.matched_lineage_count for row in results),
        missing_observation_count=sum(row.missing_observation_count for row in results),
        snapshot_ids=[snapshot_id for row in results for snapshot_id in row.snapshot_ids],
        observation_ids=[
            observation_id for row in results for observation_id in row.observation_ids
        ],
    )
    logger.info(
        "tracker: completed check_in_id=%s analyzed_photos=%s new=%s matched=%s missing=%s",
        check_in.id,
        len(results),
        result.new_lineage_count,
        result.matched_lineage_count,
        result.missing_observation_count,
    )
    return result
