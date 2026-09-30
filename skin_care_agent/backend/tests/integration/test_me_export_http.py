from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _register(client: TestClient, label: str) -> dict[str, str]:
    suffix = uuid4().hex
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"export-{label}-{suffix}@example.test",
            "password": "Export-pass-2026",
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
            "app_version": "export-closure",
        },
    )
    assert consent.status_code == 200
    return headers


def test_data_export_http_reports_owned_records_and_isolates_accounts(
    migrated_database_url: str | None,
) -> None:
    if migrated_database_url is None:
        pytest.skip("use --local-postgres for the data export HTTP closure")

    with TestClient(app) as client:
        owner_headers = _register(client, "export-owner")
        other_headers = _register(client, "export-other")

        product = client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": str(uuid4()), "name": "  出口测试精华  "},
        )
        assert product.status_code == 201
        product_id = product.json()["product_id"]

        use = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "used_at": "2026-09-29T20:00:00+08:00",
                "used_timezone_offset_minutes": 480,
                "product_ids": [product_id],
                "note": "导出闭环验证",
            },
        )
        assert use.status_code == 201

        export = client.get("/api/v1/me/export", headers=owner_headers)
        assert export.status_code == 200
        payload = export.json()

        assert payload["personal_products"][0]["name"] == "出口测试精华"
        assert payload["product_uses"][0]["note"] == "导出闭环验证"
        assert payload["product_uses"][0]["products"][0]["name_snapshot"] == "出口测试精华"
        assert {item["consent_type"] for item in payload["consents"]} == set(
            get_settings().required_consents
        )
        assert payload["observations"] == []
        assert payload["region_events"] == []

        other_export = client.get("/api/v1/me/export", headers=other_headers)
        assert other_export.status_code == 200
        assert other_export.json()["personal_products"] == []
        assert other_export.json()["product_uses"] == []
