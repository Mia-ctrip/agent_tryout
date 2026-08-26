from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.life_context_catalog import LIFE_CONTEXTS, normalize_life_context_ids
from app.models.life_context import ObservationLifeContext
from app.schemas.observation import ObservationLifeContextUpdate


def test_life_context_catalog_has_exact_stable_ids_and_labels() -> None:
    assert [(item.context_id, item.label) for item in LIFE_CONTEXTS] == [
        ("sleep", "睡眠"),
        ("stress", "压力"),
        ("diet", "饮食"),
        ("mood", "情绪"),
        ("menstrual_cycle", "生理期"),
        ("care_change", "护理变化"),
    ]


def test_life_context_normalization_keeps_catalog_order_and_rejects_duplicates() -> None:
    assert normalize_life_context_ids(["care_change", "sleep", "mood"]) == (
        "sleep",
        "mood",
        "care_change",
    )
    with pytest.raises(ValueError, match="duplicates"):
        normalize_life_context_ids(["sleep", "sleep"])


def test_life_context_update_accepts_empty_skip_but_rejects_unknown_ids() -> None:
    assert ObservationLifeContextUpdate(context_ids=[]).context_ids == []
    with pytest.raises(ValidationError):
        ObservationLifeContextUpdate(context_ids=["weather"])


def test_observation_life_context_uses_one_row_per_stable_selection() -> None:
    table = ObservationLifeContext.__table__

    assert table.name == "observation_life_contexts"
    assert [column.name for column in table.primary_key.columns] == [
        "observation_id",
        "context_id",
    ]
    foreign_key = next(iter(table.c.observation_id.foreign_keys))
    assert foreign_key.target_fullname == "observation_records.id"
    assert foreign_key.ondelete == "CASCADE"
