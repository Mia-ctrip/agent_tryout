from __future__ import annotations

import json
from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _register(client: TestClient, label: str) -> tuple[dict[str, str], str]:
    suffix = uuid4().hex
    password = "Context-pass-2026"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"context-{label}-{suffix}@example.test",
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
                "app_version": "context-closure",
            },
        ).status_code
        == 200
    )
    return headers, password


def test_life_context_selection_and_skip_survive_observation_and_event_reload(
    migrated_database_url: str | None,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the life-context HTTP closure")

    with TestClient(app) as client:
        owner_headers, owner_password = _register(client, "owner")
        other_headers, other_password = _register(client, "other")
        created = client.post(
            "/api/v1/observations",
            headers=owner_headers,
            data={
                "client_request_id": str(uuid4()),
                "recorded_at": "2026-08-24T08:00:00+08:00",
                "recorded_timezone_offset_minutes": "480",
                "targets_json": json.dumps(
                    [{"region_id": "forehead", "user_note": "额头状态记录"}]
                ),
            },
        )
        assert created.status_code == 201
        observation_id = created.json()["observation_id"]
        assert created.json()["life_context_ids"] == []
        assert created.json()["life_context_completed_at"] is None

        selected = client.put(
            f"/api/v1/observations/{observation_id}/life-contexts",
            headers=owner_headers,
            json={"context_ids": ["mood", "sleep"]},
        )
        assert selected.status_code == 200
        assert selected.json()["life_context_ids"] == ["sleep", "mood"]
        assert selected.json()["life_context_completed_at"] is not None

        restored = client.get(f"/api/v1/observations/{observation_id}", headers=owner_headers)
        assert restored.status_code == 200
        assert restored.json()["life_context_ids"] == ["sleep", "mood"]

        events = client.get("/api/v1/region-events", headers=owner_headers)
        assert events.status_code == 200
        detail = client.get(
            f"/api/v1/region-events/{events.json()[0]['event_id']}",
            headers=owner_headers,
        )
        assert detail.status_code == 200
        assert detail.json()["timepoints"][0]["life_context_ids"] == ["sleep", "mood"]
        assert detail.json()["timepoints"][0]["life_context_completed_at"] is not None

        skipped = client.put(
            f"/api/v1/observations/{observation_id}/life-contexts",
            headers=owner_headers,
            json={"context_ids": []},
        )
        assert skipped.status_code == 200
        assert skipped.json()["life_context_ids"] == []
        assert skipped.json()["life_context_completed_at"] is not None

        assert (
            client.put(
                f"/api/v1/observations/{observation_id}/life-contexts",
                headers=owner_headers,
                json={"context_ids": ["sleep", "sleep"]},
            ).status_code
            == 422
        )
        assert (
            client.put(
                f"/api/v1/observations/{observation_id}/life-contexts",
                headers=owner_headers,
                json={"context_ids": ["weather"]},
            ).status_code
            == 422
        )
        assert (
            client.put(
                f"/api/v1/observations/{observation_id}/life-contexts",
                headers=other_headers,
                json={"context_ids": ["sleep"]},
            ).status_code
            == 404
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
