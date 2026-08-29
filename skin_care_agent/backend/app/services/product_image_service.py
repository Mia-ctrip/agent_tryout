from __future__ import annotations

import hashlib
from dataclasses import dataclass
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings


_FORMAT_TO_IMAGE_METADATA = {
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
    "WEBP": ("image/webp", "webp"),
}


@dataclass(frozen=True)
class ValidatedProductImage:
    data: bytes
    mime_type: str
    width: int
    height: int
    sha256: str
    extension: str


def validate_product_image(data: bytes, mime_type: str) -> ValidatedProductImage:
    settings = get_settings()
    if mime_type not in settings.allowed_mime_set or mime_type not in {
        "image/jpeg",
        "image/png",
        "image/webp",
    }:
        raise HTTPException(status_code=400, detail="unsupported product image type")
    if not data or len(data) > settings.upload_max_bytes:
        raise HTTPException(status_code=400, detail="invalid product image size")
    try:
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        with Image.open(BytesIO(data)) as source:
            detected_format = source.format
            oriented = ImageOps.exif_transpose(source)
            width, height = oriented.size
    except (OSError, UnidentifiedImageError) as exc:
        raise HTTPException(status_code=400, detail="unreadable product image") from exc

    metadata = _FORMAT_TO_IMAGE_METADATA.get(detected_format or "")
    if metadata is None:
        raise HTTPException(status_code=400, detail="unsupported product image format")
    detected_mime_type, extension = metadata
    if mime_type != detected_mime_type:
        raise HTTPException(
            status_code=400,
            detail="product image MIME does not match file format",
        )
    return ValidatedProductImage(
        data=data,
        mime_type=mime_type,
        width=width,
        height=height,
        sha256=hashlib.sha256(data).hexdigest(),
        extension=extension,
    )


def user_product_image_key(*, user_id: int, client_request_id: UUID, extension: str) -> str:
    return f"product-images/users/{user_id}/{client_request_id}.{extension}"
