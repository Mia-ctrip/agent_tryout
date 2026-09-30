"""Create observations over HTTP the way the MVP allows: a photo is always required.

Closure tests that only need a valid region timepoint use the spec's text fallback:
photo saved → AI unavailable (``needs_input``) → the user fills the region note.
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import update

from app.api import observations
from app.db.session import SessionLocal
from app.models.observation import ObservationTarget
from app.schemas.observation_quality import ObservationQualityOut
from app.services import observation_quality_service, observation_service


class MemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        del content_type
        self.objects[key] = data

    def get(self, key: str) -> bytes:
        return self.objects[key]

    def exists(self, key: str) -> bool:
        return key in self.objects

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)

    def signed_url(self, key: str, ttl_seconds: int | None = None) -> SimpleNamespace:
        del ttl_seconds
        return SimpleNamespace(
            url=f"https://storage.invalid/{key}",
            expires_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
        )


def _jpeg() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (64, 64), color=(148, 132, 126)).save(output, format="JPEG")
    return output.getvalue()


def patch_photo_pipeline(monkeypatch) -> MemoryStorage:
    """Pass the quality gate, keep objects in memory, and leave AI targets queued."""
    storage = MemoryStorage()

    async def no_worker(_target_id: int) -> None:
        return None

    monkeypatch.setattr(observation_service, "get_storage", lambda: storage)
    monkeypatch.setattr(
        observation_quality_service,
        "assess_observation_photo",
        lambda _data: ObservationQualityOut(
            status="passed", primary_issue=None, issues=[], metrics={"face_count": 1}, regions=[]
        ),
    )
    monkeypatch.setattr(observations, "run_observation_target", no_worker)
    return storage


def create_region_timepoint(
    client: TestClient,
    headers: dict[str, str],
    *,
    region_id: str,
    note: str,
    recorded_at: str,
) -> dict[str, Any]:
    created = client.post(
        "/api/v1/observations",
        headers=headers,
        data={
            "client_request_id": str(uuid4()),
            "recorded_at": recorded_at,
            "recorded_timezone_offset_minutes": "480",
            "targets_json": json.dumps([{"region_id": region_id}]),
        },
        files={"file": ("face.jpg", _jpeg(), "image/jpeg")},
    )
    assert created.status_code == 201, created.text
    observation_id = created.json()["observation_id"]
    target_id = created.json()["targets"][0]["target_id"]
    with SessionLocal() as db:
        db.execute(
            update(ObservationTarget)
            .where(ObservationTarget.id == target_id, ObservationTarget.status == "queued")
            .values(status="needs_input", failure_code="all_providers_failed")
        )
        db.commit()
    completed = client.put(
        f"/api/v1/observations/{observation_id}/targets/{target_id}/note",
        headers=headers,
        json={"user_note": note},
    )
    assert completed.status_code == 200, completed.text
    return completed.json()
