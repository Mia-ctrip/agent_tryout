from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.auth import UserConsent


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def consent_statuses(
    db: Session,
    user_id: int,
) -> list[tuple[str, str, bool, datetime | None]]:
    required = get_settings().required_consents
    rows = list(
        db.execute(
            select(UserConsent).where(
                UserConsent.user_id == user_id,
                UserConsent.consent_type.in_(list(required)),
            )
        ).scalars()
    )
    by_key = {(row.consent_type, row.version): row for row in rows}
    return [
        (
            consent_type,
            version,
            (row := by_key.get((consent_type, version))) is not None and row.revoked_at is None,
            row.accepted_at if row is not None and row.revoked_at is None else None,
        )
        for consent_type, version in required.items()
    ]


def missing_required_consents(db: Session, user_id: int) -> list[dict[str, str]]:
    return [
        {"consent_type": consent_type, "version": version}
        for consent_type, version, accepted, _accepted_at in consent_statuses(db, user_id)
        if not accepted
    ]


def set_consent(
    db: Session,
    *,
    user_id: int,
    consent_type: str,
    version: str,
    accepted: bool,
    app_version: str | None,
) -> UserConsent:
    required_version = get_settings().required_consents.get(consent_type)
    if required_version is None or required_version != version:
        raise ValueError("unsupported consent type or version")
    row = db.scalar(
        select(UserConsent).where(
            UserConsent.user_id == user_id,
            UserConsent.consent_type == consent_type,
            UserConsent.version == version,
        )
    )
    now = _now()
    if row is None:
        row = UserConsent(
            user_id=user_id,
            consent_type=consent_type,
            version=version,
            accepted_at=now,
            revoked_at=None if accepted else now,
            source="app",
            app_version=app_version,
        )
        db.add(row)
    elif accepted:
        row.accepted_at = now
        row.revoked_at = None
        row.app_version = app_version
    else:
        row.revoked_at = now
        row.app_version = app_version
    return row
