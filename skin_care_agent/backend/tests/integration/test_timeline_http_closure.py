from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import get_settings
from app.db.session import SessionLocal
from app.main import app
from app.models.observation import ObservationRecord, ObservationTarget
from app.services.full_face_prompt import FULL_FACE_OBSERVATION_MOCK


def _register(client: TestClient, label: str) -> tuple[dict[str, str], str, int]:
    suffix = uuid4().hex
    password = "Timeline-pass-2026"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"timeline-{label}-{suffix}@example.test",
            "password": password,
            "nickname": label,
            "device_id": f"device-{suffix}",
        },
    )
    assert response.status_code == 201
    headers = {"Authorization": f"Bearer {response.json()['tokens']['access_token']}"}
    settings = get_settings()
    assert (
        client.put(
            "/api/v1/me/consents",
            headers=headers,
            json={
                "consents": [
                    {"consent_type": key, "version": version, "accepted": True}
                    for key, version in settings.required_consents.items()
                ],
                "app_version": "timeline-closure",
            },
        ).status_code
        == 200
    )
    return headers, password, response.json()["user"]["user_id"]


def _seed_full_face(user_id: int) -> int:
    with SessionLocal() as db:
        record = ObservationRecord(
            user_id=user_id,
            client_request_id=uuid4(),
            recorded_at=datetime.fromisoformat("2026-08-24T07:00:00+08:00"),
            recorded_timezone_offset_minutes=480,
            recorded_local_date=datetime.fromisoformat("2026-08-24").date(),
            status="saved",
        )
        db.add(record)
        db.flush()
        target = ObservationTarget(
            record_id=record.id,
            user_id=user_id,
            scope_type="full_face",
            status="completed",
            result_source="photo_analysis",
            facts=dict(FULL_FACE_OBSERVATION_MOCK),
        )
        db.add(target)
        db.commit()
        return record.id


def test_timeline_orders_independent_facts_without_causal_fields(
    migrated_database_url: str | None,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the timeline HTTP closure")

    with TestClient(app) as client:
        owner_headers, owner_password, owner_id = _register(client, "owner")
        other_headers, other_password, _ = _register(client, "other")
        full_face_id = _seed_full_face(owner_id)

        region = client.post(
            "/api/v1/observations",
            headers=owner_headers,
            data={
                "client_request_id": str(uuid4()),
                "recorded_at": "2026-08-24T08:00:00+08:00",
                "recorded_timezone_offset_minutes": "480",
                "targets_json": json.dumps([{"region_id": "chin", "user_note": "下巴状态记录"}]),
            },
        )
        assert region.status_code == 201

        product = client.post(
            "/api/v1/products",
            headers=owner_headers,
            json={"client_request_id": str(uuid4()), "name": "保湿乳"},
        )
        assert product.status_code == 201
        product_use = client.post(
            "/api/v1/product-uses",
            headers=owner_headers,
            json={
                "client_request_id": str(uuid4()),
                "used_at": "2026-08-24T09:00:00+08:00",
                "used_timezone_offset_minutes": 480,
                "product_ids": [product.json()["product_id"]],
                "note": "正常使用",
            },
        )
        assert product_use.status_code == 201

        timeline = client.get("/api/v1/timeline", headers=owner_headers)
        assert timeline.status_code == 200
        assert [item["kind"] for item in timeline.json()] == [
            "product_use",
            "region_event",
            "full_face_observation",
        ]
        assert timeline.json()[0]["source"] == "user_record"
        assert timeline.json()[0]["products"][0]["name"] == "保湿乳"
        assert timeline.json()[1]["region_id"] == "chin"
        assert timeline.json()[1]["timepoint_count"] == 1
        assert timeline.json()[1]["sources"] == ["user_record"]
        assert timeline.json()[2]["observation_id"] == full_face_id
        assert timeline.json()[2]["source"] == "photo_analysis"
        assert all("correlation" not in item and "effect" not in item for item in timeline.json())

        other_timeline = client.get("/api/v1/timeline", headers=other_headers)
        assert other_timeline.status_code == 200
        assert other_timeline.json() == []

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
