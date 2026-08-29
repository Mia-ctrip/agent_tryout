from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from PIL import Image

from app.services import product_image_service
from app.services import product_service


def _image_bytes(
    image_format: str,
    *,
    size: tuple[int, int] = (3, 5),
    orientation: int | None = None,
) -> bytes:
    image = Image.new("RGB", size, color=(120, 90, 60))
    output = BytesIO()
    if orientation is None:
        image.save(output, format=image_format)
    else:
        exif = Image.Exif()
        exif[274] = orientation
        image.save(output, format=image_format, exif=exif)
    return output.getvalue()


@pytest.fixture(autouse=True)
def _image_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        product_image_service,
        "get_settings",
        lambda: SimpleNamespace(
            allowed_mime_set={"image/jpeg", "image/png", "image/webp"},
            upload_max_bytes=1024 * 1024,
        ),
    )


def test_product_image_rejects_invalid_bytes() -> None:
    with pytest.raises(HTTPException) as error:
        product_image_service.validate_product_image(b"not-an-image", "image/jpeg")

    assert error.value.status_code == 400
    assert error.value.detail == "unreadable product image"


def test_product_image_rejects_unsupported_declared_mime() -> None:
    with pytest.raises(HTTPException) as error:
        product_image_service.validate_product_image(_image_bytes("PNG"), "image/gif")

    assert error.value.status_code == 400
    assert error.value.detail == "unsupported product image type"


def test_product_image_rejects_mime_that_disagrees_with_the_actual_format() -> None:
    with pytest.raises(HTTPException) as error:
        product_image_service.validate_product_image(_image_bytes("PNG"), "image/jpeg")

    assert error.value.status_code == 400
    assert error.value.detail == "product image MIME does not match file format"


def test_product_image_rejects_bytes_over_the_configured_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        product_image_service,
        "get_settings",
        lambda: SimpleNamespace(
            allowed_mime_set={"image/jpeg"},
            upload_max_bytes=4,
        ),
    )

    with pytest.raises(HTTPException) as error:
        product_image_service.validate_product_image(_image_bytes("JPEG"), "image/jpeg")

    assert error.value.status_code == 400
    assert error.value.detail == "invalid product image size"


def test_product_image_uses_exif_orientation_for_dimensions_without_reencoding() -> None:
    data = _image_bytes("JPEG", size=(3, 5), orientation=6)

    image = product_image_service.validate_product_image(data, "image/jpeg")

    assert image.data == data
    assert image.mime_type == "image/jpeg"
    assert image.extension == "jpg"
    assert (image.width, image.height) == (5, 3)


class _TrackingStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.put_count = 0
        self.deleted: list[str] = []

    def exists(self, key: str) -> bool:
        return key in self.objects

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.put_count += 1
        self.objects[key] = data

    def delete(self, key: str) -> None:
        self.deleted.append(key)
        self.objects.pop(key, None)


class _RaceDatabase:
    def add(self, item: object) -> None:
        pass

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        from sqlalchemy.exc import IntegrityError

        raise IntegrityError("insert", {}, RuntimeError("duplicate request"))

    def rollback(self) -> None:
        pass

    def scalar(self, statement: object) -> None:
        return None


def test_custom_product_race_deletes_only_the_new_unreferenced_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _TrackingStorage()
    request_id = uuid4()
    image = product_image_service.validate_product_image(_image_bytes("JPEG"), "image/jpeg")
    winner = object()
    lookups = iter([None, winner])

    monkeypatch.setattr(product_service, "get_storage", lambda: storage)
    monkeypatch.setattr(product_service, "_find_product_by_request", lambda *args, **kwargs: next(lookups))
    monkeypatch.setattr(product_service, "_product_out", lambda *args, **kwargs: winner)

    result, created = product_service.create_custom_product(
        _RaceDatabase(),
        user_id=7,
        client_request_id=request_id,
        name="自建产品",
        image=image,
    )

    assert result is winner
    assert created is False
    assert storage.put_count == 1
    assert storage.objects == {}
    assert storage.deleted == [f"product-images/users/7/{request_id}.jpg"]


def test_custom_product_race_preserves_a_preexisting_retry_object(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = _TrackingStorage()
    request_id = uuid4()
    storage_key = f"product-images/users/7/{request_id}.jpg"
    original_bytes = _image_bytes("JPEG")
    storage.objects[storage_key] = original_bytes
    image = product_image_service.validate_product_image(original_bytes, "image/jpeg")
    winner = object()
    lookups = iter([None, winner])

    monkeypatch.setattr(product_service, "get_storage", lambda: storage)
    monkeypatch.setattr(
        product_service,
        "_find_product_by_request",
        lambda *args, **kwargs: next(lookups),
    )
    monkeypatch.setattr(product_service, "_product_out", lambda *args, **kwargs: winner)

    result, created = product_service.create_custom_product(
        _RaceDatabase(),
        user_id=7,
        client_request_id=request_id,
        name="自建产品",
        image=image,
    )

    assert result is winner
    assert created is False
    assert storage.put_count == 0
    assert storage.objects == {storage_key: original_bytes}
    assert storage.deleted == []


def test_custom_product_route_precedes_the_dynamic_product_route() -> None:
    from app.api.products import products_router

    paths = [route.path for route in products_router.routes]

    assert paths.index("/products/custom") < paths.index("/products/{product_id}")
