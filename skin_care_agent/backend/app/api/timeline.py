from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.timeline import TimelineItem
from app.services.timeline_service import list_timeline


router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("", response_model=list[TimelineItem])
def list_timeline_endpoint(
    limit: int = Query(default=100, ge=1, le=100),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> list[TimelineItem]:
    return list_timeline(db, user_id=current_user.id, limit=limit)
