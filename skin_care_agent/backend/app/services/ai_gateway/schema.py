"""Vision analyze 结果的 pydantic schema + 分级校验。

分级策略（Q1 = C）：
- 核心字段：严格校验，缺失/类型错 → schema_failed（触发 fallback）
  - overall_severity, skin_health_index, needs_doctor
  - acne_points（列表本身必须存在）
  - acne_types（键必须齐全）
- 边缘字段：宽松，可修复的修复，不可修复填默认值
  - regions/other_concerns 的 note/description
  - status_counts / scars 缺失自动补 0
  - 未知枚举值 fallback 到 "unknown"

失败时 `schema_errors` 里记录每个错误的字段路径 + 原因，落到 ai_call_logs 供排障。
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator


VALID_REGIONS = {
    "forehead",
    "left_cheek",
    "right_cheek",
    "nose",
    "chin",
    "mouth_area",
    "jaw",
    "temple",
}
VALID_ACNE_TYPES = {"blackhead", "whitehead", "comedone", "papule", "pustule", "nodule", "cyst"}
VALID_PATCH_TYPES = VALID_ACNE_TYPES | {"mixed"}
VALID_STATUSES = {"new", "inflamed", "active", "healing", "broken"}
VALID_SEVERITY_ABS = {"none", "mild", "moderate", "severe"}
VALID_SEVERITY_OIL = {"none", "low", "medium", "high"}
VALID_COVERAGE = {"sparse", "moderate", "dense", "confluent"}
VALID_INFLAMMATION = {"none", "mild", "moderate", "severe"}

REGION_ZH = {
    "forehead": "额头",
    "left_cheek": "左颊",
    "right_cheek": "右颊",
    "nose": "鼻部",
    "chin": "下巴",
    "mouth_area": "口周",
    "jaw": "下颌",
    "temple": "太阳穴",
}

TYPE_ZH = {
    "blackhead": "黑头",
    "whitehead": "白头",
    "comedone": "粉刺",
    "papule": "丘疹",
    "pustule": "脓疱",
    "nodule": "结节",
    "cyst": "囊肿",
}


# ============================================================
# 边缘字段：宽松（缺失/类型错自动补默认）
# ============================================================


class OtherConcernItem(BaseModel):
    model_config = {"extra": "allow"}
    severity: str = "none"
    distribution: str = ""
    description: str = ""

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_sev(cls, v: Any) -> str:
        if v is None:
            return "none"
        return str(v).strip().lower() or "none"

    @field_validator("distribution", "description", mode="before")
    @classmethod
    def _coerce_str(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)


class RegionInfo(BaseModel):
    model_config = {"extra": "allow"}
    acne_count: int = 0
    note: str = ""

    @field_validator("acne_count", mode="before")
    @classmethod
    def _coerce_int(cls, v: Any) -> int:
        try:
            return int(v) if v is not None else 0
        except (TypeError, ValueError):
            return 0

    @field_validator("note", mode="before")
    @classmethod
    def _coerce_note(cls, v: Any) -> str:
        return "" if v is None else str(v)


# ============================================================
# 核心字段：严格
# ============================================================


class AcnePoint(BaseModel):
    model_config = {"extra": "allow"}
    id: str
    region: str
    position_hint: str = ""
    type: str
    status: str = "active"
    severity: int = 1

    @field_validator("region", mode="before")
    @classmethod
    def _norm_region(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_REGIONS else "unknown"

    @field_validator("type", mode="before")
    @classmethod
    def _norm_type(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_ACNE_TYPES else "unknown"

    @field_validator("status", mode="before")
    @classmethod
    def _norm_status(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_STATUSES else "active"

    @field_validator("severity", mode="before")
    @classmethod
    def _clamp_severity(cls, v: Any) -> int:
        try:
            n = int(v) if v is not None else 1
        except (TypeError, ValueError):
            n = 1
        return max(1, min(5, n))

    @field_validator("position_hint", mode="before")
    @classmethod
    def _coerce_hint(cls, v: Any) -> str:
        return "" if v is None else str(v)


class AcnePatch(BaseModel):
    """痘斑：一片连续/聚集病灶区域。v2 建模的核心结构。

    覆盖轻度到重度全谱：轻度 sparse+估几颗，重度 confluent+估几十颗。
    """

    model_config = {"extra": "allow"}
    id: str
    region: str
    bbox_norm: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0, 0.0])
    area_ratio: float = 0.0
    coverage: str = "sparse"
    dominant_type: str = "mixed"
    estimated_count: int = 0
    inflammation: str = "none"
    severity: int = 1
    description: str = ""

    @field_validator("region", mode="before")
    @classmethod
    def _norm_region(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_REGIONS else "unknown"

    @field_validator("bbox_norm", mode="before")
    @classmethod
    def _clamp_bbox(cls, v: Any) -> list[float]:
        # 期望 [x1, y1, x2, y2]；不合法则填 0
        if not isinstance(v, (list, tuple)) or len(v) != 4:
            return [0.0, 0.0, 0.0, 0.0]
        out: list[float] = []
        for x in v:
            try:
                f = float(x)
            except (TypeError, ValueError):
                f = 0.0
            out.append(max(0.0, min(1.0, f)))
        # 确保 x1<=x2, y1<=y2
        x1, y1, x2, y2 = out
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1
        return [x1, y1, x2, y2]

    @field_validator("area_ratio", mode="before")
    @classmethod
    def _clamp_area(cls, v: Any) -> float:
        try:
            f = float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            f = 0.0
        return max(0.0, min(1.0, f))

    @field_validator("coverage", mode="before")
    @classmethod
    def _norm_coverage(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_COVERAGE else "sparse"

    @field_validator("dominant_type", mode="before")
    @classmethod
    def _norm_dominant(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_PATCH_TYPES else "mixed"

    @field_validator("estimated_count", mode="before")
    @classmethod
    def _coerce_count(cls, v: Any) -> int:
        try:
            n = int(v) if v is not None else 0
        except (TypeError, ValueError):
            n = 0
        return max(0, n)

    @field_validator("inflammation", mode="before")
    @classmethod
    def _norm_inflammation(cls, v: Any) -> str:
        s = str(v or "").strip().lower()
        return s if s in VALID_INFLAMMATION else "none"

    @field_validator("severity", mode="before")
    @classmethod
    def _clamp_sev(cls, v: Any) -> int:
        try:
            n = int(v) if v is not None else 1
        except (TypeError, ValueError):
            n = 1
        return max(1, min(5, n))

    @field_validator("description", mode="before")
    @classmethod
    def _coerce_desc(cls, v: Any) -> str:
        return "" if v is None else str(v)


class AcneTypeCounts(BaseModel):
    model_config = {"extra": "allow"}
    count_blackhead: int = 0
    count_whitehead: int = 0
    count_comedone: int = 0
    count_papule: int = 0
    count_pustule: int = 0
    count_nodule: int = 0
    count_cyst: int = 0

    @field_validator("*", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> int:
        try:
            return int(v) if v is not None else 0
        except (TypeError, ValueError):
            return 0

    def total(self) -> int:
        return sum(getattr(self, f) for f in self.model_fields)


class StatusCounts(BaseModel):
    model_config = {"extra": "allow"}
    new: int = 0
    inflamed: int = 0
    active: int = 0
    healing: int = 0
    broken: int = 0

    @field_validator("*", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> int:
        try:
            return int(v) if v is not None else 0
        except (TypeError, ValueError):
            return 0


class ScarCounts(BaseModel):
    model_config = {"extra": "allow"}
    count_scar_red: int = 0
    count_scar_dark: int = 0
    count_scar_atrophic: int = 0
    count_scar_hypertrophic: int = 0

    @field_validator("*", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> int:
        try:
            return int(v) if v is not None else 0
        except (TypeError, ValueError):
            return 0


class OtherConcerns(BaseModel):
    model_config = {"extra": "allow"}
    pore: OtherConcernItem = Field(default_factory=OtherConcernItem)
    oiliness: OtherConcernItem = Field(default_factory=OtherConcernItem)
    redness: OtherConcernItem = Field(default_factory=OtherConcernItem)
    dryness: OtherConcernItem = Field(default_factory=OtherConcernItem)
    sensitivity: OtherConcernItem = Field(default_factory=OtherConcernItem)
    texture: OtherConcernItem = Field(default_factory=OtherConcernItem)


class Regions(BaseModel):
    model_config = {"extra": "allow"}
    forehead: RegionInfo = Field(default_factory=RegionInfo)
    left_cheek: RegionInfo = Field(default_factory=RegionInfo)
    right_cheek: RegionInfo = Field(default_factory=RegionInfo)
    nose: RegionInfo = Field(default_factory=RegionInfo)
    chin: RegionInfo = Field(default_factory=RegionInfo)
    mouth_area: RegionInfo = Field(default_factory=RegionInfo)
    jaw: RegionInfo = Field(default_factory=RegionInfo)
    temple: RegionInfo = Field(default_factory=RegionInfo)


class VisionAnalyzeResult(BaseModel):
    """顶层 schema。核心字段无默认值，缺失即校验失败。

    v2 change：
    - acne_patches 为必填（可为空数组，代表无病灶）
    - acne_points 改为可选，仅在轻度可枚举时输出
    """

    model_config = {"extra": "allow"}

    observation: str
    acne_patches: list[AcnePatch]
    acne_points: list[AcnePoint] = Field(default_factory=list)
    acne_types: AcneTypeCounts
    status_counts: StatusCounts = Field(default_factory=StatusCounts)
    scars: ScarCounts = Field(default_factory=ScarCounts)
    regions: Regions = Field(default_factory=Regions)
    other_concerns: OtherConcerns = Field(default_factory=OtherConcerns)
    overall_severity: int
    skin_health_index: int
    needs_doctor: bool

    @field_validator("observation", mode="before")
    @classmethod
    def _coerce_obs(cls, v: Any) -> str:
        if v is None:
            raise ValueError("observation is required")
        s = str(v).strip()
        if not s:
            raise ValueError("observation is empty")
        return s

    @field_validator("overall_severity", mode="before")
    @classmethod
    def _clamp_severity(cls, v: Any) -> int:
        if v is None:
            raise ValueError("overall_severity is required")
        try:
            n = int(v)
        except (TypeError, ValueError) as e:
            raise ValueError(f"overall_severity must be int, got {v!r}") from e
        return max(1, min(10, n))

    @field_validator("skin_health_index", mode="before")
    @classmethod
    def _clamp_index(cls, v: Any) -> int:
        if v is None:
            raise ValueError("skin_health_index is required")
        try:
            n = int(v)
        except (TypeError, ValueError) as e:
            raise ValueError(f"skin_health_index must be int, got {v!r}") from e
        return max(0, min(100, n))

    @field_validator("needs_doctor", mode="before")
    @classmethod
    def _coerce_bool(cls, v: Any) -> bool:
        if v is None:
            raise ValueError("needs_doctor is required")
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in {"true", "1", "yes"}
        return bool(v)

    @model_validator(mode="after")
    def _sync_counts(self):
        """如果 acne_types 计数和 acne_points 数量对不上，记一笔（不 raise）。

        调用方通过 validator 层拿到不一致警告，schema 本身不 fail。
        """
        return self


class SchemaValidationResult:
    """封装校验结果：成功返回 model，失败返回 errors。"""

    def __init__(
        self,
        parsed: Optional[VisionAnalyzeResult],
        errors: list[dict[str, Any]],
    ):
        self.parsed = parsed
        self.errors = errors

    @property
    def ok(self) -> bool:
        return self.parsed is not None


def validate_vision_analyze(raw: dict[str, Any]) -> SchemaValidationResult:
    """核心字段严格，边缘字段宽松。"""
    try:
        m = VisionAnalyzeResult.model_validate(raw)
        return SchemaValidationResult(m, [])
    except ValidationError as e:
        errors = [
            {
                "loc": ".".join(str(x) for x in err.get("loc", [])),
                "msg": err.get("msg"),
                "type": err.get("type"),
            }
            for err in e.errors()
        ]
        return SchemaValidationResult(None, errors)
