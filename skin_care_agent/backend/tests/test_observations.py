from __future__ import annotations

import io
import json
from contextlib import contextmanager
from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Any, Iterator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.exc import IntegrityError

from app.api import observations
from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.main import app
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.region_event import RegionEvent
from app.services import observation_service
from app.services.full_face_prompt import FULL_FACE_OBSERVATION_MOCK


def _image_bytes(size: tuple[int, int] = (4, 4), image_format: str = "JPEG") -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color=(128, 128, 128)).save(output, format=image_format)
    return output.getvalue()


class _FakeStorage:
    def __init__(self, *, fail_put: bool = False) -> None:
        self.fail_put = fail_put
        self.puts: list[tuple[str, bytes, str]] = []
        self.deleted: list[str] = []

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.puts.append((key, data, content_type))
        if self.fail_put:
            raise OSError("storage unavailable")

    def delete(self, key: str) -> None:
        self.deleted.append(key)

    def signed_url(self, key: str) -> SimpleNamespace:
        return SimpleNamespace(
            url=f"http://test/{key}",
            expires_at=datetime(2026, 8, 21, tzinfo=timezone.utc),
        )


class _FakeDB:
    def __init__(self, *, commit_error: Exception | None = None) -> None:
        self.rows: list[Any] = []
        self.commit_error = commit_error
        self.commit_count = 0
        self.rollback_count = 0
        self._next_id = 1

    def scalar(self, statement: Any) -> Any:
        entity = statement.column_descriptions[0].get("entity")
        if entity is ObservationRecord:
            return next((row for row in self.rows if isinstance(row, ObservationRecord)), None)
        if entity is ObservationTarget:
            return next((row for row in self.rows if isinstance(row, ObservationTarget)), None)
        return None

    def scalars(self, statement: Any) -> SimpleNamespace:
        entity = statement.column_descriptions[0].get("entity")
        rows = [row for row in self.rows if isinstance(row, entity)] if entity else []
        return SimpleNamespace(all=lambda: rows)

    def add(self, row: Any) -> None:
        self.rows.append(row)

    def flush(self) -> None:
        for row in self.rows:
            if getattr(row, "id", None) is None:
                row.id = self._next_id
                self._next_id += 1

    def commit(self) -> None:
        self.commit_count += 1
        if self.commit_error is not None:
            raise self.commit_error

    def rollback(self) -> None:
        self.rollback_count += 1

    def refresh(self, row: Any) -> None:
        if getattr(row, "created_at", None) is None:
            row.created_at = datetime(2026, 8, 21, tzinfo=timezone.utc)

    def get(self, model: Any, row_id: int) -> Any:
        return next(
            (row for row in self.rows if isinstance(row, model) and row.id == row_id),
            None,
        )


class _RaceDB(_FakeDB):
    def __init__(
        self,
        existing_record: ObservationRecord,
        existing_target: ObservationTarget,
        existing_photo: Photo,
    ) -> None:
        super().__init__(commit_error=IntegrityError("insert", {}, Exception("duplicate")))
        self.existing_record = existing_record
        self.existing_target = existing_target
        self.existing_photo = existing_photo
        self.race_visible = False

    def scalar(self, statement: Any) -> Any:
        if not self.race_visible:
            return None
        entity = statement.column_descriptions[0].get("entity")
        if entity is ObservationRecord:
            return self.existing_record
        if entity is ObservationTarget:
            return self.existing_target
        return None

    def rollback(self) -> None:
        super().rollback()
        self.race_visible = True

    def scalars(self, statement: Any) -> SimpleNamespace:
        entity = statement.column_descriptions[0].get("entity")
        if self.race_visible and entity is ObservationTarget:
            return SimpleNamespace(all=lambda: [self.existing_target])
        return super().scalars(statement)

    def get(self, model: Any, row_id: int) -> Any:
        if model is Photo and row_id == self.existing_photo.id:
            return self.existing_photo
        return super().get(model, row_id)


class _QueryResult:
    def __init__(self, rows: list[tuple[ObservationRecord, ObservationTarget, Photo | None]]) -> None:
        self.rows = rows

    def all(self) -> list[tuple[ObservationRecord, ObservationTarget, Photo | None]]:
        return self.rows

    def first(self) -> tuple[ObservationRecord, ObservationTarget, Photo | None] | None:
        return self.rows[0] if self.rows else None


class _HistoryDB(_FakeDB):
    def __init__(self, rows: list[tuple[ObservationRecord, ObservationTarget, Photo | None]]) -> None:
        super().__init__()
        self.history_rows = rows

    def execute(self, _statement: Any) -> _QueryResult:
        return _QueryResult(self.history_rows)


def _history_row(
    observation_id: int,
    *,
    user_id: int = 7,
    target_status: str = "completed",
    with_photo: bool = True,
) -> tuple[ObservationRecord, ObservationTarget, Photo | None]:
    now = datetime(2026, 8, 20 + observation_id, tzinfo=timezone.utc)
    photo = None
    if with_photo:
        photo = Photo(
            user_id=user_id,
            storage_key=f"observations/{user_id}/{observation_id}.jpg",
            mime_type="image/jpeg",
            size_bytes=10,
            width=4,
            height=4,
        )
        photo.id = 100 + observation_id
    record = ObservationRecord(
        user_id=user_id,
        client_request_id=UUID(f"00000000-0000-4000-8000-{observation_id:012d}"),
        recorded_at=now,
        photo_id=photo.id if photo else None,
        user_note=None,
        status="saved",
    )
    record.id = observation_id
    record.created_at = now
    target = ObservationTarget(
        record_id=observation_id,
        user_id=user_id,
        scope_type="full_face",
        status=target_status,
        result_source="photo_analysis" if target_status == "completed" else None,
        facts=(dict(FULL_FACE_OBSERVATION_MOCK) if target_status == "completed" else None),
        failure_code="invalid_json" if target_status == "needs_input" else None,
        trace_id="audit-trace",
    )
    target.id = 200 + observation_id
    return record, target, photo


@contextmanager
def _client(
    monkeypatch: pytest.MonkeyPatch,
    db: _FakeDB,
    storage: _FakeStorage,
    worker: Any | None = None,
) -> Iterator[TestClient]:
    async def no_op_worker(_target_id: int) -> None:
        return None

    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    app.dependency_overrides[get_db] = lambda: db
    monkeypatch.setattr(observation_service, "get_storage", lambda: storage)
    monkeypatch.setattr(
        observations,
        "run_observation_target",
        worker or no_op_worker,
        raising=False,
    )
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


def _form(request_id: str = "11111111-1111-4111-8111-111111111111") -> dict[str, str]:
    return _region_form([{"region_id": "forehead"}], request_id)


def _region_form(
    targets: list[dict[str, str | None]],
    request_id: str = "55555555-5555-4555-8555-555555555555",
) -> dict[str, str]:
    return {
        "client_request_id": request_id,
        "recorded_at": "2026-08-21T08:00:00Z",
        "recorded_timezone_offset_minutes": "480",
        "targets_json": json.dumps(targets, ensure_ascii=False),
    }


def test_region_photo_creation_requires_confirmed_targets_and_returns_catalog_order(
    monkeypatch,
) -> None:
    db, storage = _FakeDB(), _FakeStorage()
    with _client(monkeypatch, db, storage) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form(
                [
                    {"region_id": "chin"},
                    {"region_id": "forehead"},
                ]
            ),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert response.status_code == 201
    assert "target" not in response.json()
    assert [target["region_id"] for target in response.json()["targets"]] == [
        "forehead",
        "chin",
    ]
    assert all(target["scope_type"] == "region" for target in response.json()["targets"])


def test_region_photo_creation_rejects_an_empty_target_list(monkeypatch) -> None:
    with _client(monkeypatch, _FakeDB(), _FakeStorage()) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form([]),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert response.status_code == 422


def test_region_creation_requires_current_30_day_event_decision(monkeypatch) -> None:
    event = RegionEvent(
        user_id=7,
        region_id="forehead",
        status="current",
        started_local_date=date(2026, 7, 1),
        last_valid_local_date=date(2026, 7, 22),
    )
    event.id = 91
    db, storage = _FakeDB(), _FakeStorage()
    db.rows.append(event)
    with _client(monkeypatch, db, storage) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form([{"region_id": "forehead"}]),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert response.status_code == 409
    assert storage.deleted == [storage.puts[0][0]]


def test_photo_creation_saves_before_ai_and_accepts_low_quality_image(monkeypatch) -> None:
    db, storage = _FakeDB(), _FakeStorage()
    with _client(monkeypatch, db, storage) as client:
        response = client.post(
            "/api/v1/observations",
            data=_form(),
            files={"file": ("face.jpg", _image_bytes((1, 1)), "image/jpeg")},
        )

    assert response.status_code == 201
    assert response.json()["status"] == "saved"
    assert response.json()["targets"][0]["status"] == "queued"
    assert response.json()["targets"][0]["scope_type"] == "region"
    photo = next(row for row in db.rows if isinstance(row, Photo))
    assert photo.check_in_id is None
    assert photo.view_type is None
    assert photo.quality_status is None
    assert photo.processed_storage_key is None


def test_text_creation_trims_note_and_completes_from_user_record(monkeypatch) -> None:
    db, storage = _FakeDB(), _FakeStorage()
    with _client(monkeypatch, db, storage) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form(
                [{"region_id": "left_face", "user_note": "  今天两颊有些泛红  "}]
            ),
        )

    assert response.status_code == 201
    assert response.json()["targets"][0]["user_note"] == "今天两颊有些泛红"
    assert response.json()["targets"][0]["status"] == "completed"
    assert response.json()["targets"][0]["result_source"] == "user_record"
    assert response.json()["photo"] is None
    assert storage.puts == []


def test_only_new_photo_observation_schedules_worker_after_commit(monkeypatch) -> None:
    db, storage = _FakeDB(), _FakeStorage()
    calls: list[tuple[int, int]] = []

    async def worker(target_id: int) -> None:
        calls.append((target_id, db.commit_count))

    with _client(monkeypatch, db, storage, worker) as client:
        photo_response = client.post(
            "/api/v1/observations",
            data=_region_form([{"region_id": "nose_area"}, {"region_id": "chin"}]),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert photo_response.status_code == 201
    assert calls == [
        (target["target_id"], 1) for target in photo_response.json()["targets"]
    ]


def test_text_observation_does_not_schedule_worker(monkeypatch) -> None:
    calls: list[int] = []

    async def worker(target_id: int) -> None:
        calls.append(target_id)

    with _client(monkeypatch, _FakeDB(), _FakeStorage(), worker) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form([{"region_id": "forehead", "user_note": "记录"}]),
        )

    assert response.status_code == 201
    assert calls == []


def test_creation_requires_a_photo_or_non_blank_note(monkeypatch) -> None:
    with _client(monkeypatch, _FakeDB(), _FakeStorage()) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form([{"region_id": "forehead", "user_note": "   "}]),
        )

    assert response.status_code == 422


def test_duplicate_request_returns_existing_record_and_stores_once(monkeypatch) -> None:
    db, storage = _FakeDB(), _FakeStorage()
    with _client(monkeypatch, db, storage) as client:
        first = client.post(
            "/api/v1/observations",
            data=_form(),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )
        second = client.post(
            "/api/v1/observations",
            data=_form(),
            files={"file": ("broken.jpg", b"not an image", "image/jpeg")},
        )

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["observation_id"] == first.json()["observation_id"]
    assert len(storage.puts) == 1


def test_integrity_race_deletes_only_new_object_and_returns_existing(monkeypatch) -> None:
    now = datetime(2026, 8, 21, tzinfo=timezone.utc)
    request_id = UUID("33333333-3333-4333-8333-333333333333")
    photo = Photo(
        user_id=7,
        storage_key="observations/7/existing.jpg",
        mime_type="image/jpeg",
        size_bytes=10,
        width=4,
        height=4,
    )
    photo.id = 31
    record = ObservationRecord(
        user_id=7,
        client_request_id=request_id,
        recorded_at=now,
        photo_id=31,
        status="saved",
    )
    record.id = 41
    record.created_at = now
    target = ObservationTarget(
        record_id=41,
        user_id=7,
        scope_type="full_face",
        status="queued",
    )
    target.id = 51
    db = _RaceDB(record, target, photo)
    storage = _FakeStorage()

    with _client(monkeypatch, db, storage) as client:
        response = client.post(
            "/api/v1/observations",
            data=_form(str(request_id)),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert response.status_code == 200
    assert response.json()["observation_id"] == 41
    assert storage.deleted == [storage.puts[0][0]]


@pytest.mark.parametrize(
    ("payload", "mime_type", "expected_status"),
    [(b"", "image/jpeg", 400), (b"not an image", "image/jpeg", 400), (_image_bytes(), "text/plain", 415)],
)
def test_photo_validation_rejects_empty_unreadable_or_unsupported_files(
    monkeypatch, payload: bytes, mime_type: str, expected_status: int
) -> None:
    with _client(monkeypatch, _FakeDB(), _FakeStorage()) as client:
        response = client.post(
            "/api/v1/observations",
            data=_form(),
            files={"file": ("face", payload, mime_type)},
        )

    assert response.status_code == expected_status


def test_photo_validation_rejects_oversized_file(monkeypatch) -> None:
    settings = SimpleNamespace(allowed_mime_set={"image/jpeg"}, upload_max_bytes=3)
    monkeypatch.setattr(observation_service, "get_settings", lambda: settings)
    with _client(monkeypatch, _FakeDB(), _FakeStorage()) as client:
        response = client.post(
            "/api/v1/observations",
            data=_form(),
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )

    assert response.status_code == 413


@pytest.mark.parametrize("failure", ["storage", "database"])
def test_creation_failure_rolls_back_database_and_new_object(monkeypatch, failure: str) -> None:
    db = _FakeDB(commit_error=RuntimeError("db unavailable") if failure == "database" else None)
    storage = _FakeStorage(fail_put=failure == "storage")
    with pytest.raises((OSError, RuntimeError)):
        with _client(monkeypatch, db, storage) as client:
            client.post(
                "/api/v1/observations",
                data=_form(),
                files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
            )

    assert db.rollback_count == 1
    assert storage.deleted == [storage.puts[0][0]]


def test_request_uuid_is_preserved_in_record(monkeypatch) -> None:
    request_id = "22222222-2222-4222-8222-222222222222"
    db = _FakeDB()
    with _client(monkeypatch, db, _FakeStorage()) as client:
        response = client.post(
            "/api/v1/observations",
            data=_region_form(
                [{"region_id": "forehead", "user_note": "记录"}], request_id
            ),
        )

    assert response.status_code == 201
    record = next(row for row in db.rows if isinstance(row, ObservationRecord))
    assert record.client_request_id == UUID(request_id)


def test_history_lists_server_rows_newest_first_with_signed_photos(monkeypatch) -> None:
    rows = [_history_row(2), _history_row(1, with_photo=False)]
    with _client(monkeypatch, _HistoryDB(rows), _FakeStorage()) as client:
        response = client.get("/api/v1/observations?limit=100")

    assert response.status_code == 200
    assert [item["observation_id"] for item in response.json()] == [2, 1]
    assert response.json()[0]["photo"]["url"].endswith("observations/7/2.jpg")
    assert response.json()[1]["photo"] is None
    assert response.json()[0]["targets"][0]["scope_type"] == "full_face"


def test_detail_hides_another_users_observation(monkeypatch) -> None:
    with _client(
        monkeypatch,
        _HistoryDB([_history_row(9, user_id=8)]),
        _FakeStorage(),
    ) as client:
        response = client.get("/api/v1/observations/9")

    assert response.status_code == 404
    assert response.json()["detail"] == "observation not found"


@pytest.mark.parametrize("target_status", ["queued", "completed"])
def test_note_fallback_rejects_non_failed_targets(monkeypatch, target_status: str) -> None:
    row = _history_row(9, target_status=target_status)
    with _client(monkeypatch, _HistoryDB([row]), _FakeStorage()) as client:
        response = client.put(
            f"/api/v1/observations/9/targets/{row[1].id}/note",
            json={"user_note": "用户补充"},
        )

    assert response.status_code == 409


def test_note_fallback_trims_text_and_preserves_ai_audit_trace(monkeypatch) -> None:
    record, target, photo = _history_row(9, target_status="needs_input")
    db = _HistoryDB([(record, target, photo)])
    with _client(monkeypatch, db, _FakeStorage()) as client:
        response = client.put(
            f"/api/v1/observations/9/targets/{target.id}/note",
            json={"user_note": "  今天两颊偏红  "},
        )

    assert response.status_code == 200
    assert response.json()["targets"][0]["user_note"] == "今天两颊偏红"
    assert response.json()["targets"][0]["status"] == "completed"
    assert response.json()["targets"][0]["result_source"] == "user_record"
    assert target.failure_code is None
    assert target.trace_id == "audit-trace"
    assert db.commit_count == 1


def test_note_fallback_rejects_blank_text(monkeypatch) -> None:
    with _client(
        monkeypatch,
        _HistoryDB([_history_row(9, target_status="needs_input")]),
        _FakeStorage(),
    ) as client:
        response = client.put(
            "/api/v1/observations/9/targets/209/note", json={"user_note": "  "}
        )

    assert response.status_code == 422
