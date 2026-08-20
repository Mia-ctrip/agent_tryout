from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_app_user
from app.config import BACKEND_ROOT, get_settings
from app.db.session import get_db
from app.models.check_in import CheckIn
from app.models.photo import Photo
from app.models.user import User
from app.schemas.photo import PhotoUploadResponse
from app.services.storage_service import get_storage
from app.services.vision.normalization import normalize_photo_for_analysis
from app.services.vision.quality import (
    QualityModelUnavailable,
    assess_photo_quality,
)


router = APIRouter(prefix="/photos", tags=["photos"])
logger = logging.getLogger(__name__)

_MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_VALID_VIEW_TYPES = {"front", "left", "right"}
REJECTED_QUALITY_DIR = BACKEND_ROOT / "storage_debug" / "rejected"


def _build_storage_key(user_id: int, ext: str, now: datetime) -> str:
    return f"photos/{user_id}/{now.year:04d}/{now.month:02d}/{now.day:02d}/{uuid.uuid4().hex}.{ext}"


def _save_rejected_quality_photo(
    data: bytes,
    *,
    check_in_id: int,
    view_type: str,
    ext: str,
) -> str:
    REJECTED_QUALITY_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    path = REJECTED_QUALITY_DIR / (
        f"{timestamp}_checkin-{check_in_id}_{view_type}_{uuid.uuid4().hex}.{ext}"
    )
    path.write_bytes(data)
    return str(path)


def _validate_check_in_target(
    db: Session,
    *,
    check_in_id: int | None,
    view_type: str | None,
    user_id: int,
) -> CheckIn | None:
    if check_in_id is None:
        if view_type is not None:
            raise HTTPException(status_code=400, detail="view_type requires check_in_id")
        return None
    if view_type not in _VALID_VIEW_TYPES:
        raise HTTPException(
            status_code=422,
            detail={"message": "invalid view_type", "allowed": sorted(_VALID_VIEW_TYPES)},
        )
    check_in = db.get(CheckIn, check_in_id)
    if check_in is None or check_in.deleted_at is not None or check_in.user_id != user_id:
        raise HTTPException(status_code=404, detail="check-in not found")
    if check_in.status != "draft":
        raise HTTPException(status_code=409, detail="completed check-in cannot accept photos")
    return check_in


def _to_upload_response(photo: Photo) -> PhotoUploadResponse:
    signed = get_storage().signed_url(photo.storage_key)
    return PhotoUploadResponse(
        photo_id=photo.id,
        client_request_id=photo.client_request_id,
        check_in_id=photo.check_in_id,
        view_type=photo.view_type,
        quality_status=photo.quality_status,
        quality_meta=photo.quality_meta,
        storage_key=photo.storage_key,
        mime_type=photo.mime_type,
        size_bytes=photo.size_bytes,
        width=photo.width,
        height=photo.height,
        taken_at=photo.taken_at,
        url=signed.url,
        url_expires_at=signed.expires_at,
    )


@router.post(
    "",
    response_model=PhotoUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    file: UploadFile = File(...),
    taken_at: datetime | None = Form(default=None),
    check_in_id: int | None = Form(default=None),
    view_type: str | None = Form(default=None),
    client_request_id: uuid.UUID | None = Form(default=None),
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
) -> PhotoUploadResponse:
    settings = get_settings()
    _validate_check_in_target(
        db,
        check_in_id=check_in_id,
        view_type=view_type,
        user_id=current_user.id,
    )
    if client_request_id is not None:
        existing_request = (
            db.query(Photo)
            .filter(
                Photo.user_id == current_user.id,
                Photo.client_request_id == client_request_id,
            )
            .first()
        )
        if existing_request is not None:
            return _to_upload_response(existing_request)

    if file.content_type not in settings.allowed_mime_set:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported mime: {file.content_type}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"file too large: {len(data)} > {settings.upload_max_bytes}",
        )

    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
        with Image.open(io.BytesIO(data)) as img:
            width, height = ImageOps.exif_transpose(img).size
    except (UnidentifiedImageError, OSError) as e:
        raise HTTPException(status_code=400, detail=f"invalid image: {e}") from e

    quality_result = None
    normalized_photo = None
    quality_meta = None
    if check_in_id is not None:
        try:
            quality_result = assess_photo_quality(data, view_type=view_type)
        except QualityModelUnavailable as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "message": "photo quality model unavailable",
                    "error": str(e),
                },
            ) from e
        if not quality_result.passed:
            rejected_path = None
            if (
                settings.app_env.lower() == "dev"
                and settings.photo_quality_save_rejected_in_dev
            ):
                try:
                    rejected_path = _save_rejected_quality_photo(
                        data,
                        check_in_id=check_in_id,
                        view_type=view_type,
                        ext=_MIME_TO_EXT[file.content_type],
                    )
                except OSError:
                    logger.exception(
                        "photo_quality_failed_debug_save_error "
                        "check_in_id=%s view_type=%s",
                        check_in_id,
                        view_type,
                    )
            logger.warning(
                "photo_quality_failed check_in_id=%s view_type=%s errors=%s "
                "metrics=%s rejected_path=%s",
                check_in_id,
                view_type,
                list(quality_result.errors),
                quality_result.metrics,
                rejected_path,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "message": "photo quality check failed",
                    "errors": list(quality_result.errors),
                    "quality_meta": quality_result.to_meta(),
                },
            )
        normalized_photo = normalize_photo_for_analysis(data, quality_result)
        quality_meta = quality_result.to_meta()
        quality_meta["normalization"] = normalized_photo.to_meta()

    now = datetime.now(tz=timezone.utc)
    ext = _MIME_TO_EXT[file.content_type]
    key = _build_storage_key(current_user.id, ext, now)
    processed_key = f"{key.rsplit('.', 1)[0]}.normalized.jpg" if normalized_photo else None

    if check_in_id is not None and view_type is not None:
        existing = (
            db.query(Photo)
            .filter(
                Photo.check_in_id == check_in_id,
                Photo.user_id == current_user.id,
                Photo.view_type == view_type,
                Photo.deleted_at.is_(None),
            )
            .first()
        )
        if existing is not None:
            existing.deleted_at = now
            db.flush()

    storage = get_storage()
    try:
        storage.put(key, data, file.content_type)
        if normalized_photo is not None and processed_key is not None:
            storage.put(processed_key, normalized_photo.data, "image/jpeg")
    except Exception:
        db.rollback()
        storage.delete(key)
        if processed_key is not None:
            storage.delete(processed_key)
        raise

    photo = Photo(
        user_id=current_user.id,
        check_in_id=check_in_id,
        view_type=view_type,
        client_request_id=client_request_id,
        quality_status=quality_result.status if quality_result else None,
        quality_meta=quality_meta,
        storage_key=key,
        processed_storage_key=processed_key,
        mime_type=file.content_type,
        size_bytes=len(data),
        width=width,
        height=height,
        taken_at=taken_at,
    )
    db.add(photo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        storage.delete(key)
        if processed_key is not None:
            storage.delete(processed_key)
        if client_request_id is None:
            raise
        existing_request = (
            db.query(Photo)
            .filter(
                Photo.user_id == current_user.id,
                Photo.client_request_id == client_request_id,
            )
            .first()
        )
        if existing_request is None:
            raise
        return _to_upload_response(existing_request)
    except Exception:
        db.rollback()
        storage.delete(key)
        if processed_key is not None:
            storage.delete(processed_key)
        raise
    db.refresh(photo)

    return _to_upload_response(photo)


@router.get("/{photo_id}/url")
def get_photo_url(
    photo_id: int,
    current_user: User = Depends(get_current_app_user),
    db: Session = Depends(get_db),
):
    photo = db.get(Photo, photo_id)
    if photo is None or photo.deleted_at is not None or photo.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="photo not found")
    signed = get_storage().signed_url(photo.storage_key)
    return {"url": signed.url, "expires_at": signed.expires_at}
