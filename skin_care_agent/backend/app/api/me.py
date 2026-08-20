from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import _user_out
from app.api.deps import get_auth_context, get_current_user
from app.db.session import get_db
from app.models.photo import Photo
from app.models.user import User
from app.schemas.auth import (
    ConsentStatusOut,
    ConsentUpdateRequest,
    DeleteAccountRequest,
    UserOut,
)
from app.services import auth_service, consent_service
from app.services.auth_service import AuthContext
from app.services.storage_service import get_storage


router = APIRouter(prefix="/me", tags=["me"])
logger = logging.getLogger(__name__)


@router.get("", response_model=UserOut)
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    return _user_out(db, current_user)


@router.get("/consents", response_model=list[ConsentStatusOut])
def get_consents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConsentStatusOut]:
    return [
        ConsentStatusOut(
            consent_type=consent_type,
            version=version,
            accepted=accepted,
            accepted_at=accepted_at,
        )
        for consent_type, version, accepted, accepted_at in consent_service.consent_statuses(
            db, current_user.id
        )
    ]


@router.put("/consents", response_model=list[ConsentStatusOut])
def update_consents(
    body: ConsentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConsentStatusOut]:
    try:
        for item in body.consents:
            consent_service.set_consent(
                db,
                user_id=current_user.id,
                consent_type=item.consent_type,
                version=item.version,
                accepted=item.accepted,
                app_version=body.app_version,
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="unsupported consent type or version",
        ) from exc
    db.commit()
    return get_consents(current_user=current_user, db=db)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccountRequest,
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> Response:
    if not auth_service.verify_user_password(db, context.user.id, body.password):
        raise HTTPException(status_code=401, detail="invalid password")

    photos = list(db.execute(select(Photo).where(Photo.user_id == context.user.id)).scalars())
    storage_keys = {
        key for photo in photos for key in (photo.storage_key, photo.processed_storage_key) if key
    }
    user_id = context.user.id
    db.delete(context.user)
    db.commit()

    storage = get_storage()
    for key in storage_keys:
        try:
            storage.delete(key)
        except Exception:  # noqa: BLE001
            logger.exception(
                "account deleted but object cleanup failed: user_id=%s key=%s",
                user_id,
                key,
            )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
