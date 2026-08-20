from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.analysis import Analysis
from app.models.check_in import CheckIn
from app.models.patch_lineage import PatchLineage, PatchLineageSnapshot
from app.models.photo import Photo
from app.models.user import User
from app.schemas.check_in import CheckInAnalysisSummaryOut
from app.schemas.trend import DailyPoint, RegionSummary, TrendSummaryOut
from app.services.ai_gateway.schema import REGION_ZH
from app.services.check_in_aggregation import (
    analysis_region_counts,
    analysis_total_count,
    load_check_in_summaries,
    load_latest_analyses,
)


router = APIRouter(prefix="/trends", tags=["trends"])

_VIEW_ZH = {"front": "正面", "left": "左侧", "right": "右侧"}


@dataclass(frozen=True)
class _LegacyRecord:
    day: date
    photo_id: int
    recorded_at: datetime
    analysis: Analysis


def _today_utc() -> date:
    return datetime.now(tz=timezone.utc).date()


def _select_daily_check_in_summaries(
    summaries: list[CheckInAnalysisSummaryOut],
) -> tuple[dict[date, CheckInAnalysisSummaryOut], int, int]:
    """每天只选一条；完整 standard 优先，其次取最新聚合。"""

    ready = [row for row in summaries if row.aggregation_status == "ready"]
    selected: dict[date, CheckInAnalysisSummaryOut] = {}
    epoch = datetime.min.replace(tzinfo=timezone.utc)
    for row in ready:
        current = selected.get(row.observed_on)
        candidate_key = (
            row.kind == "standard",
            row.latest_analysis_at or epoch,
            row.check_in_id,
        )
        if current is None:
            selected[row.observed_on] = row
            continue
        current_key = (
            current.kind == "standard",
            current.latest_analysis_at or epoch,
            current.check_in_id,
        )
        if candidate_key > current_key:
            selected[row.observed_on] = row

    incomplete = sum(row.aggregation_status != "ready" for row in summaries)
    superseded = len(ready) - len(selected)
    return selected, incomplete, superseded


def _photo_recorded_at(photo: Photo) -> datetime:
    recorded_at = photo.taken_at or photo.created_at
    if recorded_at.tzinfo is None:
        return recorded_at.replace(tzinfo=timezone.utc)
    return recorded_at.astimezone(timezone.utc)


def _load_legacy_daily_records(
    db: Session,
    *,
    user_id: int,
    start_dt: datetime,
    end_dt: datetime,
) -> dict[date, _LegacyRecord]:
    """旧照片没有 check-in；按照片记录日期去重，同日只保留最新一张。"""

    recorded_at = func.coalesce(Photo.taken_at, Photo.created_at)
    photos = list(
        db.execute(
            select(Photo).where(
                Photo.user_id == user_id,
                Photo.check_in_id.is_(None),
                Photo.deleted_at.is_(None),
                recorded_at >= start_dt,
                recorded_at <= end_dt,
            )
        ).scalars()
    )
    latest_by_photo = load_latest_analyses(db, [photo.id for photo in photos])
    selected: dict[date, _LegacyRecord] = {}
    for photo in photos:
        analysis = latest_by_photo.get(photo.id)
        if analysis is None:
            continue
        photo_recorded_at = _photo_recorded_at(photo)
        candidate = _LegacyRecord(
            day=photo_recorded_at.date(),
            photo_id=photo.id,
            recorded_at=photo_recorded_at,
            analysis=analysis,
        )
        current = selected.get(candidate.day)
        if current is None or (candidate.recorded_at, candidate.photo_id) > (
            current.recorded_at,
            current.photo_id,
        ):
            selected[candidate.day] = candidate
    return selected


@router.get("/summary", response_model=TrendSummaryOut)
def trend_summary(
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> TrendSummaryOut:
    """当前用户在最近 N 天的分析曲线与痘斑生命周期总览。"""
    end_date = _today_utc()
    start_date = end_date - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

    check_ins = list(
        db.execute(
            select(CheckIn)
            .where(
                CheckIn.user_id == current_user.id,
                CheckIn.status == "complete",
                CheckIn.deleted_at.is_(None),
                CheckIn.observed_on >= start_date,
                CheckIn.observed_on <= end_date,
            )
            .order_by(CheckIn.observed_on, CheckIn.id)
        ).scalars()
    )
    check_in_summaries = load_check_in_summaries(db, check_ins)
    check_ins_by_day, incomplete_check_ins, superseded_check_ins = _select_daily_check_in_summaries(
        check_in_summaries
    )
    legacy_by_day = _load_legacy_daily_records(
        db,
        user_id=current_user.id,
        start_dt=start_dt,
        end_dt=end_dt,
    )

    daily_points: list[DailyPoint] = []
    current_day = start_date
    while current_day <= end_date:
        check_in_summary = check_ins_by_day.get(current_day)
        if check_in_summary is not None:
            daily_points.append(
                DailyPoint(
                    day=current_day,
                    source="check_in",
                    check_in_id=check_in_summary.check_in_id,
                    overall_severity=check_in_summary.overall_severity,
                    skin_health_index=check_in_summary.skin_health_index,
                    total_estimated_count=check_in_summary.total_estimated_count,
                    analysis_count=check_in_summary.analyzed_view_count,
                    check_in_count=1,
                )
            )
        else:
            legacy = legacy_by_day.get(current_day)
            if legacy is None:
                daily_points.append(DailyPoint(day=current_day))
            else:
                region_counts = analysis_region_counts(legacy.analysis.parsed_result)
                daily_points.append(
                    DailyPoint(
                        day=current_day,
                        source="legacy",
                        overall_severity=legacy.analysis.overall_severity,
                        skin_health_index=legacy.analysis.skin_health_index,
                        total_estimated_count=analysis_total_count(
                            legacy.analysis.parsed_result,
                            region_counts,
                        ),
                        analysis_count=1,
                    )
                )
        current_day += timedelta(days=1)

    total_analyses = sum(point.analysis_count for point in daily_points)
    total_check_ins = sum(point.check_in_count for point in daily_points)
    total_legacy_records = sum(point.source == "legacy" for point in daily_points)

    lineages = list(
        db.execute(
            select(PatchLineage).where(
                PatchLineage.user_id == current_user.id,
                PatchLineage.deleted_at.is_(None),
            )
        ).scalars()
    )
    total_active = sum(1 for lineage in lineages if lineage.status == "active")
    total_new_in_range = sum(1 for lineage in lineages if lineage.first_seen_on >= start_date)
    total_healed_in_range = sum(
        1
        for lineage in lineages
        if lineage.status == "healed" and lineage.last_observed_on >= start_date
    )

    region_groups: dict[tuple[str, str], list[PatchLineage]] = defaultdict(list)
    for lineage in lineages:
        region_groups[(lineage.view_type, lineage.region)].append(lineage)

    all_ids = [lineage.id for lineage in lineages]
    latest_by_lineage: dict[int, PatchLineageSnapshot] = {}
    if all_ids:
        snapshots = db.execute(
            select(PatchLineageSnapshot)
            .where(PatchLineageSnapshot.lineage_id.in_(all_ids))
            .order_by(
                PatchLineageSnapshot.lineage_id,
                PatchLineageSnapshot.observed_on.desc(),
                PatchLineageSnapshot.created_at.desc(),
                PatchLineageSnapshot.id.desc(),
            )
        ).scalars()
        for snapshot in snapshots:
            if snapshot.lineage_id not in latest_by_lineage:
                latest_by_lineage[snapshot.lineage_id] = snapshot

    region_summaries: list[RegionSummary] = []
    for (view_type, region), group in region_groups.items():
        active = [lineage for lineage in group if lineage.status == "active"]
        dormant = [lineage for lineage in group if lineage.status == "dormant"]
        healed = [lineage for lineage in group if lineage.status == "healed"]
        latest_lineage = max(
            group,
            key=lambda lineage: (lineage.last_observed_on, lineage.id),
        )
        latest_snapshot = latest_by_lineage.get(latest_lineage.id)
        region_summaries.append(
            RegionSummary(
                view_type=view_type,
                region=region,
                active_lineage_count=len(active),
                dormant_lineage_count=len(dormant),
                healed_lineage_count=len(healed),
                latest_dominant_type=(latest_snapshot.dominant_type if latest_snapshot else None),
                latest_coverage=(latest_snapshot.coverage if latest_snapshot else None),
            )
        )
    region_summaries.sort(key=lambda row: -row.active_lineage_count)

    highlights = _build_highlights(
        daily_points=daily_points,
        total_new=total_new_in_range,
        total_healed=total_healed_in_range,
        region_summaries=region_summaries,
        days=days,
    )
    return TrendSummaryOut(
        range_days=days,
        start_date=start_date,
        end_date=end_date,
        total_analyses=total_analyses,
        total_check_ins=total_check_ins,
        incomplete_check_ins=incomplete_check_ins,
        superseded_check_ins=superseded_check_ins,
        total_legacy_records=total_legacy_records,
        total_active_lineages=total_active,
        total_new_lineages_in_range=total_new_in_range,
        total_healed_lineages_in_range=total_healed_in_range,
        daily_points=daily_points,
        region_summaries=region_summaries,
        highlights=highlights,
    )


def _build_highlights(
    *,
    daily_points: list[DailyPoint],
    total_new: int,
    total_healed: int,
    region_summaries: list[RegionSummary],
    days: int,
) -> list[str]:
    out: list[str] = []
    valid_indices = [point for point in daily_points if point.skin_health_index is not None]
    if len(valid_indices) >= 2:
        first_index = valid_indices[0].skin_health_index or 0
        last_index = valid_indices[-1].skin_health_index or 0
        delta = last_index - first_index
        if delta >= 5:
            out.append(
                f"皮肤指数近 {days} 天上升 {delta:.0f} 分"
                f"（{first_index:.0f} → {last_index:.0f}），趋势向好。"
            )
        elif delta <= -5:
            out.append(
                f"皮肤指数近 {days} 天下降 {abs(delta):.0f} 分"
                f"（{first_index:.0f} → {last_index:.0f}），需要注意护理。"
            )
        else:
            out.append(f"皮肤指数在 {days} 天内保持稳定（波动 {delta:+.0f} 分）。")

    if total_new > 0:
        out.append(f"近 {days} 天新增 {total_new} 处痘斑区域。")
    if total_healed > 0:
        out.append(f"近 {days} 天有 {total_healed} 处痘斑区域已消退。")

    if region_summaries:
        top = region_summaries[0]
        if top.active_lineage_count > 0:
            region_zh = REGION_ZH.get(top.region, top.region)
            view_zh = _VIEW_ZH.get(top.view_type)
            display_region = f"{view_zh}·{region_zh}" if view_zh else region_zh
            out.append(
                f"当前活跃痘斑最多的区域：{display_region}（{top.active_lineage_count} 处活跃）。"
            )

    if not out:
        out.append("数据不足，请继续追踪几日后查看趋势。")
    return out
