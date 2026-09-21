from datetime import datetime, timezone

from app.services.storage_service.cos import CosStorage


class NotFoundError(Exception):
    def get_status_code(self) -> int:
        return 404


class FakeCosClient:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> None:
        self.objects[Key] = (Body, ContentType)

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
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
