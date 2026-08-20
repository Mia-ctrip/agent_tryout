from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.analysis import Analysis
from app.models.photo import Photo
from app.models.user import User
from app.schemas.analysis import AnalysisOut, AnalyzeRequest
from app.services import analysis_service
from app.services.ai_gateway import rate_limit as rl


router = APIRouter(prefix="/analyses", tags=["analyses"])


def _to_out(a, cached: bool) -> AnalysisOut:
    return AnalysisOut(
        analysis_id=a.id,
        photo_id=a.photo_id,
        provider=a.provider,
        model=a.model,
        parsed_result=a.parsed_result,
        overall_severity=a.overall_severity,
        skin_health_index=a.skin_health_index,
        needs_doctor=a.needs_doctor,
        created_at=a.created_at,
        cached=cached,
    )


@router.post("", response_model=AnalysisOut, status_code=status.HTTP_201_CREATED)
async def create_analysis(
    body: AnalyzeRequest,
    response: Response,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> AnalysisOut:
    photo = db.get(Photo, body.photo_id)
    if photo is None or photo.deleted_at is not None or photo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="photo not found")

    if not body.force:
        cached = analysis_service.get_latest_success(db, photo.id)
        if cached is not None:
            return _to_out(cached, cached=True)

    try:
        rl.require(db, user_id=current_user.id, kind="analyze")
    except rl.QuotaExceeded as e:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "daily quota exceeded",
                "kind": e.result.kind,
                "used": e.result.used,
                "limit": e.result.limit,
            },
        ) from e

    try:
        result = await analysis_service.analyze_photo(
            db,
            user_id=current_user.id,
            photo=photo,
        )
    except analysis_service.AnalysisFailed as e:
        code = 422 if e.status == "parse_failed" else 502
        # 把 trace_id 也回给前端方便排障
        if e.trace_id:
            response.headers["X-Trace-Id"] = e.trace_id
        raise HTTPException(
            status_code=code,
            detail={
                "message": e.message,
                "status": e.status,
                "log_id": e.log_id,
                "trace_id": e.trace_id,
            },
        ) from e

    response.headers["X-Trace-Id"] = result.trace_id
    return _to_out(result.analysis, cached=False)


@router.get("/by-photo/{photo_id}", response_model=list[AnalysisOut])
def list_by_photo(
    photo_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[AnalysisOut]:
    photo = db.get(Photo, photo_id)
    if photo is None or photo.deleted_at is not None or photo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="photo not found")
    rows = (
        db.query(Analysis)
        .filter(
            Analysis.photo_id == photo_id,
            Analysis.user_id == current_user.id,
            Analysis.deleted_at.is_(None),
        )
        .order_by(Analysis.created_at.desc())
        .all()
    )
    return [_to_out(a, cached=False) for a in rows]


@router.get("/{analysis_id}", response_model=AnalysisOut)
def get_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> AnalysisOut:
    a = db.get(Analysis, analysis_id)
    if a is None or a.deleted_at is not None or a.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="analysis not found")
    return _to_out(a, cached=False)
