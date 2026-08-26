from __future__ import annotations

from app.domain.region_catalog import RegionId
from app.schemas.full_face_observation import (
    FullFaceObservationFacts,
    validate_full_face_display,
)


class RegionObservationFacts(FullFaceObservationFacts):
    """The same seven visible-fact fields, scoped to one fixed region."""


_REGION_LOCATION_TERMS: dict[RegionId, tuple[str, ...]] = {
    "forehead": ("额头",),
    "left_face": ("你的左侧脸", "左侧脸", "左脸", "左颊"),
    "right_face": ("你的右侧脸", "右侧脸", "右脸", "右颊"),
    "nose_area": ("鼻周", "鼻部", "鼻翼", "鼻子"),
    "mouth_area": ("口周", "嘴唇", "嘴角", "嘴部"),
    "chin": ("下巴", "下颌中央"),
}
_FULL_FACE_TERMS = ("全脸", "整个脸", "整张脸", "全部面部")


def foreign_location_terms(region_id: RegionId) -> tuple[str, ...]:
    return (
        *_FULL_FACE_TERMS,
        *(
            term
            for candidate, terms in _REGION_LOCATION_TERMS.items()
            if candidate != region_id
            for term in terms
        ),
    )


def _display_parts(facts: RegionObservationFacts) -> list[str]:
    parts: list[str] = []
    for value in facts.model_dump().values():
        parts.extend(value if isinstance(value, list) else [value])
    return parts


def validate_region_display(
    facts: RegionObservationFacts,
    region_id: RegionId,
) -> RegionObservationFacts:
    validate_full_face_display(facts)
    display_text = "\n".join(_display_parts(facts)).casefold()
    for term in foreign_location_terms(region_id):
        if term.casefold() in display_text:
            raise ValueError(f"outside_selected_region:{term}")
    return facts
