from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class SignedURL:
    url: str
    expires_at: datetime


class StorageBackend(ABC):
    """Abstract object storage. local / cos / s3 share this interface."""

    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> None:
        """Persist bytes at `key`."""

    @abstractmethod
    def get(self, key: str) -> bytes:
        """Fetch bytes at `key`. Raise FileNotFoundError if missing."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        ...

    @abstractmethod
    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SignedURL:
        """Return a short-lived URL the client can use to fetch the object."""
