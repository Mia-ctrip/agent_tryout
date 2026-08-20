from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.auth import AuthSession, UserIdentity
from app.models.user import User


EMAIL_PROVIDER = "email"
_PBKDF2_ITERATIONS = 600_000
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class InvalidCredentials(Exception):
    pass


class InvalidToken(Exception):
    pass


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str
    access_expires_at: datetime
    refresh_expires_at: datetime


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: AuthSession


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def normalize_email(value: str) -> str:
    email = value.strip().casefold()
    if len(email) > 320 or not _EMAIL_RE.fullmatch(email):
        raise ValueError("invalid email address")
    local, domain = email.rsplit("@", 1)
    if len(local) > 64 or len(domain) > 255:
        raise ValueError("invalid email address")
    return email


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        _PBKDF2_ITERATIONS,
        dklen=32,
    )
    return "$".join(
        (
            "pbkdf2_sha256",
            str(_PBKDF2_ITERATIONS),
            _b64encode(salt),
            _b64encode(digest),
        )
    )


def verify_password(password: str, encoded: Optional[str]) -> bool:
    if not encoded:
        return False
    try:
        algorithm, iterations_raw, salt_raw, expected_raw = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        if iterations < 100_000 or iterations > 2_000_000:
            return False
        salt = _b64decode(salt_raw)
        expected = _b64decode(expected_raw)
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(
    db: Session,
    user: User,
    *,
    device_id: Optional[str] = None,
    device_name: Optional[str] = None,
) -> SessionTokens:
    settings = get_settings()
    now = _now()
    access_token = _new_token()
    refresh_token = _new_token()
    access_expires_at = now + timedelta(seconds=settings.auth_access_token_ttl_seconds)
    refresh_expires_at = now + timedelta(seconds=settings.auth_refresh_token_ttl_seconds)
    db.add(
        AuthSession(
            user_id=user.id,
            access_token_hash=token_hash(access_token),
            refresh_token_hash=token_hash(refresh_token),
            access_expires_at=access_expires_at,
            refresh_expires_at=refresh_expires_at,
            device_id=device_id,
            device_name=device_name,
        )
    )
    return SessionTokens(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_at=access_expires_at,
        refresh_expires_at=refresh_expires_at,
    )


def authenticate_access_token(db: Session, token: str) -> AuthContext:
    if len(token) > 512:
        raise InvalidToken
    now = _now()
    auth_session = db.scalar(
        select(AuthSession).where(
            AuthSession.access_token_hash == token_hash(token),
            AuthSession.revoked_at.is_(None),
            AuthSession.access_expires_at > now,
        )
    )
    if auth_session is None:
        raise InvalidToken
    user = db.get(User, auth_session.user_id)
    if user is None or user.deleted_at is not None:
        raise InvalidToken
    return AuthContext(user=user, session=auth_session)


def rotate_refresh_token(db: Session, refresh_token: str) -> tuple[User, SessionTokens]:
    if len(refresh_token) > 512:
        raise InvalidToken
    now = _now()
    auth_session = db.scalar(
        select(AuthSession)
        .where(AuthSession.refresh_token_hash == token_hash(refresh_token))
        .with_for_update()
    )
    if (
        auth_session is None
        or auth_session.revoked_at is not None
        or auth_session.refresh_expires_at <= now
    ):
        raise InvalidToken
    user = db.get(User, auth_session.user_id)
    if user is None or user.deleted_at is not None:
        raise InvalidToken

    settings = get_settings()
    access_token = _new_token()
    new_refresh_token = _new_token()
    access_expires_at = now + timedelta(seconds=settings.auth_access_token_ttl_seconds)
    refresh_expires_at = now + timedelta(seconds=settings.auth_refresh_token_ttl_seconds)
    auth_session.access_token_hash = token_hash(access_token)
    auth_session.refresh_token_hash = token_hash(new_refresh_token)
    auth_session.access_expires_at = access_expires_at
    auth_session.refresh_expires_at = refresh_expires_at
    auth_session.last_used_at = now
    return (
        user,
        SessionTokens(
            access_token=access_token,
            refresh_token=new_refresh_token,
            access_expires_at=access_expires_at,
            refresh_expires_at=refresh_expires_at,
        ),
    )


def revoke_session(auth_session: AuthSession) -> None:
    if auth_session.revoked_at is None:
        auth_session.revoked_at = _now()


def load_email_identity(db: Session, user_id: int) -> Optional[UserIdentity]:
    return db.scalar(
        select(UserIdentity).where(
            UserIdentity.user_id == user_id,
            UserIdentity.provider == EMAIL_PROVIDER,
        )
    )


def verify_user_password(db: Session, user_id: int, password: str) -> bool:
    identity = load_email_identity(db, user_id)
    return identity is not None and verify_password(password, identity.secret_hash)
