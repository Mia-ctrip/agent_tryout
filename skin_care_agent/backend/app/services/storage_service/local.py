from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings
from app.services.storage_service.base import SignedURL, StorageBackend
from app.services.storage_service.signing import sign_url


class LocalStorage(StorageBackend):
    """Filesystem-backed storage. Mimics S3/COS interface for MVP."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if ".." in key.split("/"):
            raise ValueError(f"illegal key: {key}")
        return self.root / key

    def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    def get(self, key: str) -> bytes:
        p = self._path(key)
        if not p.is_file():
            raise FileNotFoundError(key)
        return p.read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.is_file():
            p.unlink()

    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SignedURL:
        ttl = ttl_seconds or get_settings().storage_url_ttl_seconds
        url, exp = sign_url(key, ttl)
        return SignedURL(url=url, expires_at=datetime.fromtimestamp(exp, tz=timezone.utc))
