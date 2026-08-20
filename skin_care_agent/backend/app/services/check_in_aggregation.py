"""把一次 check-in 的多视角最新分析收敛为一个稳定结果。"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import Analysis
from app.models.check_in import CheckIn
from app.models.photo import Photo
from app.schemas.check_in import (
    CheckInAnalysisSummaryOut,
    CheckInDiary,
    CheckInViewAnalysisOut,
)


VIEW_ORDER = ("front", "left", "right")
REQUIRED_VIEWS: dict[str, tuple[str, ...]] = {
    "quick": (),
    "standard": VIEW_ORDER,
}


def _ordered_views(views: set[str]) -> list[str]:
    return [view for view in VIEW_ORDER if view in views]


def _safe_count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def analysis_region_counts(parsed_result: dict[str, Any] | None) -> dict[str, int]:
    """同一视角内按 region 累加 patch；兼容旧结果的 regions.acne_count。"""

    result: dict[str, int] = defaultdict(int)
    parsed = parsed_result or {}
    patches = parsed.get("acne_patches") or []
    if isinstance(patches, list):
        for patch in patches:
            if not isinstance(patch, dict):
                continue
            region = str(patch.get("region") or "unknown")
            result[region] += _safe_count(patch.get("estimated_count"))

    if not result:
        regions = parsed.get("regions") or {}
        if isinstance(regions, dict):
            for region, info in regions.items():
                if isinstance(info, dict):
                    result[str(region)] += _safe_count(info.get("acne_count"))
    return dict(result)


def analysis_total_count(
    parsed_result: dict[str, Any] | None,
    region_counts: dict[str, int] | None = None,
) -> int:
    counts = region_counts if region_counts is not None else analysis_region_counts(parsed_result)
    if counts:
        return sum(counts.values())

    acne_types = (parsed_result or {}).get("acne_types") or {}
    if not isinstance(acne_types, dict):
        return 0
    return sum(
        _safe_count(value) for key, value in acne_types.items() if str(key).startswith("count_")
    )


def _view_summary(photo: Photo, analysis: Analysis) -> CheckInViewAnalysisOut:
    region_counts = analysis_region_counts(analysis.parsed_result)
    return CheckInViewAnalysisOut(
        view_type=photo.view_type,
        photo_id=photo.id,
        analysis_id=analysis.id,
        analysis_created_at=analysis.created_at,
        overall_severity=analysis.overall_severity,
        skin_health_index=analysis.skin_health_index,
        needs_doctor=analysis.needs_doctor,
        total_estimated_count=analysis_total_count(
            analysis.parsed_result,
            region_counts,
        ),
        region_estimated_counts=region_counts,
    )


def build_check_in_summary(
    check_in: CheckIn,
    photos: Sequence[Photo],
    latest_by_photo: dict[int, Analysis],
) -> CheckInAnalysisSummaryOut:
    """纯内存聚合：各 region 取三个重叠视角中的最大值，避免直接相加。"""

    photos_by_view: dict[str, Photo] = {}
    for photo in sorted(photos, key=lambda row: row.id):
        if photo.view_type in VIEW_ORDER:
            photos_by_view[photo.view_type] = photo

    view_summaries = [
        _view_summary(photo, latest_by_photo[photo.id])
        for view in VIEW_ORDER
        if (photo := photos_by_view.get(view)) is not None and photo.id in latest_by_photo
    ]

    required_views = set(REQUIRED_VIEWS.get(check_in.kind, ()))
    present_views = set(photos_by_view)
    analyzed_views = {row.view_type for row in view_summaries}
    missing_photo_views = required_views - present_views
    missing_analysis_views = (required_views & present_views) - analyzed_views

    if not view_summaries:
        aggregation_status = "empty"
    elif not missing_photo_views and not missing_analysis_views:
        aggregation_status = "ready"
    else:
        aggregation_status = "partial"

    severities = [
        row.overall_severity for row in view_summaries if row.overall_severity is not None
    ]
    indices = [row.skin_health_index for row in view_summaries if row.skin_health_index is not None]

    region_candidates: dict[str, list[int]] = defaultdict(list)
    for row in view_summaries:
        for region, count in row.region_estimated_counts.items():
            region_candidates[region].append(count)
    region_counts = {region: max(counts) for region, counts in sorted(region_candidates.items())}
    regional_total = sum(region_counts.values())
    view_total = max(
        (row.total_estimated_count for row in view_summaries),
        default=0,
    )

    return CheckInAnalysisSummaryOut(
        check_in_id=check_in.id,
        kind=check_in.kind,
        check_in_status=check_in.status,
        observed_on=check_in.observed_on,
        aggregation_status=aggregation_status,
        required_views=list(REQUIRED_VIEWS.get(check_in.kind, ())),
        missing_photo_views=_ordered_views(missing_photo_views),
        missing_analysis_views=_ordered_views(missing_analysis_views),
        photo_count=len(photos_by_view),
        analyzed_view_count=len(view_summaries),
        overall_severity=max(severities) if severities else None,
        skin_health_index=round(sum(indices) / len(indices), 1) if indices else None,
        needs_doctor=any(row.needs_doctor for row in view_summaries),
        total_estimated_count=max(regional_total, view_total),
        region_estimated_counts=region_counts,
        latest_analysis_at=max(
            (row.analysis_created_at for row in view_summaries),
            default=None,
        ),
        diary=(
            CheckInDiary.model_validate(check_in.diary_data)
            if check_in.diary_data is not None
            else None
        ),
        view_summaries=view_summaries,
    )


def load_latest_analyses(
    db: Session,
    photo_ids: Sequence[int],
) -> dict[int, Analysis]:
    if not photo_ids:
        return {}
    rows = db.execute(
        select(Analysis)
        .where(
            Analysis.photo_id.in_(photo_ids),
            Analysis.deleted_at.is_(None),
        )
        .order_by(
            Analysis.photo_id,
            Analysis.created_at.desc(),
            Analysis.id.desc(),
        )
    ).scalars()
    latest: dict[int, Analysis] = {}
    for analysis in rows:
        if analysis.photo_id not in latest:
            latest[analysis.photo_id] = analysis
    return latest


def load_check_in_summaries(
    db: Session,
    check_ins: Sequence[CheckIn],
) -> list[CheckInAnalysisSummaryOut]:
    if not check_ins:
        return []

    check_in_ids = [row.id for row in check_ins]
    photos = list(
        db.execute(
            select(Photo)
            .where(
                Photo.check_in_id.in_(check_in_ids),
                Photo.deleted_at.is_(None),
            )
            .order_by(Photo.check_in_id, Photo.id)
        ).scalars()
    )
    photos_by_check_in: dict[int, list[Photo]] = defaultdict(list)
    for photo in photos:
        if photo.check_in_id is not None:
            photos_by_check_in[photo.check_in_id].append(photo)

    latest_by_photo = load_latest_analyses(db, [photo.id for photo in photos])
    return [
        build_check_in_summary(
            check_in,
            photos_by_check_in.get(check_in.id, []),
            latest_by_photo,
        )
        for check_in in check_ins
    ]


def load_check_in_summary(
    db: Session,
    check_in: CheckIn,
) -> CheckInAnalysisSummaryOut:
    return load_check_in_summaries(db, [check_in])[0]
