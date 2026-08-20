from __future__ import annotations

import mimetypes

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.services.storage_service import get_storage, verify_signature


router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{key:path}")
def serve_file(
    key: str,
    exp: int = Query(...),
    sig: str = Query(...),
):
    if not verify_signature(key, exp, sig):
        raise HTTPException(status_code=403, detail="invalid or expired signature")

    storage = get_storage()
    try:
        data = storage.get(key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="file not found")

    media_type, _ = mimetypes.guess_type(key)
    return Response(content=data, media_type=media_type or "application/octet-stream")
