"""Recovery of AI targets lost to a process restart or redeploy (in-process BackgroundTasks)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.user import User
from app.services import observation_service
from app.services.observation_service import (
    OBSERVATION_STALE_AFTER,
    reclaim_stale_targets,
    stale_target_ids,
)
from tests.sqlite_support import sqlite_session_factory


# 读取路径使用真实当前时间，因此样本时间相对当前时间构造。
NOW = datetime.now(tz=timezone.utc)
OLD = NOW - OBSERVATION_STALE_AFTER - timedelta(minutes=1)
FRESH = NOW - timedelta(minutes=1)


def _target(target_id: int, status: str, *, started: datetime | None, created: datetime | None):
    target = ObservationTarget(
        record_id=1,
        user_id=7,
        scope_type="region",
        region_id="chin",
        status=status,
        processing_started_at=started,
    )
    target.id = target_id
    target.created_at = created
    return target


def test_only_old_processing_or_unclaimed_queued_targets_are_stale() -> None:
    targets = [
        _target(1, "processing", started=OLD, created=OLD),
        _target(2, "processing", started=FRESH, created=OLD),
        _target(3, "queued", started=None, created=OLD),
        _target(4, "queued", started=None, created=FRESH),
        _target(5, "completed", started=OLD, created=OLD),
        _target(6, "needs_input", started=OLD, created=OLD),
        _target(7, "processing", started=None, created=None),
    ]

    assert stale_target_ids(targets, now=NOW, has_photo=True) == [1, 3]
    assert stale_target_ids(targets, now=NOW, has_photo=False) == []


@pytest.fixture
def seeded():
    factory = sqlite_session_factory()
    with factory() as db:
        db.add_all([User(id=7), User(id=8)])
        db.flush()
        ids: dict[str, int] = {}
        # SQLite 忽略 PostgreSQL 部分唯一索引，record_id 会被视为唯一，因此每个目标单独一条记录。
        for owner, key in ((7, "own"), (8, "other")):
            for region_id, status, started in (
                ("chin", "processing", OLD),
                ("forehead", "processing", FRESH),
                ("nose_area", "completed", OLD),
            ):
                photo = Photo(
                    user_id=owner,
                    storage_key=f"observations/{owner}/{region_id}.jpg",
                    mime_type="image/jpeg",
                    size_bytes=10,
                )
                db.add(photo)
                db.flush()
                record = ObservationRecord(
                    user_id=owner,
                    client_request_id=uuid.uuid4(),
                    recorded_at=OLD,
                    photo_id=photo.id,
                    status="saved",
                )
                db.add(record)
                db.flush()
                ids[f"{key}_{region_id}_record"] = record.id
                target = ObservationTarget(
                    record_id=record.id,
                    user_id=owner,
                    scope_type="region",
                    region_id=region_id,
                    status=status,
                    processing_started_at=started,
                )
                db.add(target)
                db.flush()
                ids[f"{key}_{region_id}"] = target.id
        db.commit()
    return factory, ids


def test_reclaim_requeues_only_the_owners_stale_processing_target(seeded) -> None:
    factory, ids = seeded
    candidates = [ids["own_chin"], ids["own_forehead"], ids["own_nose_area"], ids["other_chin"]]
    with factory() as db:
        reclaimed = reclaim_stale_targets(db, user_id=7, target_ids=candidates, now=NOW)

    assert reclaimed == [ids["own_chin"]]
    with factory() as db:
        assert db.get(ObservationTarget, ids["own_chin"]).status == "queued"
        assert db.get(ObservationTarget, ids["own_chin"]).processing_started_at is None
        assert db.get(ObservationTarget, ids["own_forehead"]).status == "processing"
        assert db.get(ObservationTarget, ids["other_chin"]).status == "processing"


class _Storage:
    def signed_url(self, key: str) -> SimpleNamespace:
        return SimpleNamespace(url=f"http://test/{key}", expires_at=NOW)


def test_reading_an_observation_reschedules_its_stale_target(seeded, monkeypatch) -> None:
    factory, ids = seeded
    monkeypatch.setattr(observation_service, "get_storage", lambda: _Storage())
    monkeypatch.setattr(observation_service, "load_life_context_ids", lambda _db, _id: [])
    scheduled: list[int] = []
    with factory() as db:
        stale = observation_service.get_observation_out(
            db,
            user_id=7,
            observation_id=ids["own_chin_record"],
            schedule=scheduled.append,
        )
        fresh = observation_service.get_observation_out(
            db,
            user_id=7,
            observation_id=ids["own_forehead_record"],
            schedule=scheduled.append,
        )

    assert scheduled == [ids["own_chin"]]
    assert stale.targets[0].status == "queued"
    assert fresh.targets[0].status == "processing"


def test_reading_without_a_scheduler_does_not_touch_targets(seeded) -> None:
    factory, ids = seeded
    with factory() as db:
        observation_service._recover_stale(
            db,
            user_id=7,
            bundles=[([db.get(ObservationTarget, ids["own_chin"])], object())],
            schedule=None,
        )
    with factory() as db:
        assert db.get(ObservationTarget, ids["own_chin"]).status == "processing"
