from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import CheckConstraint, select
from sqlalchemy.exc import IntegrityError

from app.models.region_event import RegionEvent
from app.models.region_insight import RegionInsight
from app.models.user import User
from tests.sqlite_support import sqlite_session_factory


def _insight(**overrides) -> RegionInsight:
    values = dict(
        user_id=1,
        region_event_id=1,
        region_id="chin",
        kind="trend",
        status="processing",
        input_fingerprint="f" * 64,
        referenced_target_ids=[1, 2, 3],
        timepoint_map=[],
        prompt_version="p",
        schema_version="s",
    )
    values.update(overrides)
    return RegionInsight(**values)


@pytest.fixture
def db():
    factory = sqlite_session_factory()
    with factory() as session:
        for user_id in (1, 2):
            session.add(User(id=user_id))
        session.flush()
        for event_id, user_id in ((1, 1), (2, 2)):
            session.add(
                RegionEvent(
                    id=event_id,
                    user_id=user_id,
                    region_id="chin",
                    status="current",
                    started_local_date=date(2026, 9, 1),
                    last_valid_local_date=date(2026, 9, 9),
                )
            )
        session.commit()
        yield session


def test_table_declares_named_constraints_matching_migration() -> None:
    table = RegionInsight.__table__
    checks = {c.name for c in table.constraints if isinstance(c, CheckConstraint)}
    assert checks == {
        "ck_region_insights_kind",
        "ck_region_insights_status",
        "ck_region_insights_region_id",
        "ck_region_insights_comparison_pair",
    }
    unique = next(i for i in table.indexes if i.name == "uq_region_insights_user_kind_fingerprint")
    assert unique.unique is True
    assert [c.name for c in unique.columns] == ["user_id", "kind", "input_fingerprint"]


def test_fingerprint_is_unique_per_user_and_kind(db) -> None:
    db.add(_insight())
    db.commit()
    db.add(_insight(user_id=2, region_event_id=2))
    db.commit()
    db.add(_insight())
    with pytest.raises(IntegrityError):
        db.commit()


@pytest.mark.parametrize(
    "overrides",
    [
        {"kind": "full_face"},
        {"status": "queued"},
        {"region_id": "neck"},
        {"kind": "comparison"},  # comparison without its pair
        {"earlier_target_id": None, "later_target_id": 9, "kind": "trend"},
    ],
)
def test_check_constraints_reject_invalid_rows(db, overrides) -> None:
    db.add(_insight(**overrides))
    with pytest.raises(IntegrityError):
        db.commit()


def test_rows_are_scoped_by_user(db) -> None:
    db.add_all([_insight(), _insight(user_id=2, region_event_id=2, input_fingerprint="e" * 64)])
    db.commit()
    rows = db.scalars(select(RegionInsight).where(RegionInsight.user_id == 1)).all()
    assert [row.user_id for row in rows] == [1]
