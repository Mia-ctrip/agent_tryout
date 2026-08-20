from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.services.storage_service.base import StorageBackend
from app.services.storage_service.local import LocalStorage


@lru_cache
def get_storage() -> StorageBackend:
    s = get_settings()
    if s.storage_backend == "local":
        return LocalStorage(s.storage_local_path)
    raise NotImplementedError(f"storage backend not supported yet: {s.storage_backend}")
