from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_app_user
from app.db.session import get_db
from app.main import app
from app.models.region_insight import RegionInsight
from app.services.region_trend_service import get_region_insights, refresh_trend, run_trend
from tests.region_insight_support import FakeStorage, ScriptedProvider, gateway_for, make_world


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


def _insights(world, event_id):
    with world.session() as db:
        return get_region_insights(db, user_id=7, event_id=event_id)


def _refresh(world, event_id):
    with world.session() as db:
        return refresh_trend(db, user_id=7, event_id=event_id)


async def _generate(world, event_id):
    _, claim = _refresh(world, event_id)
    if claim.schedule:
        await run_trend(claim.insight.id, claim.insight.attempt, world.factory)
    return claim


def _row(world, insight_id) -> RegionInsight:
    with world.session() as db:
        return db.get(RegionInsight, insight_id)


def test_below_threshold_is_locked_and_refresh_is_409_without_ai(world, ai, monkeypatch) -> None:
    event_id = world.event("e")
    for day in (0, 3, 6):
        world.timepoint("e", day)

    insights = _insights(world, event_id)
    assert insights.comparison_eligible is True
    assert insights.default_pair is not None
    assert insights.trend_status == "locked"
    assert insights.trend_progress.days == 3
    assert insights.trend_progress.missing_span_days == 1

    monkeypatch.setattr("app.api.region_events.run_trend", lambda *_: None)

    def db_override():
        with world.session() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    try:
        response = TestClient(app).post(f"/api/v1/region-events/{event_id}/trend/refresh")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 409
    assert ai.provider.requests == []


async def test_status_moves_from_stale_to_processing_to_ready(world, ai) -> None:
    event_id = world.event("e")
    for day in (0, 3, 7):
        world.timepoint("e", day)
    assert _insights(world, event_id).trend_status == "stale"

    insights, claim = _refresh(world, event_id)
    assert claim.schedule is True
    assert insights.trend_status == "processing"
    _, again = _refresh(world, event_id)
    assert again.schedule is False and again.insight.id == claim.insight.id

    await run_trend(claim.insight.id, claim.insight.attempt, world.factory)
    ready = _insights(world, event_id)
    assert ready.trend_status == "ready"
    assert ready.trend_is_current is True
    assert ready.trend.result["headline"]
    assert [ref.timepoint_id for ref in ready.trend.timepoints] == ["T1", "T2", "T3"]


async def test_long_history_sends_six_keyframes_and_all_window_facts(world, ai) -> None:
    event_id = world.event("e")
    for day in range(35):
        world.timepoint("e", day)
    world.timepoint("e", 34, hour=21, user_note="用了某某精华")

    claim = await _generate(world, event_id)

    row = _row(world, claim.insight.id)
    assert row.status == "completed"
    assert len(row.timepoint_map) == 30  # days 5..34, one representative per day
    assert sum(item["image_index"] is not None for item in row.timepoint_map) == 6
    assert row.timepoint_map[0]["local_date"] == "2026-09-06"
    assert all(item["crop"] == "region_crop" for item in row.timepoint_map if item["image_index"])
    request = ai.provider.requests[0]
    assert len(request.messages[1].image_urls) == 6
    user_text = request.messages[1].content
    assert user_text.count('"timepoint_id"') == 30
    assert "某某精华" not in user_text
    assert "中央偏左约 3 处浅红隆起。" not in user_text  # single-photo summaries excluded
    assert len(ai.storage.reads) == 6


async def test_new_timepoint_marks_trend_stale_and_keeps_previous_visible(world, ai) -> None:
    event_id = world.event("e")
    for day in (0, 3, 7):
        world.timepoint("e", day)
    first = await _generate(world, event_id)

    world.timepoint("e", 9)
    stale = _insights(world, event_id)
    assert stale.trend_status == "stale"
    assert stale.trend.trend_id == first.insight.id
    assert stale.trend_is_current is False

    second = await _generate(world, event_id)
    assert second.insight.id != first.insight.id
    fresh = _insights(world, event_id)
    assert fresh.trend_status == "ready" and fresh.trend.trend_id == second.insight.id
    assert _row(world, first.insight.id).superseded_at is not None


async def test_failed_refresh_does_not_replace_previous_trend(world, ai) -> None:
    event_id = world.event("e")
    for day in (0, 3, 7):
        world.timepoint("e", day)
    first = await _generate(world, event_id)

    world.timepoint("e", 10)
    unknown = lambda valid: {  # noqa: E731
        **valid, "notable_timepoints": [{"timepoint_id": "T99", "reason": "数量明显不同"}]
    }
    ai.provider.scripted = [unknown, unknown]
    failed = await _generate(world, event_id)

    row = _row(world, failed.insight.id)
    assert row.status == "failed" and row.failure_code == "unknown_timepoint"
    insights = _insights(world, event_id)
    assert insights.trend_status == "failed"
    assert insights.trend.trend_id == first.insight.id
    assert _row(world, first.insight.id).superseded_at is None


async def test_user_record_timepoint_has_no_stored_facts_in_request(world, ai) -> None:
    event_id = world.event("e")
    world.timepoint("e", 0)
    world.timepoint("e", 4, result_source="user_record", facts=None, user_note="今天有点红")
    world.timepoint("e", 8)

    claim = await _generate(world, event_id)
    row = _row(world, claim.insight.id)
    assert row.status == "completed"
    assert list(row.input_meta["stored_facts"].values())[1] is None
    assert "今天有点红" not in ai.provider.requests[0].messages[1].content


async def test_same_day_points_count_once(world, ai) -> None:
    event_id = world.event("e")
    world.timepoint("e", 0, hour=7)
    world.timepoint("e", 0, hour=22)
    world.timepoint("e", 7)
    insights = _insights(world, event_id)
    assert insights.photo_timepoint_count == 3
    assert insights.trend_progress.days == 2
    assert insights.trend_status == "locked"
