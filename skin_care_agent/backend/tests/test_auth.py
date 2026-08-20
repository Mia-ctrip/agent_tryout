from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.models.auth import AuthSession
from app.schemas.auth import ConsentDecision, ConsentUpdateRequest, RegisterRequest
from app.services import auth_service


def test_email_is_normalized_and_password_is_hashed() -> None:
    body = RegisterRequest(
        email="  Test.User@Example.COM ",
        password="correct horse battery staple",
    )
    encoded = auth_service.hash_password(body.password)

    assert body.email == "test.user@example.com"
    assert body.password not in encoded
    assert auth_service.verify_password(body.password, encoded) is True
    assert auth_service.verify_password("wrong password", encoded) is False


def test_register_schema_rejects_invalid_email_and_short_password() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password="long-enough-password")
    with pytest.raises(ValidationError):
        RegisterRequest(email="person@example.com", password="short")


def test_consent_request_rejects_duplicate_types() -> None:
    with pytest.raises(ValidationError):
        ConsentUpdateRequest(
            consents=[
                ConsentDecision(
                    consent_type="privacy",
                    version="2026-07-16",
                    accepted=True,
                ),
                ConsentDecision(
                    consent_type="privacy",
                    version="2026-07-16",
                    accepted=False,
                ),
            ]
        )


class _FakeAuthDB:
    def __init__(self, auth_session: AuthSession | None, user: Any = None) -> None:
        self.auth_session = auth_session
        self.user = user

    def scalar(self, _statement: Any) -> AuthSession | None:
        return self.auth_session

    def get(self, _model: Any, _row_id: int) -> Any:
        return self.user


def test_access_token_authentication_returns_own_user(monkeypatch) -> None:
    now = datetime(2026, 7, 16, tzinfo=timezone.utc)
    monkeypatch.setattr(auth_service, "_now", lambda: now)
    session = AuthSession(
        id=7,
        user_id=22,
        access_token_hash=auth_service.token_hash("access-token"),
        refresh_token_hash=auth_service.token_hash("refresh-token"),
        access_expires_at=now + timedelta(minutes=10),
        refresh_expires_at=now + timedelta(days=30),
    )
    user = SimpleNamespace(id=22, deleted_at=None)
    context = auth_service.authenticate_access_token(
        _FakeAuthDB(session, user),
        "access-token",
    )

    assert context.user.id == 22
    assert context.session.id == 7


def test_invalid_access_token_is_rejected() -> None:
    with pytest.raises(auth_service.InvalidToken):
        auth_service.authenticate_access_token(_FakeAuthDB(None), "unknown")
