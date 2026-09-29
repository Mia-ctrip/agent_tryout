from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException

from app.api import files
from app.services.storage_service import factory, signing
from app.services.storage_service.cos import CosStorage
from app.services.storage_service.local import LocalStorage


class NotFoundError(Exception):
    def get_status_code(self) -> int:
        return 404


class FakeCosClient:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:
        self.objects[Key] = (Body, ContentType)

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
        if Key not in self.objects:
            raise NotFoundError(Key)
        body, _ = self.objects[Key]
        return {"Body": body}

    def head_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
        if Key not in self.objects:
            raise NotFoundError(Key)
        return {}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.objects.pop(Key, None)

    def get_presigned_download_url(self, *, Bucket: str, Key: str, Expired: int) -> str:
        return f"https://{Bucket}.cos.ap-shanghai.myqcloud.com/{Key}?expired={Expired}"


def test_cos_storage_implements_object_lifecycle_and_signed_url() -> None:
    client = FakeCosClient()
    storage = CosStorage(
        bucket="example-1250000000",
        region="ap-shanghai",
        client=client,
    )

    storage.put("photos/1.jpg", b"image", "image/jpeg")

    assert storage.exists("photos/1.jpg") is True
    assert storage.get("photos/1.jpg") == b"image"

    signed = storage.signed_url("photos/1.jpg", ttl_seconds=60)
    assert signed.url.startswith("https://example-1250000000.cos.ap-shanghai")
    assert signed.expires_at > datetime.now(timezone.utc)

    storage.delete("photos/1.jpg")

    assert storage.exists("photos/1.jpg") is False


@pytest.fixture
def switched_storage(tmp_path, monkeypatch):
    settings = SimpleNamespace(
        storage_backend="cos",
        storage_local_path=tmp_path,
        cos_bucket="example-1250000000",
        cos_region="ap-shanghai",
        cos_secret_id="",
        cos_secret_key="",
        storage_url_ttl_seconds=60,
        storage_local_base_url="http://localhost:8000/files",
        storage_url_sign_secret="test-only-signing-secret",
    )
    client = FakeCosClient()
    monkeypatch.setattr(factory, "get_settings", lambda: settings)
    monkeypatch.setattr(signing, "get_settings", lambda: settings)
    monkeypatch.setattr(CosStorage, "_create_client", lambda *args: client)
    factory.get_storage.cache_clear()
    storage = factory.get_storage()
    monkeypatch.setattr(files, "get_storage", lambda: storage)
    try:
        yield storage, LocalStorage(tmp_path), client
    finally:
        factory.get_storage.cache_clear()


def test_switching_to_cos_preserves_signed_access_to_local_history(switched_storage):
    storage, local, client = switched_storage
    key = "observations/226/2026/09/15/legacy.png"
    local.put(key, b"legacy-photo", "image/png")

    # Both the initial response and a refreshed URL must point to the actual file.
    for _ in range(2):
        signed = storage.signed_url(key, ttl_seconds=60)
        assert signed.url.startswith(f"http://localhost:8000/files/{key}?")
        query = parse_qs(urlsplit(signed.url).query)
        response = files.serve_file(key, exp=int(query["exp"][0]), sig=query["sig"][0])
        assert response.body == b"legacy-photo"
        assert response.media_type == "image/png"

    assert storage.exists(key)
    assert client.objects == {}  # Reading old photos must not upload them.
    with pytest.raises(HTTPException) as error:
        files.serve_file(key, exp=int(query["exp"][0]), sig="invalid")
    assert error.value.status_code == 403


def test_switching_to_cos_keeps_new_uploads_in_cos(switched_storage):
    storage, local, client = switched_storage
    key = "observations/new.png"
    storage.put(key, b"new-photo", "image/png")

    assert storage.get(key) == b"new-photo"
    assert storage.exists(key)
    assert not local.exists(key)
    assert client.objects[key] == (b"new-photo", "image/png")
    assert storage.signed_url(key, ttl_seconds=60).url.startswith("https://example-1250000000.cos.")


def test_deleting_legacy_photo_removes_local_copy_after_switch(switched_storage):
    storage, local, _ = switched_storage
    key = "observations/legacy.png"
    local.put(key, b"legacy-photo", "image/png")

    storage.delete(key)

    assert not local.exists(key)
    assert not storage.exists(key)
    with pytest.raises(FileNotFoundError):
        storage.get(key)
