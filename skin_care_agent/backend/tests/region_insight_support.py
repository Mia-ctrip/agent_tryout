"""Fixtures for region comparison / trend service tests (SQLite + fake AI)."""

from __future__ import annotations

import io
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from PIL import Image
from sqlalchemy.orm import Session, sessionmaker

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.region_event import RegionEvent
from app.models.user import User
from app.services.ai_gateway.gateway import AIGateway
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.routes import ModelBinding, ModelRoute
from app.services.ai_gateway.types import Capability, UnifiedRequest, UnifiedResponse
from tests.sqlite_support import sqlite_session_factory


START = date(2026, 9, 1)
FACTS = {
    "main_locations": ["中央偏左"],
    "estimated_amount": "约 3 处",
    "distribution": "集中",
    "coverage": "较小",
    "daily_appearance": ["浅红隆起"],
    "unknowns": [],
    "summary": "中央偏左约 3 处浅红隆起。",
}
CHIN_META = {
    "regions": [
        {
            "region_id": "chin",
            "points": [
                {"x": 0.35, "y": 0.8}, {"x": 0.65, "y": 0.8},
                {"x": 0.65, "y": 0.95}, {"x": 0.35, "y": 0.95},
            ],
        }
    ]
}


def jpeg_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (400, 500), (180, 140, 120)).save(buffer, format="JPEG")
    return buffer.getvalue()


class FakeStorage:
    def __init__(self) -> None:
        self.reads: list[str] = []

    def get(self, key: str) -> bytes:
        self.reads.append(key)
        return jpeg_bytes()


class ScriptedProvider(Provider):
    """Returns queued overrides first, then the request's own mock_json."""

    name = "glm"
    capabilities = {Capability.TEXT, Capability.VISION, Capability.JSON_MODE}

    def __init__(self, scripted: list[Callable[[dict[str, Any]], Any]] | None = None) -> None:
        self.scripted = list(scripted or [])
        self.requests: list[UnifiedRequest] = []

    async def invoke(self, model: str, req: UnifiedRequest, timeout_s: float) -> UnifiedResponse:
        self.requests.append(req)
        valid = req.extra["mock_json"]
        payload = self.scripted.pop(0)(json.loads(json.dumps(valid))) if self.scripted else valid
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        return UnifiedResponse(text=text, provider=self.name, model=model)


def gateway_for(provider: Provider) -> AIGateway:
    return AIGateway(
        providers={"glm": provider},
        routes={
            "vision_analyze": ModelRoute(
                task="vision_analyze",
                chain=(ModelBinding("glm", "glm-4.6v"),),
                requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
                max_retries_per_node=0,
            )
        },
    )


@dataclass
class World:
    factory: sessionmaker[Session]
    events: dict[str, int] = field(default_factory=dict)
    _next: int = 0

    def session(self) -> Session:
        return self.factory()

    def event(self, name: str, *, user_id: int = 7, region_id: str = "chin") -> int:
        with self.factory() as db:
            if db.get(User, user_id) is None:
                db.add(User(id=user_id))
                db.flush()
            event = RegionEvent(
                user_id=user_id,
                region_id=region_id,
                status="current",
                started_local_date=START,
                last_valid_local_date=START,
            )
            db.add(event)
            db.commit()
            self.events[name] = event.id
            return event.id

    def timepoint(
        self,
        event_name: str,
        day: int,
        *,
        hour: int = 8,
        user_id: int = 7,
        region_id: str = "chin",
        facts: dict[str, Any] | None = FACTS,
        result_source: str = "photo_analysis",
        user_note: str | None = None,
        status: str = "completed",
        with_photo: bool = True,
        quality_meta: dict[str, Any] | None = CHIN_META,
    ) -> int:
        self._next += 1
        local = START + timedelta(days=day)
        with self.factory() as db:
            photo_id = None
            if with_photo:
                photo = Photo(
                    user_id=user_id,
                    storage_key=f"observations/{user_id}/{self._next}.jpg",
                    mime_type="image/jpeg",
                    size_bytes=1000,
                    width=400,
                    height=500,
                    quality_meta=quality_meta,
                )
                db.add(photo)
                db.flush()
                photo_id = photo.id
            record = ObservationRecord(
                user_id=user_id,
                client_request_id=uuid.uuid4(),
                recorded_at=datetime(local.year, local.month, local.day, hour, tzinfo=timezone.utc),
                recorded_timezone_offset_minutes=0,
                recorded_local_date=local,
                photo_id=photo_id,
                status="saved",
            )
            db.add(record)
            db.flush()
            target = ObservationTarget(
                record_id=record.id,
                user_id=user_id,
                scope_type="region",
                region_id=region_id,
                region_event_id=self.events[event_name],
                status=status,
                result_source=result_source,
                facts=facts,
                user_note=user_note,
            )
            db.add(target)
            db.commit()
            return target.id


def make_world() -> World:
    return World(factory=sqlite_session_factory())
