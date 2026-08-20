"""Storage abstraction.

Public API exposed by the package:
    - StorageBackend (ABC)
    - SignedURL
    - get_storage() -> StorageBackend
    - sign_url / verify_signature  (HMAC helpers, used by /files route)
"""

from app.services.storage_service.base import StorageBackend, SignedURL
from app.services.storage_service.signing import sign_url, verify_signature
from app.services.storage_service.factory import get_storage

__all__ = [
    "StorageBackend",
    "SignedURL",
    "get_storage",
    "sign_url",
    "verify_signature",
]
