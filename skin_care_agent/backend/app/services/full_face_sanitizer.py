from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.full_face_observation import FullFaceObservationFacts


_MEDICAL_TERM_REWRITES = {
    "痤疮": "可见外观变化",
    "丘疹": "小范围凸起",
    "脓疱": "局部颜色与表面变化",
    "诊断": "观察",
    "炎症程度": "颜色与表面变化范围",
    "严重": "较明显",
}
_NON_OBSERVATION_TERMS = (
    "治疗",
    "用药",
    "建议使用",
    "推荐产品",
    "疗效",
)
_EVIDENCE_BOUNDARY_REWRITES = (
    ("光线", "光线条件可能影响颜色与细节观察"),
    ("角度", "拍摄角度可能限制部分区域观察"),
    ("分辨率", "照片分辨率限制细节观察"),
    ("遮挡", "遮挡可能限制部分区域观察"),
    ("触感", "皮肤触感无法通过照片判断"),
    ("持续时间", "持续时间无法通过单张照片判断"),
)
_DEFAULT_UNKNOWN = "单张照片无法支持触感和持续时间判断"
_DEFAULT_APPEARANCE = "可见外观变化，细节无法安全描述"


@dataclass(frozen=True)
class FullFaceSanitizationResult:
    facts: FullFaceObservationFacts
    changed: bool
    warnings: list[dict[str, str]]


def _unsafe_terms(text: str) -> list[str]:
    return [
        term
        for term in (*_MEDICAL_TERM_REWRITES, *_NON_OBSERVATION_TERMS)
        if term in text
    ]


def _sanitize_list_item(
    field: str,
    item: str,
    warnings: list[dict[str, str]],
) -> str | None:
    terms = _unsafe_terms(item)
    if not terms:
        return item
    if field == "unknowns":
        for marker, replacement in _EVIDENCE_BOUNDARY_REWRITES:
            if marker in item:
                warnings.append(
                    {
                        "field": field,
                        "action": "rewrite_to_evidence_boundary",
                        "term": terms[0],
                    }
                )
                return replacement
        warnings.append(
            {
                "field": field,
                "action": "drop_non_evidence_boundary",
                "term": terms[0],
            }
        )
        return None
    if any(term in item for term in _NON_OBSERVATION_TERMS):
        warnings.append(
            {
                "field": field,
                "action": "drop_non_observation_item",
                "term": next(term for term in _NON_OBSERVATION_TERMS if term in item),
            }
        )
        return None
    rewritten = item
    for term, replacement in _MEDICAL_TERM_REWRITES.items():
        if term not in rewritten:
            continue
        rewritten = rewritten.replace(term, replacement)
        warnings.append(
            {
                "field": field,
                "action": "rewrite_medical_term",
                "term": term,
            }
        )
    return rewritten.strip() or None


def _sanitize_scalar(
    field: str,
    value: str,
    fallback: str,
    warnings: list[dict[str, str]],
) -> str:
    terms = _unsafe_terms(value)
    if not terms:
        return value
    warnings.append(
        {
            "field": field,
            "action": "replace_unsafe_scalar",
            "term": terms[0],
        }
    )
    return fallback


def _rebuild_summary(values: dict[str, Any]) -> str:
    locations = "、".join(values["main_locations"]) or "照片可见区域"
    amount = values["estimated_amount"]
    distribution = values["distribution"]
    appearances = "、".join(values["daily_appearance"][:3])
    coverage = values["coverage"]
    summary = f"{locations}可见{amount}、{distribution}的外观变化"
    if appearances:
        summary += f"，主要表现为{appearances}"
    summary += f"，覆盖{coverage}。"
    if len(summary) <= 200:
        return summary
    return f"{summary[:199].rstrip('，。')}。"


def sanitize_full_face_facts(
    facts: FullFaceObservationFacts,
) -> FullFaceSanitizationResult:
    values = facts.model_dump()
    warnings: list[dict[str, str]] = []

    for field in ("main_locations", "daily_appearance", "unknowns"):
        sanitized_items = [
            sanitized
            for item in values[field]
            if (sanitized := _sanitize_list_item(field, item, warnings)) is not None
        ]
        values[field] = sanitized_items

    values["estimated_amount"] = _sanitize_scalar(
        "estimated_amount", values["estimated_amount"], "无法判断", warnings
    )
    values["distribution"] = _sanitize_scalar(
        "distribution", values["distribution"], "无法判断", warnings
    )
    values["coverage"] = _sanitize_scalar(
        "coverage", values["coverage"], "可见范围无法判断", warnings
    )

    if not values["daily_appearance"]:
        values["daily_appearance"] = [_DEFAULT_APPEARANCE]
    if not values["unknowns"]:
        values["unknowns"] = [_DEFAULT_UNKNOWN]

    summary_terms = _unsafe_terms(values["summary"])
    if summary_terms:
        values["summary"] = _rebuild_summary(values)
        warnings.append(
            {
                "field": "summary",
                "action": "rebuild_from_sanitized_facts",
                "term": summary_terms[0],
            }
        )

    sanitized_facts = FullFaceObservationFacts.model_validate(values)
    return FullFaceSanitizationResult(
        facts=sanitized_facts,
        changed=bool(warnings),
        warnings=warnings,
    )
