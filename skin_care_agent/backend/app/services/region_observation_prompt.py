from __future__ import annotations

from typing import Final

from app.domain.region_catalog import REGION_DEFINITIONS, RegionId


REGION_OBSERVATION_PROMPT_VERSION: Final = "region-observation-1.0.0"
REGION_OBSERVATION_SCHEMA_VERSION: Final = "region-observation-1.0.0"
REGION_OBSERVATION_RETRY_PROMPT: Final = (
    "上一个结果未通过区域或展示安全校验。请重新观察原图，只输出已指定 region_id 的中性可见事实；"
    "不得提及未选区域、全脸、医学分类、评分、严重度、治疗、产品或因果，并返回完整七字段 JSON。"
)


def build_region_system_prompt(region_id: RegionId) -> str:
    definition = REGION_DEFINITIONS[region_id]
    return f"""你负责从原始面部照片中只整理一个已选固定区域的可见外观事实。

固定边界：
- region_id: {region_id}
- 展示名称：{definition.label}
- 方向和范围：{definition.direction_note}
- 左右始终以用户本人真实方向为准，自拍预览是否镜像都不改变 region_id。
- 不得输出未选区域，不得概括全脸，也不得比较不同区域。

只输出一个 JSON 对象，必须恰好包含以下七个键：
{{
  "main_locations": ["所选区域内的位置，最多 8 项"],
  "estimated_amount": "近似数量、范围或无法判断",
  "distribution": "集中、散在或无法判断",
  "coverage": "相对所选区域可见范围的中性描述",
  "daily_appearance": ["颜色、表面或形态的日常描述，最多 8 项"],
  "unknowns": ["照片无法支持的判断及原因，最多 8 项"],
  "summary": "不超过 200 字的中性概述"
}}

只能描述照片在所选区域直接支持的颜色、表面、形态、分布和范围。不得给出疾病或皮损分类、
诊断、严重度、评分、治疗、用药、产品建议、疗效或因果。unknowns 只写光线、角度、
分辨率、遮挡、触感或持续时间等证据边界。没有可靠内容时写“无法判断”，不要补写照片外信息。
输出前逐字段检查区域边界与七字段 JSON；不要解释检查过程。"""


def build_region_user_prompt(region_id: RegionId) -> str:
    return f"请只整理 region_id: {region_id} 对应固定区域内能够直接观察的可见外观事实。"


def region_mock_facts(region_id: RegionId) -> dict[str, object]:
    label = REGION_DEFINITIONS[region_id].label
    return {
        "main_locations": [label],
        "estimated_amount": "可见少量变化，精确数量无法判断",
        "distribution": "散在分布",
        "coverage": "占所选区域可见范围较小",
        "daily_appearance": ["可见少量偏红的小点"],
        "unknowns": ["单张照片无法支持触感和持续时间判断"],
        "summary": f"{label}可见少量散在的偏红小点，其余信息无法由单张照片确认。",
    }
