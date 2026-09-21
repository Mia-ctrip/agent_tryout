from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.storage_service.base import SignedURL, StorageBackend


class CosStorage(StorageBackend):
    """Tencent COS-backed storage using the existing storage interface."""

    def __init__(
        self,
        bucket: str,
        region: str,
        secret_id: str = "",
        secret_key: str = "",
        client: Any | None = None,
    ) -> None:
        if not bucket or not region:
            raise ValueError("COS_BUCKET and COS_REGION are required")
        self.bucket = bucket
        self.region = region
        self.client = client or self._create_client(secret_id, secret_key)

    def _create_client(self, secret_id: str, secret_key: str) -> Any:
        if not secret_id or not secret_key:
            raise ValueError("COS_SECRET_ID and COS_SECRET_KEY are required")
        from qcloud_cos import CosConfig, CosS3Client

        config = CosConfig(
            Region=self.region,
            SecretId=secret_id,
            SecretKey=secret_key,
            Scheme="https",
        )
        return CosS3Client(config)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    def get(self, key: str) -> bytes:
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if getattr(exc, "get_status_code", lambda: None)() == 404:
                raise FileNotFoundError(key) from exc
            raise

        body = response["Body"]
        if isinstance(body, bytes):
            return body
        stream = body.get_raw_stream() if hasattr(body, "get_raw_stream") else body
        return stream.read()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if getattr(exc, "get_status_code", lambda: None)() == 404:
                return False
            raise
        return True

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SignedURL:
        from app.config import get_settings

        ttl = ttl_seconds or get_settings().storage_url_ttl_seconds
        url = self.client.get_presigned_download_url(
            Bucket=self.bucket,
            Key=key,
            Expired=ttl,
        )
        return SignedURL(
            url=url,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl),
        )
