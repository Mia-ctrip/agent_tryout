# 皮肤状态标签体系

## 概述

本文档定义了 Skin Care Agent 中使用的所有皮肤问题标签分类体系，用于统一 AI 视觉模型的输出格式与前端展示。

**设计原则**：
- 按照医学临床分类的逻辑组织（而非UX分类）
- 涵盖痘痘完整生命周期（粉刺 → 炎症 → 消退 → 痘印 → 真疤）
- 支持长期追踪（单颗痘的状态转变）

---

## 一、痘痘类型（按医学分类）

### 粉刺阶段

| 标签 | 中文含义 | 说明 | API 返回字段 |
|------|--------|------|------------|
| `comedone` | 粉刺（总称） | 毛孔堵塞形成，为其他炎症痘的初期 | count_comedone |
| `blackhead` / `open_comedone` | 黑头（开放性粉刺） | 毛孔开口，氧化变黑 | count_blackhead |
| `whitehead` / `closed_comedone` | 白头（闭合性粉刺） | 毛孔闭口，皮下小白点 | count_whitehead |

### 炎症痘阶段

| 标签 | 中文含义 | 说明 | API 返回字段 |
|------|--------|------|------------|
| `papule` | 丘疹 | 红色小凸起，直径 < 5mm，无脓头 | count_papule |
| `pustule` | 脓疱 | 有白/黄脓头，直径 < 5mm | count_pustule |
| `nodule` | 结节 | 深层痘痘，直径 5-10mm，硬，易留疤 | count_nodule |
| `cyst` | 囊肿 | 最深层，直径 > 10mm，含脓液，高风险留疤 | count_cyst |

### 选择建议

**消费级美肤App**（本项目定位）：
- 重点关注：`blackhead` / `whitehead` / `pustule` / `papule`
- 可选：`comedone`（作为粉刺总数）
- 专业级特性：先不做 `nodule` / `cyst`，后续如需扩展再加

### 1.4 病灶组织形态：单颗痘（Point） vs 痘斑（Patch）

**为什么要区分**：轻度用户几颗零星痘 vs 重度用户满脸融合成片，两种情况**不可能用同一种数据结构描述**。

- 轻度用户：3 颗白头，可精确定位
- 中度用户：右颊 15 颗混合痘型，还能勉强数
- 重度用户：两颊融合成片，30+ 颗、界限模糊、无法逐颗计数

因此本项目对病灶采取**双层建模**：

| 层级 | 单位 | 结构 | 适用场景 |
|------|------|------|---------|
| **Patch（痘斑）** | 一片区域 | region + bbox + coverage + estimated_count | **必填，全谱适用**（轻/中/重度都能表达） |
| **Point（单颗痘）** | 一颗痘 | region + type + status + severity | 可选，仅在轻度可枚举时输出 |

**Patch 关键属性**：
- `coverage`（密集程度）：`sparse` / `moderate` / `dense` / `confluent`
- `dominant_type`（主导痘型）：patch 内最常见的痘类型；混合时用 `mixed`
- `estimated_count`：这片区域内估计颗数（整数，无法精确时给区间中值）
- `inflammation`：patch 整体炎症等级（`none/mild/moderate/severe`）

**Point 的触发条件（AI 判断）**：
```
if 总痘数 < 10 AND 所有 patch 都是 sparse coverage:
    输出 acne_points（每颗独立定位）
else:
    只输出 acne_patches（按片描述）
```

**追踪意义**：
- Patch 追踪 → 观察"整片区域"的密集度、类型、炎症变化 → 对重度用户友好
- Point 追踪 → 观察"某颗痘"的生命周期（new→inflamed→healing→scar） → 对轻度用户友好

---

## 二、炎症 & 状态标签

### 痘痘生命周期状态

| 标签 | 中文含义 | 说明 | 用途 |
|------|--------|------|------|
| `new` | 新生痘 | 出现 < 3 天 | 标记新增痘痘 |
| `inflamed` | 发炎红肿 | 周围皮肤明显发红 | 严重度指示 |
| `active` | 活跃期 | 仍在恶化或稳定 | 内部状态 |
| `healing` | 愈合中 | 开始消退、脓头干燥 | 状态转变 |
| `broken` | 破损 | 已挤压或自然破裂 | 风险提示（可能留疤） |

### 应用场景

- **单颗痘追踪**：每颗痘历史记录中带上这些标签，追踪其 → 生命周期变化
- **风险告警**：`broken` 状态自动提示用户该部位更容易留疤

---

## 三、痘印 & 疤痕标签

### 痘印阶段（炎症后遗留）

| 标签 | 中文含义 | 医学名称 | 说明 | API 返回字段 |
|------|--------|--------|------|------------|
| `scar_red` / `PIE` | 红色痘印 | Post-Inflammatory Erythema | 炎症后的红斑，6-12 个月通常自愈 | count_scar_red |
| `scar_dark` / `PIH` | 深色痘印 | Post-Inflammatory Hyperpigmentation | 炎症后的色素沉着，通常 6-12 个月消退 | count_scar_dark |

### 真疤阶段（需要医学干预）

| 标签 | 中文含义 | 医学名称 | 说明 | 风险等级 |
|------|--------|--------|------|---------|
| `scar_atrophic` | 凹陷性痘疤 | Atrophic Scars | 如冰锥型、滚轮型、箱形，永久性 | 🔴 高 |
| `scar_hypertrophic` | 增生性痘疤 | Hypertrophic Scars | 凸起的疤痕，主要在胸/肩/背部 | 🔴 高 |

### 提示

- **痘印 vs 真疤**：痘印（红/黑）通常自愈；真疤需要医学干预
- **项目MVP**：暂不做精细识别 `scar_atrophic` 等，如有需要后续扩展

---

## 四、其他皮肤问题（常见伴随检测）

### 毛孔 & 肤质

| 标签 | 中文含义 | 说明 | 优先级 |
|------|--------|------|--------|
| `pore` | 毛孔（粗大） | 毛孔明显可见 | ⭐ 中 |
| `blackhead_pore` | 黑头毛孔 | 黑头聚集处的毛孔粗大 | ⭐ 低 |
| `texture` | 肤质纹理 | 皮肤粗糙、凹凸不平 | ⭐ 低 |
| `oiliness` | 出油/油光 | 过度皮脂分泌 | ⭐ 低 |
| `dryness` | 干燥 | 皮肤脱屑、紧绷 | ⭐ 低 |

### 其他常见标记

| 标签 | 中文含义 | 说明 | 优先级 |
|------|--------|------|--------|
| `redness` | 泛红/敏感 | 整体皮肤泛红 | ⭐ 低 |
| `spot` / `freckle` | 斑点/雀斑 | 非痘相关色斑 | ⭐ 低 |
| `mole` | 痣 | 黑色/褐色痣 | ⭐ 低 |
| `dark_circle` | 黑眼圈 | 眼周暗沉（通常不拍） | ⭐ 低 |
| `wrinkle` | 皱纹 | 细纹/表情纹 | ⭐ 低 |

---

## 五、标签使用规范

### 5.1 AI 视觉模型输出格式（v2：Patch-first）

**核心变化**：`acne_patches` 为必填数组，`acne_points` 为可选（仅在轻度可枚举时输出）。

```json
{
  "observation": "面部整体状态一句话（不含建议/诊断）",

  "acne_patches": [
    {
      "id": "p1",
      "region": "right_cheek",
      "bbox_norm": [0.61, 0.42, 0.78, 0.58],
      "area_ratio": 0.03,
      "coverage": "sparse|moderate|dense|confluent",
      "dominant_type": "papule|pustule|comedone|blackhead|whitehead|mixed",
      "estimated_count": 12,
      "inflammation": "none|mild|moderate|severe",
      "severity": 3,
      "description": "该区域可见中等密度红色皮损伴少量脓头。"
    }
  ],

  "acne_points": [
    {
      "id": "a1",
      "region": "chin",
      "position_hint": "下巴中央",
      "type": "pustule",
      "status": "new|inflamed|active|healing|broken",
      "severity": 3
    }
  ],

  "acne_types": {
    "count_blackhead": 0, "count_whitehead": 0, "count_comedone": 0,
    "count_papule": 0, "count_pustule": 0, "count_nodule": 0, "count_cyst": 0
  },
  "status_counts": {"new": 0, "inflamed": 0, "active": 0, "healing": 0, "broken": 0},
  "scars": {"count_scar_red": 0, "count_scar_dark": 0, "count_scar_atrophic": 0, "count_scar_hypertrophic": 0},

  "regions": {
    "forehead": {"acne_count": 0, "note": ""},
    "left_cheek": {"acne_count": 0, "note": ""},
    "right_cheek": {"acne_count": 0, "note": ""},
    "nose": {"acne_count": 0, "note": ""},
    "chin": {"acne_count": 0, "note": ""},
    "mouth_area": {"acne_count": 0, "note": ""},
    "jaw": {"acne_count": 0, "note": ""},
    "temple": {"acne_count": 0, "note": ""}
  },

  "other_concerns": {
    "pore": {"severity": "none|mild|moderate|severe", "distribution": "", "description": ""},
    "oiliness": {"severity": "none|low|medium|high", "distribution": "", "description": ""},
    "redness": {"severity": "none|mild|moderate|severe", "distribution": "", "description": ""},
    "dryness": {"severity": "none|mild|moderate|severe", "distribution": "", "description": ""},
    "sensitivity": {"severity": "none|mild|moderate|severe", "distribution": "", "description": ""},
    "texture": {"severity": "none|mild|moderate|severe", "distribution": "", "description": ""}
  },

  "overall_severity": 6,
  "skin_health_index": 65,
  "needs_doctor": false
}
```

### 5.1.1 Patch 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | `p1..pN`，用于跨日追踪引用 |
| `region` | enum | 8 大解剖分区之一 |
| `bbox_norm` | `[x1,y1,x2,y2]` | 归一化坐标（相对于整张照片，值域 0~1） |
| `area_ratio` | float | patch 占面部区域面积的比例（0~1） |
| `coverage` | enum | `sparse`（稀疏 <30%）/ `moderate`（30-60%）/ `dense`（60-85%）/ `confluent`（≥85% 融合成片） |
| `dominant_type` | enum | 该 patch 中最常见的痘类型；混合明显时用 `mixed` |
| `estimated_count` | int | 该 patch 内估计颗数；`confluent` 时可能是估算 |
| `inflammation` | enum | 该 patch 整体炎症等级 |
| `severity` | int 1-5 | 该 patch 严重度（与全脸 `overall_severity` 独立） |
| `description` | string | 纯外观描述（不含建议/诊断，模板可覆盖） |

### 5.1.2 Point 输出规则

`acne_points` **只在以下条件同时满足时输出**：
- 全脸 `estimated_count` 总和 < 10
- 所有 patch 的 `coverage` 都是 `sparse`

否则应输出**空数组** `"acne_points": []`。

理由：单颗定位在轻度用户上有意义（"你右颊那颗好了没"），在重度用户上无意义且容易错。

### 5.2 前端展示优先级

**根据数据形态自适应**：

| 场景 | 判断依据 | 展示方式 |
|------|---------|---------|
| 轻度可枚举 | `acne_points` 非空 | 每颗痘独立标记 + 单颗生命周期卡片 |
| 中/重度片状 | `acne_points` 为空 | Patch 高亮框（半透明色块）+ 区域指标卡片 |

**必显指标**：
- 主要：总严重度、皮肤指数、totale 痘数（`sum(estimated_count)`）
- 次要：Patch 数量、分布区域数、痘印数、需就医标志
- 详情：各 patch 的 coverage/inflammation/dominant_type

### 5.3 长期追踪数据结构（v2：Patch-based）

**核心变化**：追踪单位从"单颗痘"变为"区域 patch"。

```json
{
  "tracking_key": "right_cheek",
  "user_id": 1,
  "timeline": [
    {
      "date": "2026-06-15",
      "photo_id": 123,
      "patch_id": "p1",
      "coverage": "confluent",
      "dominant_type": "pustule",
      "estimated_count": 32,
      "inflammation": "severe",
      "severity": 5,
      "area_ratio": 0.08
    },
    {
      "date": "2026-06-22",
      "photo_id": 156,
      "patch_id": "p1",
      "coverage": "dense",
      "dominant_type": "papule",
      "estimated_count": 24,
      "inflammation": "moderate",
      "severity": 4,
      "area_ratio": 0.06
    },
    {
      "date": "2026-06-29",
      "photo_id": 189,
      "patch_id": "p1",
      "coverage": "moderate",
      "dominant_type": "scar_red",
      "estimated_count": 12,
      "inflammation": "mild",
      "severity": 2,
      "area_ratio": 0.05
    }
  ],
  "trend": {
    "count_delta_14d": -20,
    "coverage_trajectory": ["confluent", "dense", "moderate"],
    "type_transition": "pustule → papule → scar_red（炎症消退中）"
  }
}
```

### 5.3.1 跨日匹配算法

**不再用坐标 + 匈牙利算法**（片状病灶下没有稳定坐标可匹配）。

改用**区域标签匹配 + 特征相似度**：

1. 按 `region` 分组 patch（右颊今天的 patch vs 昨天右颊的 patch）
2. 同 region 多个 patch 时用特征向量匹配：`[bbox 中心距离, area_ratio 差, dominant_type 相同性]`
3. 匹配阈值内 → 视为同一 patch 的延续；否则视为新 patch

### 5.3.2 轻度用户的 Point 追踪

`acne_points` 存在时，继续沿用**匈牙利算法 + 坐标匹配**（原方案），单颗生命周期状态机 `new → inflamed → healing → scar`。

两条追踪路径**独立并存**：patch 主线，point 支线（仅轻度激活）。

---

---

## 六、医学指导 & 合规说明

### 6.1 痘痘类型的医学含义

- **粉刺**：毛囊皮脂腺导管堵塞，为其他痘的前驱病变
- **丘疹**：炎症反应，皮肤真皮层浅层受累
- **脓疱**：丘疹中心化脓，含白血球和细菌
- **结节/囊肿**：深层痘，波及皮下组织，高风险留下永久疤痕

### 6.2 用户告知

**严重度对照表**（用于在App中提示用户）

| 严重度 | 定义 | 建议 | 就医标准 |
|--------|------|------|---------|
| 1-2 分 | 极轻（≤5 颗，全部 sparse） | 日常清洁 + 低浓度护肤品 | — |
| 3-4 分 | 轻度（6-15 颗，patch 多为 sparse/moderate） | 加强清洁 + 局部护理 | — |
| 5-6 分 | 中度（16-30 颗，出现 dense patch） | 考虑医学护肤品（如 AHA/BHA） | 持续 2+ 周无改善 |
| 7-8 分 | 中重（31-50 颗 或 出现 confluent patch） | 建议就医评估 | **强烈建议** |
| 9-10 分 | 重度（>50 颗 或 有结节/囊肿 或 多个 confluent patch） | 必须就医 | **立即就医** |

**needs_doctor 服务端强判规则**（代码兜底，不能只靠 LLM）：

- `overall_severity >= 7` → true
- 检测到任意 `nodule / cyst` → true
- `status_counts.broken >= 3`（挤破的痘 ≥3 颗）→ true
- **任意 patch 的 `coverage == "confluent"`** → true（融合成片是重度信号）
- 上述任一命中 → OR LLM 自身判断，取真

### 6.3 合规要点

✅ **可以说**：
- "检测到约 8 颗脓疱，中度炎症"
- "发现 2 颗结节，建议就医评估"
- "2 周内新增 5 颗，趋势上升"

❌ **不能说**：
- "你是细菌性痤疮" （医学诊断）
- "用XX药膏会更快好" （药品推荐）
- "这是激素脸" （疾病判断）

---

## 七、扩展建议

### Phase 2 可添加

- **痘痘位置热力图**：自动识别高发部位（T区/两颊等）
- **痘印追踪**：红色痘印自动倒计时"预计 X 个月消退"
- **皮肤屏障评分**：基于干燥/油腻/敏感综合判断
- **生活因素关联**：痘痘爆发前的睡眠/压力/饮食模式识别

### Phase 3+ 可考虑

- **医学级疤痕检测**：细分 atrophic/hypertrophic
- **激光/医美效果追踪**：治疗前后对比
- **个人肤质建议**：基于 AI 诊断的护肤品推荐（但需法务审核）

---

## 附录：标签快速参考

```
🔴 核心标签（MVP必做）
  病灶结构（必填）：acne_patches（region + bbox + coverage + dominant_type + estimated_count + inflammation）
  单颗定位（轻度可选）：acne_points
  粉刺：blackhead, whitehead
  炎症痘：papule, pustule
  状态：new, inflamed, healing, broken
  痘印：scar_red, scar_dark
  Coverage：sparse, moderate, dense, confluent

🟡 扩展标签（后续优化）
  深层痘：nodule, cyst
  真疤：scar_atrophic, scar_hypertrophic
  伴随：pore, texture, oiliness

⚪ 暂不支持（咨询需求）
  医美效果标签
  疾病类型判断
  药物治疗标记
```

---

**最后更新**：2026-07-03（v2：patch-first 建模换轨）
**版本**：schema v2.0（vision-2.0.0）
**维护者**：Product & AI Team
**相关文档**：`project_background.md`, `dev_notes.md`
