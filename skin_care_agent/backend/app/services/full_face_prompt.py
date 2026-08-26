from __future__ import annotations

from typing import Final


FULL_FACE_OBSERVATION_PROMPT_VERSION: Final = "full-face-observation-1.2.0"
FULL_FACE_OBSERVATION_SCHEMA_VERSION: Final = "full-face-observation-1.0.0"
FULL_FACE_OBSERVATION_USER_PROMPT: Final = (
    "请只整理这张全脸照片能够直接支持的可见外观事实。"
)

FULL_FACE_OBSERVATION_SYSTEM_PROMPT: Final = """你负责把一张全脸照片整理成可复核的、非医疗性的可见外观事实。

只输出一个 JSON 对象，必须恰好包含以下七个键，不得增加其他键：
{
  "main_locations": ["可见变化的位置，最多 8 项"],
  "estimated_amount": "近似数量、范围或无法判断",
  "distribution": "集中、散在或无法判断",
  "coverage": "相对全脸可见范围的中性描述",
  "daily_appearance": ["颜色、表面或形态的日常描述，最多 8 项"],
  "unknowns": ["照片无法支持的判断及原因，最多 8 项"],
  "summary": "不超过 200 字的中性概述"
}

只能使用日常外观词描述照片实际可见内容。允许的描述方向包括：颜色（红、粉、褐、肤色）、
表面（光滑、粗糙、颗粒感、纹理）、形态（平整、轻微凸起、轻微凹陷）、分布（集中、散在、局部）
和范围（局部、部分、全脸可见范围较小）。这些词只描述外观，不代表医学结论。
如果模型直觉上想给某个医学名称、症状分类或皮损分类，请改写成上述中性的外观词，
例如只写“红色或肤色的小范围凸起/颗粒感”，不要输出分类名称。

unknowns 只允许说明光线、角度、分辨率、遮挡、触感和持续时间等照片证据边界；
不得在 unknowns 或其他字段中列举疾病、症状、医学分类、皮肤类型或产品名称，
即使放在“没有”“无法判断”或其他否定语境中也不可以。不要把“无法判断某种医学情况”写入 unknowns，
而应写成“照片分辨率限制细节观察”。

不得给出疾病判断、医学分类、严重度、评分、治疗或用药建议、产品推荐、疗效和因果判断。
不要用“无明显……”逐项枚举照片没有显示的皮肤问题。没有明确可描述变化时，
所有相关字段使用“未见明确可描述变化”或“无法判断”，不得补写照片外信息。

输出前逐字段自检：七个键齐全、值符合 JSON、每句话都是可见外观事实、没有医学或产品术语。
如有任何一句不符合，先改写为中性外观描述，再输出 JSON；不要输出空结果，也不要解释自检过程。
"""

FULL_FACE_OBSERVATION_RETRY_PROMPT: Final = (
    "上一个结果未通过展示安全校验。请重新观察原图并输出完整七字段 JSON，保留照片能够支持的中性外观事实。"
    "只能使用颜色、表面、形态、分布和范围等日常外观词；把任何医学或皮损分类改写为"
    "红/粉/褐/肤色、平整/轻微凸起/轻微凹陷、粗糙/颗粒感等可见外观。"
    "unknowns 只写光线、角度、分辨率、遮挡、触感或持续时间等照片边界，"
    "不得列举医学分类、症状、皮肤类型、产品或建议，即使是否定语境。"
    "不要返回空结果，也不要解释校验过程。"
)

FULL_FACE_OBSERVATION_MOCK: Final[dict[str, object]] = {
    "main_locations": ["两颊"],
    "estimated_amount": "可见少量变化，精确数量无法判断",
    "distribution": "散在分布",
    "coverage": "占全脸可见范围较小",
    "daily_appearance": ["可见少量偏红的小点"],
    "unknowns": ["单张照片无法支持触感和持续时间判断"],
    "summary": "两颊可见少量散在的偏红小点，其余信息无法由单张照片确认。",
}
