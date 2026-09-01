from __future__ import annotations

import io
import json
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import app
from app.schemas.observation_quality import ObservationQualityOut
from app.services.ai_gateway.gateway import AIGateway
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.routes import ModelBinding, ModelRoute
from app.services.ai_gateway.types import Capability, UnifiedRequest, UnifiedResponse
from app.services.observation_quality_service import build_region_geometries


def _jpeg() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (720, 960), color=(148, 132, 126)).save(output, format="JPEG")
    return output.getvalue()


class _RegionalClosureProvider(Provider):
    name = "local_closure"
    capabilities = {Capability.TEXT, Capability.VISION, Capability.JSON_MODE}

    def __init__(self) -> None:
        self.chin_attempts = 0

    async def invoke(
        self,
        model: str,
        req: UnifiedRequest,
        timeout_s: float,
    ) -> UnifiedResponse:
        del timeout_s
        system = req.messages[0].content
        if "region_id: chin" in system:
            self.chin_attempts += 1
            if self.chin_attempts == 1:
                return UnifiedResponse(text="not-json", provider=self.name, model=model)
        return UnifiedResponse(
            text=json.dumps(req.extra["mock_json"], ensure_ascii=False),
            provider=self.name,
            model=model,
        )


def test_real_http_region_flow_recovers_independent_states_and_events(
    migrated_database_url,
    monkeypatch,
) -> None:
    if migrated_database_url is None:
        import pytest

        pytest.skip("use --local-postgres for the local HTTP closure")
    provider = _RegionalClosureProvider()
    gateway = AIGateway(
        providers={provider.name: provider},
        routes={
            "vision_analyze": ModelRoute(
                task="vision_analyze",
                chain=(ModelBinding(provider.name, "deterministic-v1"),),
                requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
                max_retries_per_node=0,
            )
        },
    )
    monkeypatch.setattr("app.services.region_analysis_service.get_gateway", lambda: gateway)
    quality = ObservationQualityOut(
        status="passed",
        primary_issue=None,
        issues=[],
        metrics={"face_count": 1, "width": 720, "height": 960},
        regions=build_region_geometries([(0.5, 0.5, 0.0)] * 478),
    )
    monkeypatch.setattr(
        "app.services.observation_quality_service.assess_observation_photo",
        lambda _data: quality,
    )

    suffix = uuid4().hex
    email = f"closure-{suffix}@example.test"
    password = "Closure-pass-2026"
    request_id = str(uuid4())
    observation_id: int | None = None
    headers: dict[str, str] = {}
    with TestClient(app) as client:
        registered = client.post(
            "/api/v1/auth/register",
            json={
                "email": email,
                "password": password,
                "nickname": "closure",
                "device_id": f"device-{suffix}",
            },
        )
        assert registered.status_code == 201
        headers = {
            "Authorization": f"Bearer {registered.json()['tokens']['access_token']}"
        }
        settings = get_settings()
        consent = client.put(
            "/api/v1/me/consents",
            headers=headers,
            json={
                "consents": [
                    {"consent_type": key, "version": version, "accepted": True}
                    for key, version in settings.required_consents.items()
                ],
                "app_version": "closure",
            },
        )
        assert consent.status_code == 200

        form = {
            "client_request_id": request_id,
            "recorded_at": "2026-08-24T08:00:00Z",
            "recorded_timezone_offset_minutes": "480",
            "targets_json": json.dumps(
                [{"region_id": "left_face"}, {"region_id": "chin"}]
            ),
        }
        created = client.post(
            "/api/v1/observations",
            headers=headers,
            data=form,
            files={"file": ("closure.jpg", _jpeg(), "image/jpeg")},
        )
        assert created.status_code == 201
        observation_id = created.json()["observation_id"]

        restored = client.get(
            f"/api/v1/observations/{observation_id}", headers=headers
        )
        assert restored.status_code == 200
        targets = {row["region_id"]: row for row in restored.json()["targets"]}
        assert targets["left_face"]["status"] == "completed"
        assert targets["chin"]["status"] == "needs_input"

        duplicate = client.post(
            "/api/v1/observations",
            headers=headers,
            data=form,
            files={"file": ("broken.jpg", b"not-an-image", "image/jpeg")},
        )
        assert duplicate.status_code == 200
        assert duplicate.json()["observation_id"] == observation_id

        before_note = client.get("/api/v1/region-events", headers=headers)
        assert before_note.status_code == 200
        assert [event["region_id"] for event in before_note.json()] == ["left_face"]

        retried = client.post(
            f"/api/v1/observations/{observation_id}/targets/"
            f"{targets['chin']['target_id']}/retry",
            headers=headers,
        )
        assert retried.status_code == 200
        retried_targets = {row["region_id"]: row for row in retried.json()["targets"]}
        assert retried_targets["left_face"]["result_source"] == "photo_analysis"
        assert retried_targets["chin"]["result_source"] == "photo_analysis"

        events = client.get("/api/v1/region-events", headers=headers)
        assert events.status_code == 200
        assert {event["region_id"] for event in events.json()} == {"left_face", "chin"}
        for event in events.json():
            detail = client.get(
                f"/api/v1/region-events/{event['event_id']}", headers=headers
            )
            assert detail.status_code == 200
            assert len(detail.json()["timepoints"]) == 1

    with TestClient(app) as restarted_client:
        reloaded = restarted_client.get(
            f"/api/v1/observations/{observation_id}", headers=headers
        )
        assert reloaded.status_code == 200
        assert all(
            target["status"] == "completed" for target in reloaded.json()["targets"]
        )
        deleted = restarted_client.request(
            "DELETE",
            "/api/v1/me",
            headers=headers,
            json={"password": password},
        )
        assert deleted.status_code == 204
