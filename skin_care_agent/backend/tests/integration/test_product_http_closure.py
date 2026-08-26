from __future__ import annotations

import json
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import app
from app.services import product_service
from app.services.storage_service.base import SignedURL


def _register(client: TestClient, label: str) -> tuple[dict[str, str], str]:
    suffix = uuid4().hex
    password = "Product-pass-2026"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"product-{label}-{suffix}@example.test",
            "password": password,
            "nickname": label,
            "device_id": f"device-{suffix}",
        },
    )
    assert response.status_code == 201
    headers = {"Authorization": f"Bearer {response.json()['tokens']['access_token']}"}
    settings = get_settings()
    consent = client.put(
        "/api/v1/me/consents",
        headers=headers,
        json={
            "consents": [
                {"consent_type": key, "version": version, "accepted": True}
                for key, version in settings.required_consents.items()
            ],
            "app_version": "product-closure",
        },
    )
    assert consent.status_code == 200
    return headers, password


def _jpeg_bytes() -> bytes:
    image = Image.new("RGB", (3, 5), color=(120, 90, 60))
    output = BytesIO()
    image.save(output, format="JPEG")
    return output.getvalue()


class _TrackingStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.put_count = 0

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.put_count += 1
        self.objects[key] = data

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def exists(self, key: str) -> bool:
        return key in self.objects

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SignedURL:
        return SignedURL(
            url=f"https://storage.invalid/{key}",
            expires_at=datetime(2026, 8, 24, tzinfo=timezone.utc),
        )


def test_custom_product_image_http_retry_and_owner_isolation(
    migrated_database_url: str | None,
    monkeypatch,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the custom-product image HTTP closure")

    storage = _TrackingStorage()
    monkeypatch.setattr(product_service, "get_storage", lambda: storage)
    with TestClient(app) as client:
        owner_headers, owner_password = _register(client, "custom-image-owner")
        other_headers, other_password = _register(client, "custom-image-other")
        request_id = str(uuid4())

        first = client.post(
            "/api/v1/products/custom",
            headers=owner_headers,
            data={"client_request_id": request_id, "name": "  我的自建精华  "},
            files={"file": ("custom.jpg", _jpeg_bytes(), "image/jpeg")},
        )
        assert first.status_code == 201
        assert first.json()["name"] == "我的自建精华"
        assert first.json()["source_type"] == "custom"
        assert first.json()["image_url"].startswith("https://storage.invalid/product-images/users/")
        assert first.json()["image_url"].endswith(f"/{request_id}.jpg")

        custom_product_id = first.json()["product_id"]
        assert storage.put_count == 1

        other_products = client.get("/api/v1/products", headers=other_headers)
        assert other_products.status_code == 200
        assert other_products.json() == []

        retry = client.post(
            "/api/v1/products/custom",
            headers=owner_headers,
            data={"client_request_id": request_id, "name": "不应覆盖"},
            files={"file": ("not-read.gif", b"not-an-image", "image/gif")},
        )
        assert retry.status_code == 200
        assert retry.json()["product_id"] == custom_product_id
        assert storage.put_count == 1

        no_image = client.post(
            "/api/v1/products/custom",
            headers=owner_headers,
            data={"client_request_id": str(uuid4()), "name": "无图自建产品"},
        )
        assert no_image.status_code == 201
        assert no_image.json()["image_url"] is None
        assert no_image.json()["standard_product_id"] is None

        assert client.get(f"/api/v1/products/{custom_product_id}", headers=other_headers).status_code == 404
        assert (
            client.request(
                "DELETE",
                "/api/v1/me",
                headers=owner_headers,
                json={"password": owner_password},
            ).status_code
            == 204
        )
        assert (
            client.request(
                "DELETE",
                "/api/v1/me",
                headers=other_headers,
                json={"password": other_password},
            ).status_code
            == 204
        )


def test_product_use_http_flow_is_idempotent_and_account_isolated(
    migrated_database_url: str | None,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the product HTTP closure")

    with TestClient(app) as client:
        owner_headers, owner_password = _register(client, "owner")
        other_headers, other_password = _register(client, "other")

        cleanser_request = str(uuid4())
        cleanser = client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": cleanser_request, "name": "  温和洁面  "},
        )
        assert cleanser.status_code == 201
        assert cleanser.json()["name"] == "温和洁面"
        cleanser_id = cleanser.json()["product_id"]

        cleanser_retry = client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": cleanser_request, "name": "重试时不同名称"},
        )
        assert cleanser_retry.status_code == 200
        assert cleanser_retry.json()["product_id"] == cleanser_id
        assert cleanser_retry.json()["name"] == "温和洁面"

        moisturizer = client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": str(uuid4()), "name": "保湿乳"},
        )
        assert moisturizer.status_code == 201
        moisturizer_id = moisturizer.json()["product_id"]

        use_request = str(uuid4())
        use_payload = {
            "client_request_id": use_request,
            "used_at": "2026-08-24T13:30:00+08:00",
            "used_timezone_offset_minutes": 480,
            "product_ids": [cleanser_id, moisturizer_id],
            "note": "  晚间正常使用  ",
        }
        product_use = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json=use_payload,
        )
        assert product_use.status_code == 201
        assert product_use.json()["note"] == "晚间正常使用"
        assert [item["product_id"] for item in product_use.json()["products"]] == [
            cleanser_id,
            moisturizer_id,
        ]
        use_id = product_use.json()["product_use_id"]

        product_use_retry = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={**use_payload, "product_ids": [], "note": "不同重试正文"},
        )
        assert product_use_retry.status_code == 200
        assert product_use_retry.json()["product_use_id"] == use_id
        assert len(product_use_retry.json()["products"]) == 2
        assert product_use_retry.json()["note"] == "晚间正常使用"

        unnamed = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "used_at": "2026-08-24T14:00:00+08:00",
                "used_timezone_offset_minutes": 480,
                "product_ids": [],
                "note": None,
            },
        )
        assert unnamed.status_code == 201
        assert unnamed.json()["products"] == []

        listed_uses = client.get("/api/v1/product-uses", headers=owner_headers)
        assert listed_uses.status_code == 200
        assert [item["product_use_id"] for item in listed_uses.json()] == [
            unnamed.json()["product_use_id"],
            use_id,
        ]

        products = client.get("/api/v1/products", headers=owner_headers)
        assert products.status_code == 200
        assert {item["product_id"] for item in products.json()} == {
            cleanser_id,
            moisturizer_id,
        }
        assert all(item["use_count"] == 1 for item in products.json())

        detail = client.get(f"/api/v1/products/{cleanser_id}", headers=owner_headers)
        assert detail.status_code == 200
        assert [item["product_use_id"] for item in detail.json()["uses"]] == [use_id]

        duplicate_ids = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={
                **use_payload,
                "client_request_id": str(uuid4()),
                "product_ids": [cleanser_id, cleanser_id],
            },
        )
        assert duplicate_ids.status_code == 422

        foreign_product = client.post(
            "/api/v1/product-uses",
            headers=other_headers,
            json={**use_payload, "client_request_id": str(uuid4()), "product_ids": [cleanser_id]},
        )
        assert foreign_product.status_code == 404
        assert (
            client.get(f"/api/v1/products/{cleanser_id}", headers=other_headers).status_code == 404
        )
        assert (
            client.get(f"/api/v1/product-uses/{use_id}", headers=other_headers).status_code == 404
        )

        assert (
            client.request(
                "DELETE",
                "/api/v1/me",
                headers=owner_headers,
                json={"password": owner_password},
            ).status_code
            == 204
        )
        assert (
            client.request(
                "DELETE",
                "/api/v1/me",
                headers=other_headers,
                json={"password": other_password},
            ).status_code
            == 204
        )


def test_products_contexts_and_timeline_survive_a_new_http_client(
    migrated_database_url: str | None,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the combined Slice 4-5 HTTP closure")

    with TestClient(app) as first_client:
        owner_headers, owner_password = _register(first_client, "combined-owner")
        other_headers, other_password = _register(first_client, "combined-other")

        product_request_id = str(uuid4())
        product = first_client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": product_request_id, "name": "修护乳"},
        )
        assert product.status_code == 201
        product_id = product.json()["product_id"]
        assert (
            first_client.post(
                "/api/v1/products",
                headers=owner_headers,
                json={"client_request_id": product_request_id, "name": "重试不改名"},
            ).json()["product_id"]
            == product_id
        )

        use_request_id = str(uuid4())
        product_use = first_client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={
                "client_request_id": use_request_id,
                "used_at": "2026-08-24T12:00:00+08:00",
                "used_timezone_offset_minutes": 480,
                "product_ids": [product_id],
                "note": "午间真实使用",
            },
        )
        assert product_use.status_code == 201
        product_use_id = product_use.json()["product_use_id"]
        assert (
            first_client.post(
                "/api/v1/product-uses",
                headers=owner_headers,
                json={
                    "client_request_id": use_request_id,
                    "used_at": "2026-08-24T12:00:00+08:00",
                    "used_timezone_offset_minutes": 480,
                    "product_ids": [],
                    "note": None,
                },
            ).json()["product_use_id"]
            == product_use_id
        )

        selected_observation = first_client.post(
            "/api/v1/observations",
            headers=owner_headers,
            data={
                "client_request_id": str(uuid4()),
                "recorded_at": "2026-08-24T10:00:00+08:00",
                "recorded_timezone_offset_minutes": "480",
                "targets_json": json.dumps(
                    [{"region_id": "forehead", "user_note": "额头原始观察"}]
                ),
            },
        )
        assert selected_observation.status_code == 201
        selected_id = selected_observation.json()["observation_id"]
        assert first_client.put(
            f"/api/v1/observations/{selected_id}/life-contexts",
            headers=owner_headers,
            json={"context_ids": ["care_change", "sleep"]},
        ).json()["life_context_ids"] == ["sleep", "care_change"]

        skipped_observation = first_client.post(
            "/api/v1/observations",
            headers=owner_headers,
            data={
                "client_request_id": str(uuid4()),
                "recorded_at": "2026-08-24T11:00:00+08:00",
                "recorded_timezone_offset_minutes": "480",
                "targets_json": json.dumps([{"region_id": "chin", "user_note": "下巴原始观察"}]),
            },
        )
        assert skipped_observation.status_code == 201
        skipped_id = skipped_observation.json()["observation_id"]
        skipped = first_client.put(
            f"/api/v1/observations/{skipped_id}/life-contexts",
            headers=owner_headers,
            json={"context_ids": []},
        )
        assert skipped.status_code == 200
        assert skipped.json()["life_context_completed_at"] is not None

    # Reopening the ASGI HTTP client proves all facts are restored from PostgreSQL,
    # not retained in component or request-process memory.
    with TestClient(app) as restored_client:
        product_detail = restored_client.get(
            f"/api/v1/products/{product_id}", headers=owner_headers
        )
        assert product_detail.status_code == 200
        assert product_detail.json()["uses"][0]["product_use_id"] == product_use_id

        selected = restored_client.get(f"/api/v1/observations/{selected_id}", headers=owner_headers)
        assert selected.status_code == 200
        assert selected.json()["life_context_ids"] == ["sleep", "care_change"]
        skipped = restored_client.get(f"/api/v1/observations/{skipped_id}", headers=owner_headers)
        assert skipped.json()["life_context_ids"] == []
        assert skipped.json()["life_context_completed_at"] is not None

        events = restored_client.get("/api/v1/region-events", headers=owner_headers)
        assert events.status_code == 200
        event_contexts = []
        for event in events.json():
            detail = restored_client.get(
                f"/api/v1/region-events/{event['event_id']}", headers=owner_headers
            )
            assert detail.status_code == 200
            event_contexts.append(detail.json()["timepoints"][0]["life_context_ids"])
        assert ["sleep", "care_change"] in event_contexts
        assert [] in event_contexts

        timeline = restored_client.get("/api/v1/timeline", headers=owner_headers)
        assert timeline.status_code == 200
        assert timeline.json()[0]["kind"] == "product_use"
        assert [item["kind"] for item in timeline.json()].count("region_event") == 2
        assert all("correlation" not in item and "effect" not in item for item in timeline.json())

        assert (
            restored_client.get(f"/api/v1/products/{product_id}", headers=other_headers).status_code
            == 404
        )
        assert (
            restored_client.get(
                f"/api/v1/observations/{selected_id}", headers=other_headers
            ).status_code
            == 404
        )
        assert restored_client.get("/api/v1/timeline", headers=other_headers).json() == []

        assert (
            restored_client.request(
                "DELETE",
                "/api/v1/me",
                headers=owner_headers,
                json={"password": owner_password},
            ).status_code
            == 204
        )
        assert (
            restored_client.request(
                "DELETE",
                "/api/v1/me",
                headers=other_headers,
                json={"password": other_password},
            ).status_code
            == 204
        )
