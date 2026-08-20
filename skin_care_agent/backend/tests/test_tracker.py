from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest

from app.models.patch_lineage import (
    PatchLineage,
    PatchLineageObservation,
    PatchLineageSnapshot,
)
from app.services.vision import tracker


class _ScalarResult:
    def __init__(self, rows: list[Any]):
        self._rows = rows

    def scalars(self) -> "_ScalarResult":
        return self

    def first(self) -> Any:
        return self._rows[0] if self._rows else None

    def __iter__(self):
        return iter(self._rows)


class _FakeSession:
    def __init__(self, execute_results: list[list[Any]]):
        self._execute_results = list(execute_results)
        self.added: list[Any] = []
        self.commit_count = 0
        self.flush_count = 0
        self._next_lineage_id = 100
        self._next_snapshot_id = 1000
        self._next_observation_id = 2000

    def execute(self, _stmt: Any) -> _ScalarResult:
        assert self._execute_results, "unexpected database query"
        return _ScalarResult(self._execute_results.pop(0))

    def add(self, row: Any) -> None:
        if isinstance(row, PatchLineage) and row.id is None:
            row.id = self._next_lineage_id
            self._next_lineage_id += 1
        if isinstance(row, PatchLineageSnapshot) and row.id is None:
            row.id = self._next_snapshot_id
            self._next_snapshot_id += 1
        if isinstance(row, PatchLineageObservation) and row.id is None:
            row.id = self._next_observation_id
            self._next_observation_id += 1
        self.added.append(row)

    def flush(self) -> None:
        self.flush_count += 1

    def commit(self) -> None:
        self.commit_count += 1

    def refresh(self, _row: Any, **_kwargs: Any) -> None:
        pass


def _analysis(patches: list[dict[str, Any]], *, analysis_id: int = 10) -> SimpleNamespace:
    return SimpleNamespace(
        id=analysis_id,
        user_id=1,
        photo_id=20,
        parsed_result={"acne_patches": patches},
        created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
    )


def _photo(*, tracked_analysis_id: int | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=20,
        user_id=1,
        check_in_id=30,
        view_type="right",
        taken_at=None,
        created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        deleted_at=None,
        lineage_tracked_analysis_id=tracked_analysis_id,
        lineage_tracked_at=None,
    )


def _check_in(observed_on: date, *, status: str = "complete") -> SimpleNamespace:
    return SimpleNamespace(
        id=30,
        user_id=1,
        status=status,
        observed_on=observed_on,
        deleted_at=None,
    )


def _patch(patch_id: str, bbox: list[float]) -> dict[str, Any]:
    return {
        "id": patch_id,
        "region": "right_cheek",
        "bbox_norm": bbox,
        "area_ratio": 0.02,
        "coverage": "sparse",
        "dominant_type": "papule",
        "estimated_count": 2,
        "inflammation": "mild",
        "severity": 2,
    }


def _lineage(
    *,
    lineage_id: int = 7,
    first_seen_on: date = date(2026, 7, 1),
    last_seen_on: date = date(2026, 7, 1),
    last_observed_on: date = date(2026, 7, 1),
    status: str = "active",
    missing_count: int = 0,
) -> PatchLineage:
    return PatchLineage(
        id=lineage_id,
        user_id=1,
        view_type="right",
        region="right_cheek",
        status=status,
        first_seen_at=datetime.combine(first_seen_on, datetime.min.time(), tzinfo=timezone.utc),
        last_seen_at=datetime.combine(last_seen_on, datetime.min.time(), tzinfo=timezone.utc),
        first_seen_on=first_seen_on,
        last_seen_on=last_seen_on,
        last_observed_on=last_observed_on,
        last_seen_check_in_id=1,
        consecutive_missing_observations=missing_count,
        status_reason="present_in_latest_observation",
        snapshot_count=1,
    )


def _snapshot(lineage: PatchLineage) -> PatchLineageSnapshot:
    observed_at = datetime.combine(
        lineage.last_seen_on,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    return PatchLineageSnapshot(
        id=8,
        lineage_id=lineage.id,
        analysis_id=9,
        photo_id=19,
        user_id=1,
        patch_id="old",
        check_in_id=1,
        observed_on=lineage.last_seen_on,
        view_type="right",
        region="right_cheek",
        bbox_norm=[0.50, 0.40, 0.60, 0.50],
        area_ratio=0.02,
        coverage="sparse",
        dominant_type="papule",
        estimated_count=2,
        inflammation="mild",
        severity=2,
        created_at=observed_at,
    )


def _track(
    db: _FakeSession,
    patches: list[dict[str, Any]],
    observed_on: date,
    *,
    photo: SimpleNamespace | None = None,
    status: str = "complete",
) -> tuple[tracker.TrackResult, SimpleNamespace]:
    photo = photo or _photo()
    result = tracker.track_patches_for_analysis(
        db,
        _analysis(patches),
        photo=photo,
        check_in=_check_in(observed_on, status=status),
    )
    return result, photo


def test_bbox_center_and_distance() -> None:
    assert tracker._bbox_center([0.2, 0.4, 0.6, 0.8]) == pytest.approx((0.4, 0.6))
    assert tracker._bbox_center([]) == (0.0, 0.0)
    assert tracker._distance((0.0, 0.0), (0.3, 0.4)) == 0.5


def test_draft_check_in_does_not_create_observation() -> None:
    db = _FakeSession([])
    result, photo = _track(
        db,
        [_patch("p1", [0.50, 0.40, 0.60, 0.50])],
        date(2026, 7, 13),
        status="draft",
    )

    assert result.skipped is True
    assert result.skip_reason == "check_in_not_complete"
    assert photo.lineage_tracked_analysis_id is None
    assert db.added == []
    assert db.commit_count == 0


def test_two_new_patches_cannot_share_lineage_in_same_analysis(monkeypatch) -> None:
    now = datetime(2026, 7, 13, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(tracker, "_now", lambda: now)
    db = _FakeSession([[]])

    result, photo = _track(
        db,
        [
            _patch("p1", [0.50, 0.40, 0.60, 0.50]),
            _patch("p2", [0.52, 0.42, 0.62, 0.52]),
        ],
        date(2026, 7, 13),
    )

    snapshots = [row for row in db.added if isinstance(row, PatchLineageSnapshot)]
    observations = [row for row in db.added if isinstance(row, PatchLineageObservation)]
    assert result.new_lineage_count == 2
    assert result.matched_lineage_count == 0
    assert len({snapshot.lineage_id for snapshot in snapshots}) == 2
    assert {snapshot.observed_on for snapshot in snapshots} == {date(2026, 7, 13)}
    assert {row.outcome for row in observations} == {"present"}
    assert photo.lineage_tracked_analysis_id == 10
    assert db.commit_count == 1


def test_nearby_patch_matches_existing_lineage() -> None:
    lineage = _lineage(last_observed_on=date(2026, 7, 1))
    old_snapshot = _snapshot(lineage)
    db = _FakeSession([[lineage], [old_snapshot]])

    result, _ = _track(
        db,
        [_patch("p1", [0.51, 0.41, 0.61, 0.51])],
        date(2026, 7, 30),
    )

    new_snapshot = next(row for row in db.added if isinstance(row, PatchLineageSnapshot))
    observation = next(row for row in db.added if isinstance(row, PatchLineageObservation))
    assert result.new_lineage_count == 0
    assert result.matched_lineage_count == 1
    assert new_snapshot.lineage_id == 7
    assert new_snapshot.match_info["matched"] is True
    assert observation.outcome == "present"
    assert lineage.last_seen_on == date(2026, 7, 30)
    assert lineage.snapshot_count == 2


def test_first_valid_missing_observation_only_marks_dormant() -> None:
    lineage = _lineage(last_seen_on=date(2026, 7, 1))
    db = _FakeSession([[lineage]])

    result, _ = _track(db, [], date(2026, 7, 20))

    observation = next(row for row in db.added if isinstance(row, PatchLineageObservation))
    assert result.missing_observation_count == 1
    assert observation.outcome == "missing"
    assert observation.advances_state is True
    assert lineage.status == "dormant"
    assert lineage.consecutive_missing_observations == 1


def test_second_valid_missing_observation_can_mark_healed() -> None:
    lineage = _lineage(
        last_seen_on=date(2026, 7, 1),
        last_observed_on=date(2026, 7, 10),
        status="dormant",
        missing_count=1,
    )
    db = _FakeSession([[lineage]])

    _track(db, [], date(2026, 7, 20))

    assert lineage.status == "healed"
    assert lineage.consecutive_missing_observations == 2
    assert lineage.status_reason == "missing_in_repeated_check_ins_over_14_days"


def test_same_day_missing_observation_does_not_advance_state() -> None:
    lineage = _lineage(
        last_seen_on=date(2026, 7, 13),
        last_observed_on=date(2026, 7, 13),
    )
    db = _FakeSession([[lineage]])

    _track(db, [], date(2026, 7, 13))

    observation = next(row for row in db.added if isinstance(row, PatchLineageObservation))
    assert observation.advances_state is False
    assert observation.reason == "missing_non_forward_observation"
    assert lineage.status == "active"
    assert lineage.consecutive_missing_observations == 0


def test_same_photo_is_tracked_only_once() -> None:
    db = _FakeSession([])
    photo = _photo(tracked_analysis_id=9)

    result, _ = _track(
        db,
        [_patch("p1", [0.50, 0.40, 0.60, 0.50])],
        date(2026, 7, 13),
        photo=photo,
    )

    assert result.skipped is True
    assert result.skip_reason == "photo_already_tracked"
    assert db.added == []
    assert db.commit_count == 0


def test_legacy_photo_uses_taken_at_and_remains_supported() -> None:
    taken_at = datetime(2025, 2, 3, 18, tzinfo=timezone.utc)
    photo = _photo()
    photo.check_in_id = None
    photo.view_type = None
    photo.taken_at = taken_at
    db = _FakeSession([[]])

    result = tracker.track_patches_for_analysis(
        db,
        _analysis([_patch("p1", [0.50, 0.40, 0.60, 0.50])]),
        photo=photo,
    )

    snapshot = next(row for row in db.added if isinstance(row, PatchLineageSnapshot))
    assert result.skipped is False
    assert snapshot.observed_on == taken_at.date()
    assert snapshot.view_type == "legacy"
