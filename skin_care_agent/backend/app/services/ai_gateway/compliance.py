"""合规扫描 + 模板兜底（策略 B4）。

策略：
1. 扫描 description/note/observation 类字段
2. 命中违禁词/违禁模式（疾病名/药品名/建议句）→ **整字段丢弃**，用服务端模板重生成
3. 无论是否命中，`compliance_flags` 记录该字段的命中项供审计

违禁词库分三类，可独立扩展：
- diseases：疾病名（痤疮/湿疹/激素脸/...）
- drugs：药品名（阿达帕林/维A酸/...）
- action_patterns：正则模式（"建议..."、"应该..."、"推荐..."）
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.ai_gateway.schema import REGION_ZH, TYPE_ZH, VisionAnalyzeResult


# 中文映射：coverage / inflammation → 用于模板生成
COVERAGE_ZH = {
    "sparse": "稀疏散在",
    "moderate": "中等密度",
    "dense": "密集",
    "confluent": "融合成片",
}
INFLAMMATION_ZH = {
    "none": "无明显炎症",
    "mild": "轻度炎症",
    "moderate": "中度炎症",
    "severe": "重度炎症",
}


# ============================================================
# 违禁词库（可持续扩展）
# ============================================================

DISEASE_WORDS = [
    "痤疮", "玫瑰痤疮", "酒糟鼻", "激素脸", "激素依赖性皮炎",
    "脂溢性皮炎", "湿疹", "特应性皮炎", "银屑病", "牛皮癣",
    "毛囊炎", "疖肿", "囊肿型痤疮", "聚合性痤疮", "结节性痤疮",
    "细菌感染", "真菌感染", "螨虫感染", "皮肤癌", "黑色素瘤",
    "红斑狼疮", "白癜风", "接触性皮炎", "过敏性皮炎",
]

DRUG_WORDS = [
    "阿达帕林", "维A酸", "维甲酸", "异维A酸", "他扎罗汀",
    "过氧化苯甲酰", "克林霉素", "夫西地酸", "红霉素", "四环素",
    "米诺环素", "多西环素", "螺内酯", "口服避孕药",
    "壬二酸", "水杨酸", "果酸", "维生素A酸",
    "氢醌", "对苯二酚", "熊果苷", "曲酸",
    "他克莫司", "吡美莫司", "糖皮质激素", "氢化可的松",
]

ACTION_PATTERNS = [
    r"建议(就医|就诊|看医生|去医院|服用|使用|涂抹|停用|购买)",
    r"应该(服用|使用|涂抹|停用|去医院|就医)",
    r"推荐(使用|购买|服用)",
    r"可以(服用|使用|涂抹)[^的]",  # 排除"可以使用的护肤品"这种描述
    r"请(立即|尽快|马上)(就医|就诊)",
    r"需要(服用|使用|涂抹)",
    r"必须(服用|使用|停用)",
]

_ACTION_REGEXES = [re.compile(p) for p in ACTION_PATTERNS]

# 需要扫描的字段路径（相对于 VisionAnalyzeResult）
SCANNABLE_FIELDS = [
    "observation",
    # regions 8 个区域的 note
    *[f"regions.{r}.note" for r in REGION_ZH.keys()],
    # other_concerns 6 个维度的 description + distribution
    *[
        f"other_concerns.{k}.{sub}"
        for k in ("pore", "oiliness", "redness", "dryness", "sensitivity", "texture")
        for sub in ("description", "distribution")
    ],
    # acne_points 里的 position_hint（少量，但也扫）
]


@dataclass
class ComplianceHit:
    field: str
    hits: list[str] = field(default_factory=list)  # 命中的词/模式
    original: str = ""
    action: str = "template"  # template / kept
    replaced_with: str = ""


@dataclass
class ComplianceReport:
    flags: list[ComplianceHit] = field(default_factory=list)

    @property
    def had_violations(self) -> bool:
        return any(h.action == "template" for h in self.flags)

    def to_json(self) -> list[dict[str, Any]]:
        return [
            {
                "field": h.field,
                "hits": h.hits,
                "action": h.action,
                "original": h.original[:200],
                "replaced_with": h.replaced_with[:200],
            }
            for h in self.flags
        ]


def _scan_text(text: str) -> list[str]:
    """返回命中的词/模式列表。"""
    if not text:
        return []
    hits: list[str] = []
    for w in DISEASE_WORDS:
        if w in text:
            hits.append(f"disease:{w}")
    for w in DRUG_WORDS:
        if w in text:
            hits.append(f"drug:{w}")
    for pat, regex in zip(ACTION_PATTERNS, _ACTION_REGEXES):
        if regex.search(text):
            hits.append(f"action:{pat}")
    return hits


# ============================================================
# 模板生成器：命中时替换为服务端拼的合规描述
# ============================================================


def _tpl_region_note(region_key: str, count: int) -> str:
    zh = REGION_ZH.get(region_key, region_key)
    if count <= 0:
        return f"{zh}区域未见明显皮损。"
    return f"{zh}区域可见约 {count} 处皮损特征。"


def _tpl_patch_description(patch) -> str:
    """Patch 命中违禁词时，用 coverage/inflammation/dominant_type 拼合规描述。"""
    zh_region = REGION_ZH.get(patch.region, patch.region)
    zh_cov = COVERAGE_ZH.get(patch.coverage, patch.coverage)
    zh_inf = INFLAMMATION_ZH.get(patch.inflammation, patch.inflammation)
    zh_type = TYPE_ZH.get(patch.dominant_type, patch.dominant_type) if patch.dominant_type != "mixed" else "多种类型混合"
    return (
        f"{zh_region}区域可见{zh_cov}的皮损，主要为{zh_type}，"
        f"约 {patch.estimated_count} 处，{zh_inf}。"
    )


def _tpl_other_concern_desc(sev: str) -> str:
    if sev in ("none",):
        return "该维度未见明显异常。"
    if sev in ("mild", "low"):
        return "该维度呈轻度表现。"
    if sev in ("moderate", "medium"):
        return "该维度呈中度表现。"
    if sev in ("severe", "high"):
        return "该维度呈明显表现。"
    return ""


def _tpl_observation(model: VisionAnalyzeResult) -> str:
    total = model.acne_types.total()
    # 优先用 patch 汇总
    if model.acne_patches:
        patch_count = len(model.acne_patches)
        regions = list({p.region for p in model.acne_patches})
        region_zh = "/".join(REGION_ZH.get(r, r) for r in regions[:3])
        has_confluent = any(p.coverage == "confluent" for p in model.acne_patches)
        if has_confluent:
            return f"面部可见约 {patch_count} 处病灶区域（含融合成片），主要分布于{region_zh}。"
        return f"面部可见约 {patch_count} 处病灶区域，主要分布于{region_zh}。"
    if total == 0:
        return "整体皮肤未见明显痘痘或炎症。"
    return f"共观察到约 {total} 处皮损特征。"


def _tpl_position_hint(region_key: str) -> str:
    zh = REGION_ZH.get(region_key, region_key)
    return f"{zh}区域"


# ============================================================
# 顶层入口
# ============================================================


def apply_compliance(model: VisionAnalyzeResult) -> tuple[VisionAnalyzeResult, ComplianceReport]:
    """就地扫描所有可扫描字段，命中则用模板重生成。返回新 model + 审计报告。"""
    report = ComplianceReport()

    # observation
    hits = _scan_text(model.observation)
    if hits:
        original = model.observation
        model.observation = _tpl_observation(model)
        report.flags.append(
            ComplianceHit(
                field="observation",
                hits=hits,
                original=original,
                action="template",
                replaced_with=model.observation,
            )
        )

    # regions.*.note
    for region_key in REGION_ZH.keys():
        info = getattr(model.regions, region_key, None)
        if info is None:
            continue
        hits = _scan_text(info.note)
        if hits:
            original = info.note
            info.note = _tpl_region_note(region_key, info.acne_count)
            report.flags.append(
                ComplianceHit(
                    field=f"regions.{region_key}.note",
                    hits=hits,
                    original=original,
                    action="template",
                    replaced_with=info.note,
                )
            )

    # other_concerns.*.description + distribution
    for key in ("pore", "oiliness", "redness", "dryness", "sensitivity", "texture"):
        item = getattr(model.other_concerns, key, None)
        if item is None:
            continue

        for sub in ("description", "distribution"):
            val = getattr(item, sub)
            hits = _scan_text(val)
            if hits:
                original = val
                if sub == "description":
                    new_val = _tpl_other_concern_desc(item.severity)
                else:
                    new_val = ""  # distribution 命中直接清空
                setattr(item, sub, new_val)
                report.flags.append(
                    ComplianceHit(
                        field=f"other_concerns.{key}.{sub}",
                        hits=hits,
                        original=original,
                        action="template",
                        replaced_with=new_val,
                    )
                )

    # acne_points.*.position_hint
    for pt in model.acne_points:
        hits = _scan_text(pt.position_hint)
        if hits:
            original = pt.position_hint
            pt.position_hint = _tpl_position_hint(pt.region)
            report.flags.append(
                ComplianceHit(
                    field=f"acne_points[{pt.id}].position_hint",
                    hits=hits,
                    original=original,
                    action="template",
                    replaced_with=pt.position_hint,
                )
            )

    # acne_patches.*.description
    for patch in model.acne_patches:
        hits = _scan_text(patch.description)
        if hits:
            original = patch.description
            patch.description = _tpl_patch_description(patch)
            report.flags.append(
                ComplianceHit(
                    field=f"acne_patches[{patch.id}].description",
                    hits=hits,
                    original=original,
                    action="template",
                    replaced_with=patch.description,
                )
            )

    return model, report


# ============================================================
# Chat 合规：精确删句（Q3=C）+ 医疗紧急兜底（Q5=B）
# ============================================================


MEDICAL_EMERGENCY_KEYWORDS = [
    # 严重症状
    "流脓", "化脓", "流血", "出血", "溃烂", "溃疡",
    "剧痛", "剧烈疼痛", "钻心疼", "非常痛", "特别疼",
    "发烧", "发热", "高烧", "浑身发冷", "寒颤",
    "呼吸困难", "喘不过气", "心跳加速",
    "肿胀严重", "严重红肿", "大面积红肿", "面部肿",
    # 疑似严重疾病
    "癌", "肿瘤", "恶性",
    "感染扩散", "败血症",
    # 特殊风险
    "怀孕", "孕期", "备孕",  # 用药禁忌相关
    "婴儿", "婴幼儿",
]

MEDICAL_INTERVENTION_MESSAGE = (
    "你描述的情况已经超出了日常皮肤护理咨询的范围。为了你的安全，"
    "建议**尽快线下咨询皮肤科或相关科室的专业医生**，让医生现场检查后做出判断。"
    "本工具无法替代医疗诊断。"
)


def detect_medical_emergency(text: str) -> list[str]:
    """扫用户输入是否命中医疗紧急关键词。返回命中的词。"""
    if not text:
        return []
    hits = []
    for w in MEDICAL_EMERGENCY_KEYWORDS:
        if w in text:
            hits.append(w)
    return hits


# 中文断句：句号/问号/感叹号/分号 + 换行
_SENTENCE_SPLIT = re.compile(r"(?<=[。！？；\.\!\?])\s*|\n+")


def apply_compliance_to_chat_text(text: str) -> tuple[str, list[ComplianceHit]]:
    """Chat 输出的合规扫描 + 精确删句（Q3=C）。

    策略：按句子切分，命中任何违禁词的句子整句删掉，其他保留。
    返回：(清洁后文本, 命中记录列表)。
    """
    if not text:
        return text, []

    sentences = [s for s in _SENTENCE_SPLIT.split(text) if s.strip()]
    kept: list[str] = []
    flags: list[ComplianceHit] = []

    for sent in sentences:
        hits = _scan_text(sent)
        if not hits:
            kept.append(sent)
        else:
            flags.append(
                ComplianceHit(
                    field="chat.assistant_message",
                    hits=hits,
                    original=sent,
                    action="drop_sentence",
                    replaced_with="",
                )
            )

    # 兜底：如果所有句子都被删了，给一个 fallback 提示
    if not kept and flags:
        cleaned = (
            "抱歉，这个问题的回答涉及一些我无法提供的医疗建议内容。"
            "建议你咨询专业的皮肤科医生获取准确信息。"
        )
    else:
        cleaned = "".join(kept).strip()

    return cleaned, flags
