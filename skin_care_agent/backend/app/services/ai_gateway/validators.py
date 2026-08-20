"""业务规则校验（在 schema 通过之后运行）。

职责：
1. 一致性检查：acne_types 计数 vs acne_points 数量；status_counts 同理
2. needs_doctor 服务端强判（Q3=要）：合规兜底，不能只信 LLM
   规则：
   - overall_severity >= 7 → true
   - 检测到 nodule/cyst → true
   - broken 状态 >= 3 颗 → true
   - LLM 说 true 时也保持 true（OR 一下，宁可多提示）

不 raise 异常，只返回 warnings（写进 compliance/validation flags）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.ai_gateway.schema import VisionAnalyzeResult


@dataclass
class ValidationReport:
    warnings: list[dict[str, Any]] = field(default_factory=list)
    needs_doctor_adjusted: bool = False  # 服务端是否上调了 needs_doctor
    original_needs_doctor: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "warnings": self.warnings,
            "needs_doctor_adjusted": self.needs_doctor_adjusted,
            "original_needs_doctor": self.original_needs_doctor,
        }


def validate_and_adjust(model: VisionAnalyzeResult) -> tuple[VisionAnalyzeResult, ValidationReport]:
    report = ValidationReport(original_needs_doctor=model.needs_doctor)

    # 一致性：patch estimated_count 总和 vs acne_types 计数总和（±30% 容差）
    patch_count = sum(p.estimated_count for p in model.acne_patches)
    ty_total = model.acne_types.total()
    if patch_count > 0 and ty_total > 0:
        low, high = ty_total * 0.7, ty_total * 1.3
        if not (low <= patch_count <= high):
            report.warnings.append(
                {
                    "kind": "patch_count_mismatch",
                    "acne_patches_sum": patch_count,
                    "acne_types_sum": ty_total,
                    "tolerance": "±30%",
                }
            )

    # 一致性：如果输出了 acne_points，其数量应 <= 10（v2 规则：轻度可枚举才输出）
    if len(model.acne_points) > 10:
        report.warnings.append(
            {
                "kind": "point_output_violation",
                "acne_points_len": len(model.acne_points),
                "note": "acne_points 应仅在 <10 颗且 sparse 时输出",
            }
        )

    # 一致性：status_counts 总和 vs acne_points 数量（仅当 acne_points 非空时校验）
    pt_total = len(model.acne_points)
    sc = model.status_counts
    sc_total = sc.new + sc.inflamed + sc.active + sc.healing + sc.broken
    if pt_total > 0 and sc_total != pt_total:
        report.warnings.append(
            {
                "kind": "status_count_mismatch",
                "status_counts_sum": sc_total,
                "acne_points_len": pt_total,
            }
        )

    # needs_doctor 服务端强判
    server_needs_doctor = _compute_needs_doctor(model)
    final = model.needs_doctor or server_needs_doctor
    if final != model.needs_doctor:
        report.needs_doctor_adjusted = True
        report.warnings.append(
            {
                "kind": "needs_doctor_adjusted",
                "llm_said": model.needs_doctor,
                "server_said": server_needs_doctor,
                "final": final,
                "reasons": _needs_doctor_reasons(model),
            }
        )
        model.needs_doctor = final

    return model, report


def _compute_needs_doctor(model: VisionAnalyzeResult) -> bool:
    if model.overall_severity >= 7:
        return True
    if model.acne_types.count_nodule > 0 or model.acne_types.count_cyst > 0:
        return True
    if model.status_counts.broken >= 3:
        return True
    # v2 新规则：融合成片是重度信号
    if any(p.coverage == "confluent" for p in model.acne_patches):
        return True
    return False


def _needs_doctor_reasons(model: VisionAnalyzeResult) -> list[str]:
    reasons = []
    if model.overall_severity >= 7:
        reasons.append(f"overall_severity={model.overall_severity} >= 7")
    if model.acne_types.count_nodule > 0:
        reasons.append(f"nodule={model.acne_types.count_nodule}")
    if model.acne_types.count_cyst > 0:
        reasons.append(f"cyst={model.acne_types.count_cyst}")
    if model.status_counts.broken >= 3:
        reasons.append(f"broken={model.status_counts.broken} >= 3")
    confluent_patches = [p.id for p in model.acne_patches if p.coverage == "confluent"]
    if confluent_patches:
        reasons.append(f"confluent_patches={confluent_patches}")
    return reasons
