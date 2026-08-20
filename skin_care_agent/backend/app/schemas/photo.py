from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PhotoUploadResponse(BaseModel):
    photo_id: int
    client_request_id: UUID | None = None
    check_in_id: int | None = None
    view_type: str | None = None
    quality_status: str | None = None
    quality_meta: dict[str, Any] | None = None
    storage_key: str
    mime_type: str
    size_bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    taken_at: Optional[datetime] = None
    url: str = Field(..., description="短期签名 URL，前端用于显示图片")
    url_expires_at: datetime


class PhotoOut(BaseModel):
    photo_id: int
    client_request_id: UUID | None = None
    check_in_id: int | None = None
    view_type: str | None = None
    quality_status: str | None = None
    quality_meta: dict[str, Any] | None = None
    storage_key: str
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    taken_at: Optional[datetime] = None
    created_at: datetime
    url: str
    url_expires_at: datetime
