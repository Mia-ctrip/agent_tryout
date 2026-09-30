from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.main import app
from app.models.ai_call_log import AICallLog
from app.models.region_insight import RegionInsight
from app.services.region_comparison_service import ensure_comparison, run_comparison
from tests.region_insight_support import (
    FakeStorage,
    ScriptedProvider,
    gateway_for,
    make_world,
)


@pytest.fixture
def world():
    return make_world()


@pytest.fixture
def ai(monkeypatch):
    storage = FakeStorage()
    provider = ScriptedProvider()
    monkeypatch.setattr("app.services.region_insight_service.get_storage", lambda: storage)
    monkeypatch.setattr(
        "app.services.region_insight_ai.get_gateway", lambda: gateway_for(provider)
    )
    return SimpleNamespace(storage=storage, provider=provider)


@pytest.fixture
def client(world, monkeypatch):
    scheduled: list[tuple[int, int]] = []

    async def record(insight_id: int, attempt: int) -> None:
        scheduled.append((insight_id, attempt))

    monkeypatch.setattr("app.api.region_events.run_comparison", record)

    def db_override():
        with world.session() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    try:
        yield SimpleNamespace(http=TestClient(app), scheduled=scheduled)
    finally:
        app.dependency_overrides.clear()


def _pair(world):
    event_id = world.event("e")
    first = world.timepoint("e", 0)
    same_day = world.timepoint("e", 0, hour=20)
    later = world.timepoint("e", 6)
    return event_id, first, same_day, later


def _ensure(world, event_id, earlier, later):
    with world.session() as db:
        return ensure_comparison(
            db, user_id=7, event_id=event_id, earlier_target_id=earlier, later_target_id=later
        )


def _row(world, insight_id) -> RegionInsight:
    with world.session() as db:
        return db.get(RegionInsight, insight_id)


# ------------------------------------------------------------------ API


def test_other_users_event_is_not_found(world, client) -> None:
    other = world.event("other", user_id=8)
    a = world.timepoint("other", 0, user_id=8)
    b = world.timepoint("other", 5, user_id=8)
    response = client.http.post(
        f"/api/v1/region-events/{other}/comparisons",
        json={"earlier_target_id": a, "later_target_id": b},
    )
    assert response.status_code == 404
    assert client.scheduled == []


@pytest.mark.parametrize(
    ("pick", "code"),
    [
        (lambda ids: (ids[0], ids[1]), "same_local_date"),
        (lambda ids: (ids[2], ids[0]), "pair_not_chronological"),
        (lambda ids: (ids[0], ids[3]), "timepoint_not_in_event"),
    ],
)
def test_invalid_pairs_are_rejected(world, client, pick, code) -> None:
    event_id, first, same_day, later = _pair(world)
    world.event("elsewhere", region_id="forehead")
    foreign = world.timepoint("elsewhere", 3, region_id="forehead")
    earlier, chosen_later = pick((first, same_day, later, foreign))
    response = client.http.post(
        f"/api/v1/region-events/{event_id}/comparisons",
        json={"earlier_target_id": earlier, "later_target_id": chosen_later},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == code


def test_repeated_post_schedules_once_and_returns_same_row(world, client) -> None:
    event_id, first, _, later = _pair(world)
    body = {"earlier_target_id": first, "later_target_id": later}

    created = client.http.post(f"/api/v1/region-events/{event_id}/comparisons", json=body)
    again = client.http.post(f"/api/v1/region-events/{event_id}/comparisons", json=body)

    assert created.status_code == 202 and again.status_code == 200
    assert created.json()["comparison_id"] == again.json()["comparison_id"]
    assert created.json()["status"] == "processing"
    assert [item["timepoint_id"] for item in created.json()["timepoints"]] == ["T1", "T2"]
    assert len(client.scheduled) == 1
    fetched = client.http.get(
        f"/api/v1/region-events/{event_id}/comparisons/{created.json()['comparison_id']}"
    )
    assert fetched.status_code == 200


def test_timepoints_without_photo_or_validity_cannot_be_compared(world) -> None:
    event_id = world.event("e")
    first = world.timepoint("e", 0)
    no_photo = world.timepoint("e", 3, with_photo=False, result_source="user_record",
                               facts=None, user_note="今天有点红")
    pending = world.timepoint("e", 5, status="needs_input", facts=None, result_source=None)
    for later in (no_photo, pending):
        with pytest.raises(Exception) as caught:
            _ensure(world, event_id, first, later)
        assert getattr(caught.value, "code", None) == "timepoint_not_in_event"


# ------------------------------------------------------------------ worker


async def test_worker_sends_two_region_crops_and_publishes(world, ai) -> None:
    event_id = world.event("e")
    first = world.timepoint("e", 0, user_note="用了某某精华，感觉有点刺痛")
    later = world.timepoint("e", 6, quality_meta=None)
    claim = _ensure(world, event_id, first, later)

    assert await run_comparison(claim.insight.id, claim.insight.attempt, world.factory) is True

    row = _row(world, claim.insight.id)
    assert row.status == "completed"
    assert row.result["headline"]
    assert [item["crop"] for item in row.timepoint_map] == ["region_crop", "full_photo"]
    assert len(ai.provider.requests) == 1
    request = ai.provider.requests[0]
    assert len(request.messages[1].image_urls) == 2
    text = "\n".join(message.content for message in request.messages)
    assert "某某精华" not in text and "刺痛" not in text
    assert "中央偏左约 3 处" not in text  # stored single-photo summaries are not sent
    assert len(ai.storage.reads) == 2

    cached = _ensure(world, event_id, first, later)
    assert cached.schedule is False and cached.insight.status == "completed"


async def test_unsafe_output_retries_once_then_publishes(world, ai) -> None:
    ai.provider.scripted = [lambda valid: {**valid, "headline": "局部偏红明显改善"}]
    event_id, first, _, later = _pair(world)
    claim = _ensure(world, event_id, first, later)

    await run_comparison(claim.insight.id, claim.insight.attempt, world.factory)

    assert _row(world, claim.insight.id).status == "completed"
    assert len(ai.provider.requests) == 2
    assert ai.provider.requests[1].messages[-1].content.startswith("上一个结果未通过")
    with world.session() as db:
        statuses = db.scalars(
            select(AICallLog.status).where(AICallLog.kind == "region_comparison")
            .order_by(AICallLog.attempt_seq)
        ).all()
    assert statuses == ["unsafe_output", "success"]


async def test_two_failures_mark_failed_and_post_can_retry(world, ai) -> None:
    bad = lambda valid: {**valid, "summary": "B 中这颗痘痘已经消失。"}  # noqa: E731
    ai.provider.scripted = [bad, bad]
    event_id, first, _, later = _pair(world)
    claim = _ensure(world, event_id, first, later)

    await run_comparison(claim.insight.id, claim.insight.attempt, world.factory)
    failed = _row(world, claim.insight.id)
    assert failed.status == "failed" and failed.failure_code == "identity_tracking"
    assert failed.result is None

    retry = _ensure(world, event_id, first, later)
    assert retry.schedule is True and retry.insight.id == claim.insight.id
    assert retry.insight.attempt == 2
    await run_comparison(retry.insight.id, retry.insight.attempt, world.factory)
    assert _row(world, claim.insight.id).status == "completed"


async def test_insufficient_comparability_is_published_as_degraded(world, ai) -> None:
    def insufficient(valid):
        valid["comparison_reliability"]["level"] = "不足"
        valid["overall_change"] = "无法可靠判断"
        valid["headline"] = ""
        return valid

    ai.provider.scripted = [insufficient]
    event_id, first, _, later = _pair(world)
    claim = _ensure(world, event_id, first, later)
    await run_comparison(claim.insight.id, claim.insight.attempt, world.factory)

    row = _row(world, claim.insight.id)
    assert row.status == "degraded"
    assert row.result["headline"] == ""


def test_fresh_processing_is_kept_and_stale_processing_is_reclaimed(world) -> None:
    event_id, first, _, later = _pair(world)
    claim = _ensure(world, event_id, first, later)
    assert _ensure(world, event_id, first, later).schedule is False

    with world.session() as db:
        row = db.get(RegionInsight, claim.insight.id)
        row.processing_started_at = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
        db.commit()
    reclaimed = _ensure(world, event_id, first, later)
    assert reclaimed.schedule is True and reclaimed.insight.attempt == 2


async def test_late_result_from_reclaimed_attempt_is_discarded(world, ai) -> None:
    event_id, first, _, later = _pair(world)
    claim = _ensure(world, event_id, first, later)
    with world.session() as db:
        row = db.get(RegionInsight, claim.insight.id)
        row.processing_started_at = datetime.now(tz=timezone.utc) - timedelta(minutes=10)
        db.commit()
    _ensure(world, event_id, first, later)  # attempt 2 now owns the row

    assert await run_comparison(claim.insight.id, 1, world.factory) is False
    assert _row(world, claim.insight.id).status == "processing"
    assert ai.provider.requests == []
