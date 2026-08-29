from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence, cast


LifeContextId = Literal[
    "sleep",
    "stress",
    "diet",
    "mood",
    "menstrual_cycle",
    "care_change",
]


@dataclass(frozen=True)
class LifeContextDefinition:
    context_id: LifeContextId
    label: str


LIFE_CONTEXTS: tuple[LifeContextDefinition, ...] = (
    LifeContextDefinition("sleep", "睡眠"),
    LifeContextDefinition("stress", "压力"),
    LifeContextDefinition("diet", "饮食"),
    LifeContextDefinition("mood", "情绪"),
    LifeContextDefinition("menstrual_cycle", "生理期"),
    LifeContextDefinition("care_change", "护理变化"),
)
LIFE_CONTEXT_IDS: tuple[LifeContextId, ...] = tuple(item.context_id for item in LIFE_CONTEXTS)


def normalize_life_context_ids(values: Sequence[str]) -> tuple[LifeContextId, ...]:
    if len(set(values)) != len(values):
        raise ValueError("life context ids contain duplicates")
    unknown = set(values) - set(LIFE_CONTEXT_IDS)
    if unknown:
        raise ValueError("unknown life context id")
    selected = set(values)
    return tuple(cast(LifeContextId, value) for value in LIFE_CONTEXT_IDS if value in selected)
