from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.session import get_db


router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "env": settings.app_env,
        "version": "0.2.0",
    }


@router.get("/health/db")
def health_db(db: Session = Depends(get_db)) -> dict:
    """DB connectivity probe. Returns ok if SELECT 1 succeeds."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "reachable"}
