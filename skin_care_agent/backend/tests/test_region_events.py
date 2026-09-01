from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.region_event import RegionEvent
from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.main import app
from app.schemas.observation import RegionTargetCreate
from app.services.region_event_service import (
    activate_valid_target_event,
    preview_event_assignment,
    preview_region_event_assignments,
    reserve_events_for_targets,
)


def _index(table, name: str):
    return next(index for index in table.indexes if index.name == name)


def _event(*, status: str = "current", last_on: date | None = date(2026, 7, 1)):
    event = RegionEvent(
        user_id=7,
        region_id="forehead",
        status=status,
        started_local_date=date(2026, 7, 1),
        last_valid_local_date=last_on,
    )
    event.id = 41
    return event


@pytest.mark.parametrize(
    ("days", "action"),
    [(0, "auto_continue"), (29, "auto_continue"), (30, "choice_required")],
)
def test_event_preview_uses_device_local_calendar_days(days: int, action: str) -> None:
    preview = preview_event_assignment(
        "forehead",
        date(2026, 7, 1) + timedelta(days=days),
        _event(),
    )
    assert preview.action == action
    assert preview.days_since_last == days


def test_pending_event_and_missing_event_have_deterministic_actions() -> None:
    recorded_on = date(2026, 8, 1)
    assert preview_event_assignment("forehead", recorded_on, _event(status="pending")).action == (
        "auto_continue"
    )
    assert preview_event_assignment("forehead", recorded_on, None).action == "auto_new"


def test_pending_reservation_takes_priority_when_current_also_exists() -> None:
    current = _event(status="current", last_on=date(2026, 7, 1))
    pending = _event(status="pending", last_on=None)
    pending.id = 42
    db = _EventDB([pending, current])

    preview = preview_region_event_assignments(
        db,
        user_id=7,
        region_ids=["forehead"],
        recorded_local_date=date(2026, 8, 15),
    )[0]

    assert preview.action == "auto_continue"
    assert preview.event_id == pending.id


def test_event_model_allows_only_one_current_and_one_pending_per_user_region() -> None:
    table = RegionEvent.__table__
    current = _index(table, "uq_region_events_user_region_current")
    pending = _index(table, "uq_region_events_user_region_pending")
    assert current.unique is True
    assert pending.unique is True
    assert [column.name for column in current.columns] == ["user_id", "region_id"]
    assert [column.name for column in pending.columns] == ["user_id", "region_id"]


def test_event_and_target_models_enforce_fixed_status_region_and_membership() -> None:
    event_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in RegionEvent.__table__.constraints
        if constraint.name
    }
    assert "pending" in event_checks["ck_region_events_status"]
    assert "current" in event_checks["ck_region_events_status"]
    assert "ended" in event_checks["ck_region_events_status"]
    assert "left_face" in event_checks["ck_region_events_region_id"]
    assert "region_event_id" in ObservationTarget.__table__.c


class _EventDB:
    def __init__(self, rows: list[Any] | None = None) -> None:
        self.rows = rows or []
        self.commits = 0
        self._next_id = 100
        self.execute_rows: list[Any] = []

    def scalars(self, statement: Any) -> SimpleNamespace:
        entity = statement.column_descriptions[0].get("entity")
        values = [row for row in self.rows if isinstance(row, entity)]
        return SimpleNamespace(all=lambda: values)

    def scalar(self, _statement: Any) -> int:
        return 7

    def add(self, row: Any) -> None:
        self.rows.append(row)

    def flush(self) -> None:
        for row in self.rows:
            if getattr(row, "id", None) is None:
                row.id = self._next_id
                self._next_id += 1

    def get(self, model: Any, row_id: int) -> Any:
        return next(
            (row for row in self.rows if isinstance(row, model) and row.id == row_id),
            None,
        )

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _row: Any) -> None:
        return None

    def execute(self, _statement: Any) -> SimpleNamespace:
        return SimpleNamespace(all=lambda: self.execute_rows)


def _effective_target(event_id: int, recorded_on: date) -> tuple[ObservationRecord, ObservationTarget]:
    record = ObservationRecord(
        user_id=7,
        client_request_id="11111111-1111-4111-8111-111111111111",
        recorded_at=date(2026, 8, 1),
        recorded_local_date=recorded_on,
        status="saved",
    )
    record.id = 51
    target = ObservationTarget(
        record_id=51,
        user_id=7,
        scope_type="region",
        region_id="forehead",
        region_event_id=event_id,
        status="completed",
        result_source="user_record",
        user_note="额头有颗粒感",
    )
    target.id = 61
    return record, target


def test_first_effective_target_activates_reserved_pending_event() -> None:
    db = _EventDB()
    events = reserve_events_for_targets(
        db,
        user_id=7,
        recorded_local_date=date(2026, 8, 1),
        target_inputs=[RegionTargetCreate(region_id="forehead", user_note="记录")],
    )
    event = events["forehead"]
    record, target = _effective_target(event.id, date(2026, 8, 1))
    db.rows.extend([record, target])

    assert event.status == "pending"
    assert activate_valid_target_event(db, target.id) is True
    assert event.status == "current"
    assert event.last_valid_local_date == date(2026, 8, 1)


def test_start_new_at_30_days_replaces_current_once() -> None:
    previous = _event(last_on=date(2026, 7, 1))
    db = _EventDB([previous])
    events = reserve_events_for_targets(
        db,
        user_id=7,
        recorded_local_date=date(2026, 7, 31),
        target_inputs=[
            RegionTargetCreate(
                region_id="forehead",
                user_note="记录",
                event_decision="start_new",
            )
        ],
    )
    pending = events["forehead"]
    record, target = _effective_target(pending.id, date(2026, 7, 31))
    db.rows.extend([record, target])

    assert activate_valid_target_event(db, target.id) is True
    assert activate_valid_target_event(db, target.id) is True
    assert previous.status == "ended"
    assert previous.end_reason == "replaced"
    assert pending.status == "current"
    assert [event.status for event in db.rows if isinstance(event, RegionEvent)].count(
        "current"
    ) == 1


def test_region_event_preview_and_list_routes_are_authenticated_and_ordered() -> None:
    event = _event(last_on=date(2026, 7, 1))
    db = _EventDB([event])
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            preview = client.post(
                "/api/v1/region-events/preview",
                json={
                    "region_ids": ["forehead"],
                    "recorded_at": "2026-07-31T08:00:00Z",
                    "recorded_timezone_offset_minutes": 0,
                },
            )
            listing = client.get("/api/v1/region-events?status=current")
    finally:
        app.dependency_overrides.clear()

    assert preview.status_code == 200
    assert preview.json()[0]["action"] == "choice_required"
    assert listing.status_code == 200
    assert listing.json()[0]["event_id"] == event.id


@pytest.mark.parametrize("recorded_offset", [480, None])
def test_event_detail_contains_only_effective_owned_timepoints(
    recorded_offset: int | None,
) -> None:
    event = _event(last_on=date(2026, 8, 1))
    record, completed = _effective_target(event.id, date(2026, 8, 1))
    record.recorded_timezone_offset_minutes = recorded_offset
    record.created_at = datetime(2026, 8, 1, tzinfo=timezone.utc)
    pending = ObservationTarget(
        record_id=record.id,
        user_id=7,
        scope_type="region",
        region_id="forehead",
        region_event_id=event.id,
        status="needs_input",
    )
    pending.id = 62
    db = _EventDB([event, record, completed, pending])
    db.execute_rows = [(completed, record, None), (pending, record, None)]
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            response = client.get(f"/api/v1/region-events/{event.id}")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert [row["target"]["target_id"] for row in response.json()["timepoints"]] == [
        completed.id
    ]
    assert (
        response.json()["timepoints"][0]["recorded_timezone_offset_minutes"]
        == recorded_offset
    )


def test_region_event_is_hidden_from_another_user() -> None:
    event = _event(last_on=date(2026, 8, 1))
    db = _EventDB([event])
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=8)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            detail = client.get(f"/api/v1/region-events/{event.id}")
            ended = client.post(
                f"/api/v1/region-events/{event.id}/end",
                json={"ended_at": "2026-08-01T08:00:00Z", "timezone_offset_minutes": 0},
            )
    finally:
        app.dependency_overrides.clear()

    assert detail.status_code == 404
    assert ended.status_code == 404
