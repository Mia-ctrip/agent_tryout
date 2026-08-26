from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


NeutralItem = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
EstimatedAmount = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
NeutralDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]
NeutralSummary = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class FullFaceObservationFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main_locations: list[NeutralItem] = Field(max_length=8)
    estimated_amount: EstimatedAmount
    distribution: NeutralDescription
    coverage: NeutralDescription
    daily_appearance: list[NeutralItem] = Field(max_length=8)
    unknowns: list[NeutralItem] = Field(max_length=8)
    summary: NeutralSummary


_UNSAFE_DISPLAY_TERMS = (
    "诊断",
    "痤疮",
    "丘疹",
    "脓疱",
    "严重",
    "炎症程度",
    "治疗",
    "用药",
    "建议使用",
    "推荐产品",
    "疗效",
)


def validate_full_face_display(
    facts: FullFaceObservationFacts,
) -> FullFaceObservationFacts:
    values = facts.model_dump()
    text_parts: list[str] = []
    for value in values.values():
        if isinstance(value, list):
            text_parts.extend(value)
        else:
            text_parts.append(value)
    display_text = "\n".join(text_parts).casefold()
    for term in _UNSAFE_DISPLAY_TERMS:
        if term.casefold() in display_text:
            raise ValueError(f"unsafe_output:{term}")
    return facts
