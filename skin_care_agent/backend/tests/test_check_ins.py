from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects.postgresql import dialect

from app.api import check_ins
from app.api.check_ins import _missing_required_views, _serialize_diary
from app.models.check_in import CheckIn
from app.schemas.check_in import CheckInCreate, CheckInDiary


def test_standard_check_in_requires_front_left_and_right() -> None:
    assert _missing_required_views("standard", {"front", "left"}) == ["right"]


def test_quick_check_in_does_not_require_photos() -> None:
    assert _missing_required_views("quick", set()) == []


def test_check_in_create_rejects_unknown_kind() -> None:
    with pytest.raises(ValidationError):
        CheckInCreate(kind="weekly", observed_on=date(2026, 7, 13))


def test_diary_validates_ranges_and_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        CheckInDiary(sleep_hours=25)
    with pytest.raises(ValidationError):
        CheckInDiary(stress_level=0)
    with pytest.raises(ValidationError):
        CheckInDiary(diet_tags=["spicy", "unknown"])
    with pytest.raises(ValidationError):
        CheckInDiary(unexpected=True)


def test_diary_normalizes_duplicate_tags_and_product_names() -> None:
    diary = CheckInDiary(
        diet_tags=["spicy", "sugary", "spicy"],
        new_skincare_products=["  温和面霜  ", "温和面霜"],
        topical_products=["BPO", "bpo"],
    )

    assert diary.diet_tags == ["spicy", "sugary"]
    assert diary.new_skincare_products == ["温和面霜"]
    assert diary.topical_products == ["BPO"]


def test_empty_diary_serializes_as_null() -> None:
    assert _serialize_diary(CheckInDiary()) is None


def test_empty_diary_binds_as_sql_null_instead_of_json_null() -> None:
    diary_type = CheckIn.__table__.c.diary_data.type
    processor = diary_type.bind_processor(dialect())

    assert processor is not None
    assert processor(None) is None


class _FakeDB:
    def __init__(self, row: CheckIn) -> None:
        self.row = row
        self.commit_count = 0

    def get(self, _model: Any, row_id: int) -> CheckIn | None:
        return self.row if row_id == self.row.id else None

    def commit(self) -> None:
        self.commit_count += 1

    def refresh(self, _row: CheckIn) -> None:
        pass


def test_replace_diary_updates_completed_check_in(monkeypatch) -> None:
    row = CheckIn(
        user_id=1,
        kind="quick",
        status="complete",
        observed_on=date(2026, 7, 14),
        completed_at=datetime(2026, 7, 14, tzinfo=timezone.utc),
    )
    row.id = 9
    row.created_at = datetime(2026, 7, 14, tzinfo=timezone.utc)
    db = _FakeDB(row)
    monkeypatch.setattr(check_ins, "_load_photos", lambda *_args, **_kwargs: {})

    result = check_ins.replace_check_in_diary(
        check_in_id=9,
        body=CheckInDiary(sleep_hours=7.5, stress_level=4, diet_tags=["spicy"]),
        current_user=SimpleNamespace(id=1),
        db=db,
    )

    assert db.commit_count == 1
    assert row.status == "complete"
    assert row.diary_data == {
        "sleep_hours": 7.5,
        "stress_level": 4,
        "diet_tags": ["spicy"],
    }
    assert row.diary_updated_at is not None
    assert result.diary is not None
    assert result.diary.sleep_hours == 7.5
    assert result.diary.diet_tags == ["spicy"]


def test_load_check_in_hides_another_users_record() -> None:
    row = CheckIn(
        user_id=2,
        kind="quick",
        status="draft",
        observed_on=date(2026, 7, 14),
    )
    row.id = 9
    db = _FakeDB(row)

    with pytest.raises(check_ins.HTTPException) as exc_info:
        check_ins._load_check_in(db, 9, user_id=1)

    assert exc_info.value.status_code == 404
