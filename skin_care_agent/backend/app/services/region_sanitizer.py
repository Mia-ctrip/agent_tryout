from __future__ import annotations

from dataclasses import dataclass

from app.domain.region_catalog import REGION_DEFINITIONS, RegionId
from app.schemas.region_observation import (
    RegionObservationFacts,
    foreign_location_terms,
    non_skin_feature_term,
)
from app.services.full_face_sanitizer import sanitize_full_face_facts


@dataclass(frozen=True)
class RegionSanitizationResult:
    facts: RegionObservationFacts | None
    changed: bool
    warnings: list[dict[str, str]]


def _contains_foreign_location(value: str, region_id: RegionId) -> str | None:
    folded = value.casefold()
    return next(
        (term for term in foreign_location_terms(region_id) if term.casefold() in folded),
        None,
    )


def _contains_disallowed(value: str, region_id: RegionId) -> tuple[str, str] | None:
    if foreign := _contains_foreign_location(value, region_id):
        return "foreign_region", foreign
    if non_skin := non_skin_feature_term(value):
        return "non_skin_feature", non_skin
    return None


def sanitize_region_facts(
    facts: RegionObservationFacts,
    region_id: RegionId,
) -> RegionSanitizationResult:
    neutral = sanitize_full_face_facts(facts)
    values = neutral.facts.model_dump()
    warnings = list(neutral.warnings)

    for field in ("main_locations", "daily_appearance"):
        retained: list[str] = []
        for item in values[field]:
            disallowed = _contains_disallowed(item, region_id)
            if disallowed is None:
                retained.append(item)
            else:
                kind, term = disallowed
                warnings.append(
                    {"field": field, "action": f"drop_{kind}", "term": term}
                )
        values[field] = retained

    if not values["main_locations"] and not values["daily_appearance"]:
        return RegionSanitizationResult(facts=None, changed=True, warnings=warnings)

    if not values["main_locations"]:
        values["main_locations"] = [REGION_DEFINITIONS[region_id].label]

    for field, fallback in (
        ("estimated_amount", "无法判断"),
        ("distribution", "无法判断"),
        ("coverage", "所选区域可见范围无法判断"),
    ):
        disallowed = _contains_disallowed(values[field], region_id)
        if disallowed is not None:
            kind, term = disallowed
            values[field] = fallback
            warnings.append(
                {"field": field, "action": f"replace_{kind}", "term": term}
            )

    summary_disallowed = _contains_disallowed(values["summary"], region_id)
    if summary_disallowed is not None or neutral.changed or warnings:
        label = REGION_DEFINITIONS[region_id].label
        appearances = "、".join(values["daily_appearance"][:3]) or "细节无法判断"
        values["summary"] = (
            f"{label}可见{values['estimated_amount']}、{values['distribution']}的外观变化，"
            f"主要表现为{appearances}，{values['coverage']}。"
        )[:200]
        if summary_disallowed is not None:
            kind, term = summary_disallowed
            warnings.append(
                {
                    "field": "summary",
                    "action": f"rebuild_without_{kind}",
                    "term": term,
                }
            )

    sanitized = RegionObservationFacts.model_validate(values)
    return RegionSanitizationResult(
        facts=sanitized,
        changed=neutral.changed or bool(warnings),
        warnings=warnings,
    )
