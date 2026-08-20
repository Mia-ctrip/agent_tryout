from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services import auth_service, consent_service
from app.services.auth_service import AuthContext


_bearer = HTTPBearer(auto_error=False)


def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return auth_service.authenticate_access_token(db, credentials.credentials)
    except auth_service.InvalidToken as exc:
        raise HTTPException(
            status_code=401,
            detail="invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user


def get_current_app_user(
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    missing = consent_service.missing_required_consents(db, context.user.id)
    if missing:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "required consents missing",
                "missing_consents": missing,
            },
        )
    return context.user
