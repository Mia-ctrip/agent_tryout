from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_auth_context
from app.config import get_settings
from app.db.session import get_db
from app.models.auth import UserIdentity
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairOut,
    UserOut,
)
from app.services import auth_service
from app.services.auth_service import AuthContext, SessionTokens


router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(db: Session, user: User) -> UserOut:
    identity = auth_service.load_email_identity(db, user.id)
    return UserOut(
        user_id=user.id,
        email=identity.provider_subject if identity is not None else None,
        nickname=user.nickname,
        created_at=user.created_at,
    )


def _tokens_out(tokens: SessionTokens) -> TokenPairOut:
    now = datetime.now(tz=timezone.utc)
    return TokenPairOut(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=max(0, int((tokens.access_expires_at - now).total_seconds())),
        refresh_expires_in=max(
            0,
            int((tokens.refresh_expires_at - now).total_seconds()),
        ),
    )


def _auth_response(db: Session, user: User, tokens: SessionTokens) -> AuthResponse:
    return AuthResponse(user=_user_out(db, user), tokens=_tokens_out(tokens))


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    if not get_settings().auth_registration_enabled:
        raise HTTPException(status_code=403, detail="registration is disabled")

    existing = db.scalar(
        select(UserIdentity.id).where(
            UserIdentity.provider == auth_service.EMAIL_PROVIDER,
            UserIdentity.provider_subject == body.email,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="email is already registered")

    try:
        user = User(nickname=body.nickname)
        db.add(user)
        db.flush()
        db.add(
            UserIdentity(
                user_id=user.id,
                provider=auth_service.EMAIL_PROVIDER,
                provider_subject=body.email,
                secret_hash=auth_service.hash_password(body.password),
            )
        )
        tokens = auth_service.issue_session(
            db,
            user,
            device_id=body.device_id,
            device_name=body.device_name,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="email is already registered") from exc
    db.refresh(user)
    return _auth_response(db, user, tokens)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    identity = db.scalar(
        select(UserIdentity).where(
            UserIdentity.provider == auth_service.EMAIL_PROVIDER,
            UserIdentity.provider_subject == body.email,
        )
    )
    if identity is None or not auth_service.verify_password(
        body.password,
        identity.secret_hash,
    ):
        raise HTTPException(status_code=401, detail="invalid email or password")
    user = db.get(User, identity.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(status_code=401, detail="invalid email or password")

    tokens = auth_service.issue_session(
        db,
        user,
        device_id=body.device_id,
        device_name=body.device_name,
    )
    db.commit()
    return _auth_response(db, user, tokens)


@router.post("/refresh", response_model=AuthResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    try:
        user, tokens = auth_service.rotate_refresh_token(db, body.refresh_token)
    except auth_service.InvalidToken as exc:
        raise HTTPException(
            status_code=401,
            detail="invalid or expired refresh token",
        ) from exc
    db.commit()
    return _auth_response(db, user, tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Response:
    auth_service.revoke_session(context.session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
