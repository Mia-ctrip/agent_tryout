from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


_settings = get_settings()

engine = create_engine(
    _settings.database_url,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    future=True,
)


def get_db() -> Session:
    """FastAPI dependency: yield a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
