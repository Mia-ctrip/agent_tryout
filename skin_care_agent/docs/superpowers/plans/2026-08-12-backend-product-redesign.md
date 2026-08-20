# Backend Product Redesign Implementation Plan

> **状态：SUPERSEDED，禁止继续执行。**
>
> 本计划基于已经废弃的两点阶段趋势、产品反应记忆、相似历史和旧事件模型，与当前 MVP 产品规格冲突。保留本文只用于追溯历史设计，不表示任务仍有效。
>
> 当前产品事实源：`design/product/skin_care_app_mvp_spec.md`。新的 ACTIVE 实施计划将在 MVP 产品歧义和上架基线全部确认后重新生成。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有以今日 Check-in、默认三视角、皮肤评分和开放式问答为中心的后端，迁移为支持统一趋势点、区域持续观察、真实产品使用和证据引导型个人反应记忆的 MVP 后端。

**Architecture:** 保留 FastAPI、PostgreSQL、Alembic、现有账号鉴权、存储抽象和多模型网关。新增 `RecordSession → Observation → ChangeEvent` 领域：`Observation` 是唯一趋势点，照片分析、用户状态、个人感受和产品使用是同一时间点的可选证据；原始事实先可靠保存，AI 与规则生成版本化、可失效、可重算的派生结论。

**Tech Stack:** Python 3.11、FastAPI、Pydantic v2、SQLAlchemy 2.x、PostgreSQL/JSONB、Alembic、pytest、Ruff、现有 Pillow/MediaPipe/OpenCV 与多 Provider AI gateway。

## Global Constraints

- 产品规格单一事实源：`design/product/skin_care_app_product_spec.md`，当前版本 2026-08-08。
- 照片是优先证据，不是记录成立条件；无照片、照片不可比或 AI 不可用时仍可形成趋势点。
- 一个趋势点至少包含时间、区域和当前状态；照片、产品使用和个人感受均可选。
- 照片、用户记录和两者共同支持使用同一组状态维度、同一事件时间线，不建立两套趋势。
- 用户最终确认的事实优先于模型结果；模型不得覆盖或伪装成用户输入。
- 同区域默认续接 primary active 事件；用户主动拆分时允许 parallel active 事件。
- 个人趋势摘要要求同一区域至少 2 个有效趋势点且间隔不少于 7 天。
- 照片比较结论额外要求同一区域至少 2 张可比较照片；照片不足只限制视觉结论。
- 同一产品或组合至少 3 段有效独立事件才有资格形成个人规律；矛盾或混杂证据必须保留。
- 允许给出观察、补全信息、回顾历史和准备专业咨询的下一步建议；禁止选择具体产品、再次使用、停换药、剂量、频次、组合或疗程建议。
- 不诊断疾病或病因，不输出医学皮损分类、严重度、皮肤评分、置信度、疗效、适合度或因果结论。
- 原始照片不可变；裁切、关注位置、标准化、遮挡和特征均保存为独立覆盖层或派生副本。
- 外部 AI Provider 只有在明确满足不训练用户照片和受限留存要求时才可启用。
- 所有资源按 `user_id` 隔离；跨用户访问统一返回 404。
- 生活背景 MVP 只保存和回顾，不生成跨日生活线索。
- 不新增依赖，除非实施时单独获得用户批准。

---

## 1. 领域边界

| 模块 | 职责 | 主要输出 |
|---|---|---|
| API 契约 | 统一错误、trace、游标、ETag、幂等 | `ErrorEnvelope`、`CursorPage` |
| 鉴权与能力授权 | Bearer 会话、总协议、照片和 AI 独立授权 | capability gate |
| 记录会话 | 组织一次拍摄或无照片记录流程 | `RecordSession` |
| 统一趋势点 | 合并照片事实、用户状态、感受和使用关系 | `Observation` |
| 关注位置 | 点选或圈选用户最关注位置 | 不可变坐标覆盖层 |
| 区域持续观察 | 默认续接、暂停、恢复、主动拆分 | `ChangeEvent` |
| 安全 AI | 区域建议、可见事实、可比性、趋势与决策支持 | 版本化派生结果 |
| 产品库与产品柜 | 标准版本、临时产品、匹配纠正 | `CatalogProduct`、`UserProduct` |
| 真实使用 | 单品或组合、发生时间、趋势点/事件关联 | `ProductUsage` |
| 生活背景 | 变化日和平稳日原始背景 | `DailyContext` |
| 提醒 | 用户自选的一次性观察提醒 | `Reminder` |
| 历史与记忆 | 趋势摘要、相似历史、产品反应记忆 | 四段式决策支持 |
| 数据控制 | 主动揭图、导出、删除、重算、备份恢复 | job 与审计 |
| 兼容迁移 | 旧 Check-in 只读回填与 API 退役 | legacy mapping |

## 2. 核心数据模型

### 2.1 原始事实

| 表 | 关键字段和约束 |
|---|---|
| `record_sessions` | `user_id, mode(change/full), occurred_at, timezone, status(draft/saved/deleted), analysis_status, legacy_check_in_id` |
| `observations` | `record_session_id, user_id, event_id NULL, occurred_at, region_code, status_source, overall_state, attribution_status, row_version`；一个 change record 恰好一个 observation |
| `observation_focus_marks` | `observation_id, kind(point/polygon), normalized_points JSONB, source(user), created_at`；坐标限定 0 到 1 |
| `observation_fact_assertions` | `observation_id, dimension, value, source(photo/user/combined), ai_result_id NULL, user_confirmed_at NULL, superseded_at NULL` |
| `observation_fact_revisions` | `assertion_id, old_value, new_value, actor(user/system), reason, created_at`；只追加 |
| `observation_feelings` | `observation_id UNIQUE, state(recorded/none/not_recorded), tags[], note`；只来自用户 |
| `change_events` | `user_id, region_code, role(primary/parallel), status(active/paused/stopped), split_from_event_id NULL, started_at, last_observed_at, row_version` |
| `observation_attribution_audits` | `observation_id, old_event_id NULL, new_event_id NULL, actor, reason, created_at` |
| `photos` 调整 | 新增 `record_session_id, sha256, original_storage_key, capture_meta, evidence_status, observation_eligible, comparison_eligible, legacy_comparison_approved_at NULL` |

`region_code` 固定为 `forehead`、`nose`、`left_cheek`、`right_cheek`、`left_temple`、`right_temple`、`mouth_area`、`chin`、`jaw`。无法确认时 observation 可先以 `attribution_status=unclassified` 保存，但用户完成无照片记录前必须选择一个区域。

`overall_state` 固定为 `easing`、`more_visible`、`stable`、`mixed`、`insufficient`。它是条件性的个人趋势方向，不是医学好转、恶化或严重度。

### 2.2 产品和用户事实

| 表 | 关键字段和约束 |
|---|---|
| `catalog_products` | 品牌、名称、类别、浓度、规格、剂型、市场、规范化版本键、审核状态 |
| `product_submissions` | 用户名称、包装图、状态、匹配标准产品 |
| `user_products` | 标准/临时产品引用、展示名、状态、个人备注 |
| `product_usages` | 用户、发生时间、区域状态、组合键、备注 |
| `product_usage_items` | usage 与 user product 多对多；组合内不得重复 |
| `observation_usage_links` | usage 与具体趋势点关系；`link_source=user` |
| `event_usage_links` | usage 与事件关系；只由用户确认 |
| `event_product_states` | `usage_recorded/none_yet/not_recorded/cannot_recall` |
| `daily_contexts` | 用户、本地日期、时区、变化/平稳日、明确提交的分类 |
| `reminders` | event/full-record、时间、scheduled/sent/cancelled |
| `user_recording_preferences` | 完整记录介绍是否展示、提醒偏好 |

### 2.3 派生数据

| 表 | 关键字段和约束 |
|---|---|
| `observation_ai_results` | 输入 hash、schema/model/rule 版本、区域候选、可见事实、blocked 信息 |
| `photo_features` | photo、版本、特征 payload、失效时间；MVP 不新增 pgvector 依赖 |
| `personal_trend_summaries` | event、两个以上趋势点、方向、support_source、依据、边界、版本 |
| `photo_comparison_summaries` | event、两张以上可比较照片、视觉维度、版本 |
| `similar_history_matches` | 当前 observation、候选 event、排序、不像反馈、失效时间；不返回分数 |
| `similar_history_summaries` | 当前 observation、候选集合、四段式 payload、输入版本和失效时间 |
| `product_memories` | product/combo、starting/signals/pattern、四段式 payload、版本 |
| `product_memory_evidence` | memory、event、trend summary、usage 的证据边 |
| `outbox_jobs` | 派生、提醒、删除、导出的可靠后台任务 |
| `export_jobs`、`erasure_jobs` | 用户数据权利任务和稳定错误码 |

### 2.4 数据库不变量

- 每个用户和区域最多一个 `role=primary,status=active` 事件。
- parallel active 必须有 `split_from_event_id`，且只能由显式用户操作创建。
- 新 observation 默认附着 primary active；parallel 不参与自动归属。
- 用户事实与 AI 事实分行保存；用户确认后 AI 不能覆盖同一 dimension。
- 一个趋势点无照片时仍合法，但必须有 region 和至少一个用户状态 assertion。
- 旧照片回填后默认 `comparison_eligible=false`；只有完整质量元数据审计后才可提升。
- 组合证据只进入 combo memory，不拆给单品。
- 源事实删除或修正必须同步失效依赖它的摘要、匹配和记忆。

## 3. 横切接口契约

### 3.1 鉴权与授权

- 新接口统一位于 `/api/v1`。
- 除健康检查、注册、登录和 refresh 外，均要求 Bearer access token。
- 业务接口要求总协议；照片写入/读取要求 `photo_storage`，AI 派生要求 `ai_analysis`。
- AI 未授权不影响无照片记录、用户事实、产品柜、使用、感受和生活背景。
- Provider 配置必须包含 `training_disabled=true`、`retention_days`、`processing_region` 和法务审核版本；不符合者不进入路由。

### 3.2 幂等、并发与分页

- 创建 record、finalize、事件归属/拆分、临时产品、usage、提醒、导出和删除必须带 UUID `Idempotency-Key`。
- 请求 hash 覆盖 method、path、canonical JSON 和文件 SHA-256。
- 同 key 同 hash 回放原响应；同 key 不同 hash 返回 `409 IDEMPOTENCY_KEY_REUSED`。
- 状态变更使用 `ETag` 和 `If-Match`；版本不一致返回 `412 VERSION_CONFLICT`。
- 列表默认 20、最大 100，按 `sort_time DESC,id DESC` 的签名 seek cursor 分页，禁止 offset。

### 3.3 统一错误

```json
{
  error: {
    code: EVENT_ATTRIBUTION_REQUIRED,
    message: 需要确认这次记录属于哪段观察,
    details: {choices: [resume, new_primary, unclassified]},
    trace_id: 01J4W3W8A3HB9N4Q6M2KS7V5TZ
  }
}
```

| HTTP | 错误码 | 场景 |
|---|---|---|
| 400 | `REQUEST_INVALID`、`CURSOR_INVALID`、`CURSOR_FILTER_MISMATCH` | 非字段业务错误 |
| 400 | `IMAGE_UNREADABLE`、`FILE_EMPTY` | 文件无法成为原始证据 |
| 401 | `AUTH_REQUIRED`、`AUTH_TOKEN_INVALID` | 登录态无效 |
| 403 | `REQUIRED_CONSENT_MISSING`、`PHOTO_CONSENT_REQUIRED`、`AI_CONSENT_REQUIRED` | 授权不足 |
| 404 | `RESOURCE_NOT_FOUND` | 不存在、已删或跨用户 |
| 409 | `IDEMPOTENCY_KEY_REUSED`、`RESOURCE_STATE_CONFLICT`、`PRIMARY_EVENT_EXISTS` | 写冲突 |
| 412 | `VERSION_CONFLICT` | ETag 过期 |
| 413/415 | `FILE_TOO_LARGE`、`FILE_TYPE_UNSUPPORTED` | 上传边界 |
| 422 | `VALIDATION_ERROR`、`EVENT_ATTRIBUTION_REQUIRED` | 结构或归属待确认 |
| 429 | `AI_QUOTA_EXCEEDED` | 事实已保存，AI 未生成 |
| 503 | `STORAGE_UNAVAILABLE` | 核心事实未可靠保存 |
| 503 | `AI_UNAVAILABLE` | 仅 AI 重试接口；记录保存返回 degraded |
| 500 | `INTERNAL_ERROR` | 不泄露内部细节 |

## 4. 接口清单

### 4.1 授权和能力

| 方法与路径 | 请求 | 响应 |
|---|---|---|
| `GET /me/consents` | 无 | 各能力授权状态和版本 |
| `PUT /me/consents/{type}` | `{version,accepted,source,app_version}` | 新授权事实 |
| `DELETE /me/consents/{type}` | 无 | 204 |

### 4.2 记录和统一趋势点

| 方法与路径 | 请求 | 响应 |
|---|---|---|
| `POST /records` | `{mode,occurred_at,timezone}` | 201 Record |
| `POST /records/{id}/photos` | multipart `file,taken_at,view_type` | 201 PhotoEvidence；质量差仍保存 |
| `PUT /records/{id}/observation` | `ObservationDraftPut` | observation 草稿 |
| `POST /records/{id}/finalize` | `{ai_requested}` | 200 RecordResult |
| `GET /records/{id}` | 无 | RecordResult |
| `DELETE /records/{id}` | `If-Match` | 202 ErasureJob |
| `PUT /observations/{id}/facts` | 完整替换用户确认事实 | Observation |
| `POST /observations/{id}/focus-marks` | 点或多边形归一化坐标 | 201 FocusMark |
| `DELETE /observations/{id}/focus-marks/{mark_id}` | 无 | 204 |
| `POST /observations/{id}/attribution` | attach/resume/new-primary/unclassified | Observation + Event |
| `POST /observations/{id}/split-event` | `{reason:user_separate_change}` | parallel Event |
| `POST /observations/{id}/move` | `{target_event_id}` + `If-Match` | Observation |
| `POST /observations/{id}/analysis-retry` | 无 | 202 queued |
| `GET /photos/{id}/url?purpose=evidence` | 无 | 15 分钟签名 URL |

`ObservationDraftPut`：

```json
{
  region_code: left_cheek,
  overall_state: mixed,
  assertions: [
    {dimension: redness, value: smaller, source: user},
    {dimension: new_visible_change, value: present, source: user}
  ],
  feeling: {state: recorded, tags: [stinging], note: null},
  focus_marks: [
    {kind: point, normalized_points: [{x: 0.35, y: 0.58}]}
  ]
}
```

无照片 finalize 成功示例：

```json
{
  record_id: 501,
  status: saved,
  analysis_status: not_requested,
  observation: {
    observation_id: 801,
    event_id: 301,
    region_code: left_cheek,
    overall_state: mixed,
    support_source: user,
    photo_evidence: {present: false, comparison_eligible: false},
    card: {
      noticed: [你记录了左脸颊的当前状态],
      photo_facts: [],
      known: [泛红范围较小, 出现新的可见变化],
      unknown: [本次没有照片依据，暂不进行照片比较]
    }
  }
}
```

照片和用户补充都存在时，同一 dimension 的最终值选择顺序为：用户显式纠正 > 用户确认的模型值 > 未确认模型值。响应必须保留每项 `source`，不得另外生成手动趋势。

### 4.3 事件、趋势和提醒

| 方法与路径 | 请求/查询 | 响应 |
|---|---|---|
| `GET /events` | status、region、cursor、limit | EventSummary page |
| `GET /events/{id}` | 无 | 四段式 EventDetail，不嵌入原图 URL |
| `POST /events/{id}/pause` | `If-Match` | Event |
| `POST /events/{id}/resume` | `If-Match` | Event |
| `POST /events/{id}/stop` | `If-Match` | Event |
| `GET /events/{id}/trend-summary` | 无 | PersonalTrendSummary |
| `GET /events/{id}/photo-comparison` | 无 | PhotoComparisonSummary |
| `GET /history` | region、cursor、limit | EventSummary page |
| `GET /trends/regions` | from、to、region | RegionTrend page |
| `POST /events/{id}/reminders` | tomorrow/3d/7d/custom | 201 Reminder |
| `DELETE /events/{id}/reminders/current` | 无 | 204 |
| `GET /me/recording-preferences` | 无 | RecordingPreferences |
| `PUT /me/recording-preferences` | 完整记录介绍/提醒偏好 | RecordingPreferences |

统一趋势摘要：

```json
{
  status: ready,
  conclusion: {
    direction: mixed,
    text: 最近的记录变化混合。
  },
  rationale: {
    support_source: combined,
    observation_count: 3,
    dimensions: [
      {name: redness, direction: easing, source: photo},
      {name: new_visible_change, direction: more_visible, source: user}
    ]
  },
  reference_value: {
    level: limited,
    similarities: [区域一致],
    differences: [其中一次没有照片],
    unknown_factors: [一次产品使用区域未记录]
  },
  next_steps: [
    {
      type: complete_missing_fact,
      text: 下一次可以优先补充同一区域状态和实际使用。,
      based_on: [usage_region_unknown]
    }
  ],
  disclaimer: 这是对个人记录的整理，不代表医学诊断、疗效或治疗建议。
}
```

### 4.4 产品、使用和匹配纠正

| 方法与路径 | 请求/查询 | 响应 |
|---|---|---|
| `GET /catalog/products` | q、category、market、cursor | CatalogProduct page |
| `GET /catalog/products/{id}` | 无 | CatalogProduct |
| `POST /product-submissions` | 名称、可选包装图 | Submission + UserProduct |
| `GET /me/products` | status、cursor | UserProduct page |
| `POST /me/products` | `{catalog_product_id}` | 201 UserProduct |
| `GET /me/products/{id}` | 无 | ProductDetail + memory |
| `PATCH /me/products/{id}` | note、archived | UserProduct |
| `POST /me/products/{id}/match-corrections` | `{suggested_catalog_product_id,reason}` | 201 correction |
| `POST /usages` | 时间、区域、items、note | 201 Usage |
| `GET /usages` | from、to、event、cursor | Usage page |
| `POST /usages/{id}/observation-links` | `{observation_id}` | 201 Link |
| `DELETE /usages/{id}/observation-links/{observation_id}` | 无 | 204 |
| `POST /usages/{id}/event-links` | `{event_id}` | 201 Link |
| `DELETE /usages/{id}/event-links/{event_id}` | 无 | 204 |
| `PUT /events/{id}/product-state` | 四态之一 | EventProductState |

系统可根据时间和区域返回 `suggested_links`，但只能由用户调用 link 接口确认。组合生成稳定 `combo_key`，不拆分归因。

### 4.5 生活背景、相似历史和产品记忆

| 方法与路径 | 请求/查询 | 响应 |
|---|---|---|
| `PUT /daily-contexts/{date}` | timezone、day_kind、entries | DailyContext |
| `GET /daily-contexts/{date}` | 无 | DailyContext |
| `GET /daily-contexts` | from、to、cursor | DailyContext page |
| `DELETE /daily-contexts/{date}` | 无 | 204 |
| `GET /events/{id}/contexts` | 无 | 时间窗口内背景，只读组织 |
| `GET /observations/{id}/similar-history` | cursor、limit | SimilarHistoryOut：四段式 decision_support + SimilarCandidate page |
| `POST /observations/{id}/similar-history/{event_id}/dismiss` | 无 | 204 |
| `GET /me/products/{id}/memory` | 无 | ProductMemory |
| `GET /product-memories/combos/{combo_key}` | 无 | ProductMemory |

SimilarHistoryOut 和 ProductMemory 都使用与趋势摘要相同的 `conclusion/rationale/reference_value/next_steps/disclaimer` 结构；相似历史另外返回候选事件分页，产品记忆增加 `evidence_state`、独立事件数量、趋势方向分布和不适记录。不得包含“有效”“适合”“优先尝试”或“再次使用”。

所有四段式输出可选返回 `follow_up_question`，结构为 `{dimension,prompt,options}`。仅当一个缺失事实会改变当前结论或下一步时返回，单次响应最多一个；否则必须为 `null`，不得把开放式聊天作为记录前置条件。

### 4.6 数据控制

| 方法与路径 | 请求 | 响应 |
|---|---|---|
| `POST /me/exports` | `{format:zip-json-v1}` | 202 ExportJob |
| `GET /me/exports/{id}` | 无 | 状态和短期 URL |
| `POST /me/erasures` | photo/record/account、复验证明 | 202 ErasureJob |
| `GET /me/erasures/{id}` | 无 | ErasureJob |
| `GET /me/data-retention` | 无 | 活动数据、AI 和备份保留说明 |

## 5. 状态机

### 5.1 事件

```text
primary active --30 天无趋势点--> paused
primary active --用户停止--> stopped
paused/stopped --用户恢复且无 primary active--> primary active
primary active --用户主动拆分某趋势点--> primary active + parallel active
parallel active --用户停止或 30 天无趋势点--> stopped 或 paused
任何事件 --删除--> erasure_pending --> deleted
```

- 自动归属只选择 primary active。
- parallel 创建必须有用户操作、来源 observation 和 split reason。
- 不定义 resolved、cured、failed。

### 5.2 记录与 AI

```text
record: draft -> saved -> erasure_pending -> deleted
analysis: not_requested | not_authorized -> queued -> processing -> ready
                                            -> degraded -> queued（用户重试）
attribution: pending -> attached_primary | resumed | new_primary | unclassified
                         -> split_parallel | reassigned
```

`saved` 只表示核心事实可靠持久化。照片上传、AI 派生和卡片生成必须分别暴露状态。

### 5.3 派生证据

```text
personal trend: not_eligible -> ready（>=2 有效趋势点且 >=7 天）
photo comparison: not_eligible -> ready（>=2 可比较照片且 >=7 天）
memory: starting -> signals -> pattern
memory: pattern -> signals -> starting（源证据删除或更正）
```

- `starting`：1 段有效事件或少量使用事实。
- `signals`：2 段；或更多记录存在矛盾、不可比、组合差异或未知因素。
- `pattern`：至少 3 段有效独立事件，使用明确且趋势倾向相近。
- 视觉规律必须有可比较照片；仅用户记录支持时只能表述个人记录中的时间关联。

### 5.4 后台任务、产品和授权

```text
job: queued -> running -> succeeded | failed
reminder: scheduled -> sent | cancelled
submission: pending -> matched | rejected
user product: info_pending -> active | merged
user product: active <-> archived
consent: missing -> active -> revoked -> active
```

提醒只投递一次；授权接受和撤回只追加事实；临时产品匹配标准版本时不改写历史使用。

## 6. 数据库迁移顺序

1. `0013_contract_foundation.py`：幂等表、统一授权类型、Provider 合规配置表。
2. `0014_observation_domain.py`：record、observation、focus mark、fact assertion/revision、feeling、event、归属审计和 photos 扩展。
3. `0015_products_usages.py`：产品库、提交、产品柜、匹配纠正、usage 与 observation/event links。
4. `0016_contexts_reminders.py`：生活背景、用户记录偏好和一次性提醒。
5. `0017_derived_evidence.py`：AI 结果、照片特征、两类摘要、相似匹配、产品记忆、证据边和 outbox。
6. `0018_data_control.py`：导出、删除和数据保留任务。
7. `0019_legacy_backfill.py`：旧 Check-in 映射；旧照片默认不可比较，旧评分不迁入新结论。

每个迁移必须执行空库 `upgrade head → downgrade -1 → upgrade head`。0019 downgrade 只删除新映射，不修改旧原始行。

## 7. 实施文件结构

```text
backend/app/
├── api/
│   ├── records.py
│   ├── events.py
│   ├── products.py
│   ├── usages.py
│   ├── daily_contexts.py
│   └── data_control.py
├── models/
│   ├── idempotency.py
│   ├── record.py
│   ├── change_event.py
│   ├── product.py
│   ├── product_usage.py
│   ├── daily_context.py
│   ├── reminder.py
│   ├── derived_evidence.py
│   └── data_job.py
├── schemas/
│   ├── common.py
│   ├── record.py
│   ├── event.py
│   ├── product.py
│   ├── usage.py
│   ├── daily_context.py
│   ├── decision_support.py
│   └── data_control.py
├── services/
│   ├── idempotency_service.py
│   ├── record_service.py
│   ├── event_service.py
│   ├── fact_merge_service.py
│   ├── observation_ai_service.py
│   ├── product_service.py
│   ├── usage_service.py
│   ├── context_service.py
│   ├── trend_service.py
│   ├── similar_history_service.py
│   ├── product_memory_service.py
│   └── data_control_service.py
└── workers/
    ├── derivation_worker.py
    ├── reminder_worker.py
    └── data_control_worker.py
```

## 8. 开发顺序

### Task 1: API 契约、幂等和能力授权

**Files:**
- Create: `backend/app/schemas/common.py`
- Create: `backend/app/models/idempotency.py`
- Create: `backend/app/services/idempotency_service.py`
- Create: `backend/app/db/migrations/versions/0013_contract_foundation.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/services/consent_service.py`
- Test: `backend/tests/contract/test_errors.py`
- Test: `backend/tests/contract/test_pagination.py`
- Test: `backend/tests/contract/test_idempotency.py`

**Interfaces:**
- Produces: `ApiError`、`CursorPage[T]`、`execute_idempotent()`、`require_capability_consent()`。
- Consumes: 现有 AuthContext、UserConsent、trace id 和数据库 Session。

- [ ] **Step 1: 写失败测试**

```python
def test_validation_error_uses_stable_envelope(client, auth_headers):
    response = client.post(/api/v1/records, json={}, headers=auth_headers)
    assert response.status_code == 422
    assert response.json()[error][code] == VALIDATION_ERROR
    assert response.json()[error][trace_id]
```

另写同幂等键回放、不同请求体 409、cursor 不能跨筛选复用、撤回 AI 授权仍可写用户事实的测试。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/contract -q`

Expected: FAIL，当前仍使用 FastAPI 默认错误并缺少通用幂等表。

- [ ] **Step 3: 实现最小契约**

```python
class ApiError(Exception):
    def __init__(self, code: str, message: str, status_code: int, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
```

使用唯一约束原子抢占幂等键；HMAC cursor 绑定排序值、ID 和 filter hash。

- [ ] **Step 4: 运行测试和迁移往返**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/contract -q`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Run: `cd backend; .venv\Scripts\alembic.exe downgrade 0012_app_foundation`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

Commit: `git commit -m 'feat(backend): add stable contracts and capability consent'`

### Task 2: 统一趋势点和事件基础模型

**Files:**
- Create: `backend/app/models/record.py`
- Create: `backend/app/models/change_event.py`
- Create: `backend/app/schemas/record.py`
- Create: `backend/app/schemas/event.py`
- Create: `backend/app/db/migrations/versions/0014_observation_domain.py`
- Modify: `backend/app/models/photo.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/unit/test_observation_model.py`
- Test: `backend/tests/unit/test_event_state.py`

**Interfaces:**
- Produces: RecordSession、Observation、FocusMark、FactAssertion、FactRevision、ObservationFeeling、ChangeEvent。
- Consumes: User、Photo 和基础 mixin。

- [ ] **Step 1: 写数据库不变量测试**

```python
def test_manual_observation_requires_region_and_user_fact(db, user):
    observation = make_observation(user_id=user.id, region_code=None, photo_count=0, assertion_count=0)
    db.add(observation)
    with pytest.raises(IntegrityError):
        db.commit()
```

另测每区域只允许一个 primary active、parallel 必须有 split source、关注坐标必须位于 0 到 1、非法医学状态不能入库。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_observation_model.py tests/unit/test_event_state.py -q`

Expected: FAIL，模型尚不存在。

- [ ] **Step 3: 实现模型和 0014**

数据库使用 CHECK 约束固定枚举；primary active 使用 partial unique index，parallel 不受该索引限制。回填 `original_storage_key=storage_key`，历史照片 comparison eligibility 默认 false。

- [ ] **Step 4: 验证模型和迁移**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_observation_model.py tests/unit/test_event_state.py -q`

Run: `cd backend; .venv\Scripts\alembic.exe downgrade 0013_contract_foundation`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: PASS。

- [ ] **Step 5: 提交**

Commit: `git commit -m 'feat(backend): add unified observation domain'`

### Task 3: 有照片和无照片的记录闭环

**Files:**
- Create: `backend/app/services/record_service.py`
- Create: `backend/app/api/records.py`
- Modify: `backend/app/services/vision/quality.py`
- Modify: `backend/app/services/vision/normalization.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/integration/test_records.py`
- Test: `backend/tests/test_photos.py`

**Interfaces:**
- Produces: `create_record()`、`store_record_photo()`、`replace_observation_draft()`、`finalize_record()`。
- Consumes: Tasks 1-2、现有 storage、quality 和 normalization。

- [ ] **Step 1: 写两条记录路径的失败测试**

```python
def test_manual_record_saves_without_photo(client, app_headers):
    record = create_record(client, app_headers)
    put_manual_state(client, app_headers, record[record_id], region=left_cheek, state=mixed)
    response = finalize_record(client, app_headers, record[record_id])
    assert response.status_code == 200
    assert response.json()[observation][support_source] == user
    assert response.json()[observation][photo_evidence][present] is False
```

另测模糊照片仍 201、坏文件不创建对象、有照片不可比时可由用户补足状态、AI 未授权仍保存。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_records.py tests/test_photos.py -q`

Expected: FAIL，新 API 尚不存在。

- [ ] **Step 3: 实现事实优先事务**

照片路径先可靠存储原图；无照片路径要求区域和用户状态。Finalize 在同一事务保存 observation、用户 assertions、focus marks、归属决策和 outbox，然后返回 saved，不等待 AI。

- [ ] **Step 4: 实现四段“这次变化卡”事实结构**

冷启动卡固定返回 `noticed/photo_facts/known/unknown`。没有照片或 AI 时数组可以为空，但不得生成虚构照片观察。

- [ ] **Step 5: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_records.py tests/test_photos.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): support photo and manual observation records'`

### Task 4: 默认续接、暂停恢复和用户主动拆分

**Files:**
- Create: `backend/app/services/event_service.py`
- Create: `backend/app/api/events.py`
- Modify: `backend/app/api/records.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/integration/test_events.py`
- Test: `backend/tests/unit/test_event_state.py`

**Interfaces:**
- Produces: `decide_attribution()`、`split_parallel_event()`、`pause_stale_events()`、`move_observation()`。
- Consumes: Observation、ChangeEvent、ETag 和 outbox。

- [ ] **Step 1: 写归属和并行事件测试**

```python
def test_user_split_creates_parallel_without_replacing_primary(db, primary_event, observation):
    parallel = split_parallel_event(db, observation=observation, actor_user_id=primary_event.user_id)
    assert parallel.role == parallel
    assert parallel.split_from_event_id == primary_event.id
    assert primary_event.status == active
```

另测新观察默认只进 primary、paused 要用户确认、并发只能创建一个 primary、30 天自动暂停、改归属触发派生失效。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_events.py tests/unit/test_event_state.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现行锁、状态机和审计**

创建 primary 时锁同用户同区域行并处理唯一冲突。split 只能由用户接口创建；自动归属查询排除 parallel。

- [ ] **Step 4: 运行并发和状态测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_events.py tests/unit/test_event_state.py -q`

Expected: PASS。

- [ ] **Step 5: 提交**

Commit: `git commit -m 'feat(backend): add primary and user-split event lifecycle'`

### Task 5: 安全照片观察与用户事实合并

**Files:**
- Create: `backend/app/services/fact_merge_service.py`
- Create: `backend/app/services/observation_ai_service.py`
- Modify: `backend/app/services/ai_gateway/prompts.py`
- Modify: `backend/app/services/ai_gateway/schema.py`
- Modify: `backend/app/services/ai_gateway/compliance.py`
- Modify: `backend/app/api/records.py`
- Test: `backend/tests/unit/test_fact_merge_service.py`
- Test: `backend/tests/unit/test_observation_ai_service.py`

**Interfaces:**
- Produces: `ObservationAIResultV2`、`merge_assertions()`、`derive_photo_facts()`。
- Consumes: 原图、质量结果、用户 assertions、AI gateway 和 capability consent。

- [ ] **Step 1: 写来源优先级和合规测试**

```python
def test_user_revision_wins_over_newer_ai_result():
    merged = merge_assertions(
        ai_values={redness: larger},
        user_values={redness: smaller},
        confirmed_dimensions={redness},
    )
    assert merged[redness].value == smaller
    assert merged[redness].source == user
```

另测医学皮损词、严重度、评分和治疗建议被 blocked；AI timeout 不改变 saved；模型不能给无照片记录制造 photo source。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_fact_merge_service.py tests/unit/test_observation_ai_service.py -q`

Expected: FAIL。

- [ ] **Step 3: 定义固定输出**

```python
class ObservationAIResultV2(BaseModel):
    region_candidates: list[RegionCandidate]
    visible_assertions: list[VisibleAssertion]
    comparison_eligibility: ComparisonEligibility
    blocked: bool = False
    blocked_reason: str | None = None
```

Public schema 不含痘型、数量、severity、skin index、needs doctor。Prompt、schema、规则和模型路由版本必须进入 input hash。

- [ ] **Step 4: 实现合并与修订审计**

用户纠正写 FactRevision 并 supersede 旧 assertion；AI 重算只能新增 AI assertion，不能更新用户行。

- [ ] **Step 5: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_fact_merge_service.py tests/unit/test_observation_ai_service.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): merge safe photo facts with user assertions'`

### Task 6: 产品库、产品柜和匹配纠正

**Files:**
- Create: `backend/app/models/product.py`
- Create: `backend/app/schemas/product.py`
- Create: `backend/app/services/product_service.py`
- Create: `backend/app/api/products.py`
- Create: `backend/app/db/migrations/versions/0015_products_usages.py`
- Test: `backend/tests/integration/test_products.py`

**Interfaces:**
- Produces: catalog search、temporary product、cabinet、match correction。
- Consumes: cursor、idempotency 和可选包装照片。

- [ ] **Step 1: 写产品版本和纠错测试**

```python
def test_match_correction_does_not_rewrite_existing_usage(db, user_product, usage):
    correction = request_match_correction(
        db,
        user_product=user_product,
        suggested_catalog_product_id=42,
        reason=wrong_concentration,
    )
    assert correction.status == pending
    assert usage.items[0].user_product_id == user_product.id
```

另测同名不同浓度/剂型是不同 catalog 行、重复入柜 409、临时产品立即可用于 usage、包装识别不能直接写 catalog。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_products.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现模型、迁移和 API**

标准版本键覆盖品牌、名称、浓度、规格和剂型。纠错创建审核请求；平台匹配只更新 user product 引用，不改写历史事实。

- [ ] **Step 4: 运行测试和迁移**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_products.py -q`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: PASS。

- [ ] **Step 5: 提交**

Commit: `git commit -m 'feat(backend): add product catalog cabinet and corrections'`

### Task 7: 真实使用与趋势点关联

**Files:**
- Create: `backend/app/models/product_usage.py`
- Create: `backend/app/schemas/usage.py`
- Create: `backend/app/services/usage_service.py`
- Create: `backend/app/api/usages.py`
- Modify: `backend/app/api/events.py`
- Test: `backend/tests/integration/test_usages.py`

**Interfaces:**
- Produces: `record_usage()`、`suggest_usage_links()`、`link_usage_to_observation()`、`link_usage_to_event()`。
- Consumes: user products、observations 和 events。

- [ ] **Step 1: 写独立使用、组合和建议关联测试**

```python
def test_suggested_link_never_creates_persisted_link(db, usage, observation):
    suggestions = suggest_usage_links(db, usage=usage)
    assert suggestions[0].observation_id == observation.id
    assert count_persisted_observation_links(db, usage.id) == 0
```

另测无照片/事件可保存、同一组合生成稳定 combo key、组合不进入单品证据、区域未知不作为否定、用户可关联同一时间点。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_usages.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现时间和区域候选规则**

候选只使用明确配置的时间窗口和区域相等/未知规则；返回推荐关联理由，不落库。实际 link 接口必须带用户身份和幂等键。

- [ ] **Step 4: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_usages.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): link actual usage to unified observations'`

### Task 8: 生活背景与一次性提醒

**Files:**
- Create: `backend/app/models/daily_context.py`
- Create: `backend/app/models/reminder.py`
- Create: `backend/app/schemas/daily_context.py`
- Create: `backend/app/services/context_service.py`
- Create: `backend/app/services/reminder_service.py`
- Create: `backend/app/api/daily_contexts.py`
- Create: `backend/app/workers/reminder_worker.py`
- Create: `backend/app/db/migrations/versions/0016_contexts_reminders.py`
- Test: `backend/tests/integration/test_daily_contexts.py`
- Test: `backend/tests/unit/test_reminder_service.py`

**Interfaces:**
- Produces: daily context CRUD、事件时间窗口组织、单次 reminder。
- Consumes: timezone、event 时间范围和 push adapter。

- [ ] **Step 1: 写缺失语义和提醒测试**

```python
def test_missing_context_category_is_not_converted_to_none(client, app_headers):
    response = client.put(
        /api/v1/daily-contexts/2026-08-12,
        headers=app_headers,
        json={timezone: Asia/Shanghai, day_kind: stable, entries: {}},
    )
    assert response.json()[entries] == {}
```

另测 none/unknown 分离、stable 必须用户显式选择、context 只读组织不生成跨日线索、sent reminder 永不重投。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_daily_contexts.py tests/unit/test_reminder_service.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现模型、worker 和时间窗口读取**

Reminder 的 preset 在用户 timezone 转 UTC；事件 contexts 接口按日期交叠组织，不创建永久自动关联，也不生成因果。

- [ ] **Step 4: 运行测试和迁移并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_daily_contexts.py tests/unit/test_reminder_service.py -q`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: PASS。

Commit: `git commit -m 'feat(backend): add optional contexts and one-time reminders'`

### Task 9: 两类摘要与条件性趋势方向

**Files:**
- Create: `backend/app/models/derived_evidence.py`
- Create: `backend/app/schemas/decision_support.py`
- Create: `backend/app/services/trend_service.py`
- Create: `backend/app/workers/derivation_worker.py`
- Create: `backend/app/db/migrations/versions/0017_derived_evidence.py`
- Modify: `backend/app/api/events.py`
- Test: `backend/tests/unit/test_trend_service.py`
- Test: `backend/tests/integration/test_trend_summaries.py`

**Interfaces:**
- Produces: `personal_trend_eligibility()`、`photo_comparison_eligibility()`、`derive_direction()`、`DecisionSupportOut`。
- Consumes: assertions、照片资格、usage links、事件和 outbox。

- [ ] **Step 1: 写门槛分离测试**

```python
def test_two_manual_points_enable_personal_trend_but_not_photo_comparison():
    evidence = two_manual_points(days_apart=7)
    assert personal_trend_eligibility(evidence).eligible is True
    assert photo_comparison_eligibility(evidence).eligible is False
```

另测两张不可比照片不能生成视觉结论、照片不可比但用户状态可形成趋势、方向 mixed 保留相反维度、不足信息返回 insufficient。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_trend_service.py tests/integration/test_trend_summaries.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现确定性门槛和方向聚合**

门槛由规则层决定；AI 只把已通过门槛的结构化依据组织成文案。每个结论保存 support source、输入 IDs、规则版本、矛盾和未知因素。

- [ ] **Step 4: 实现安全下一步枚举**

`DecisionSupportOut.next_steps[].type` 只接受 `continue_observing`、`complete_missing_fact`、`review_history`、`prepare_professional_consultation`；每项必须包含非空 `based_on`。

- [ ] **Step 5: 运行测试和迁移并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_trend_service.py tests/integration/test_trend_summaries.py -q`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: PASS。

Commit: `git commit -m 'feat(backend): derive source-aware personal trends'`

### Task 10: 相似历史

**Files:**
- Create: `backend/app/services/similar_history_service.py`
- Modify: `backend/app/api/events.py`
- Modify: `backend/app/schemas/decision_support.py`
- Test: `backend/tests/unit/test_similar_history_service.py`
- Test: `backend/tests/integration/test_similar_history.py`

**Interfaces:**
- Produces: `build_candidate_set()`、`rank_candidates()`、`build_similar_history_decision_support()`、`dismiss_candidate()`。
- Consumes: 当前用户 observations、region、状态标签、照片特征和 cursor。

- [ ] **Step 1: 写硬门槛和反馈测试**

```python
def test_feature_similarity_cannot_bypass_region_gate(db, current_observation, other_region_event):
    candidates = build_candidate_set(db, source=current_observation)
    assert other_region_event.id not in {item.event_id for item in candidates}
```

另测跨用户永不进入候选、无照片时使用用户状态标签而非图像特征、响应无相似度分数、“不像”只降展示优先级；`SimilarHistoryOut.decision_support` 必须含四段结构，候选为空时明确表达依据不足。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_similar_history_service.py tests/integration/test_similar_history.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现筛选后排序和四段式组织**

先按用户、区域和基本状态可比性筛选，再在有照片特征时辅助排序；无照片候选仍可按状态维度和时间进入。将筛选依据、相似点、差异点和未知因素写入 `similar_history_summaries`，由 `build_similar_history_decision_support()` 生成与趋势、产品记忆相同的四段结构；必要时只能生成一个结构化追问。

- [ ] **Step 4: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_similar_history_service.py tests/integration/test_similar_history.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): add source-aware personal similar history'`

### Task 11: 四段式产品反应记忆

**Files:**
- Create: `backend/app/services/product_memory_service.py`
- Modify: `backend/app/api/products.py`
- Modify: `backend/app/schemas/decision_support.py`
- Test: `backend/tests/unit/test_product_memory_service.py`
- Test: `backend/tests/integration/test_product_memories.py`

**Interfaces:**
- Produces: `derive_memory_state()`、`build_product_memory()`。
- Consumes: trend summaries、photo comparisons、usages、feelings、similar history 和证据边。

- [ ] **Step 1: 写证据状态和文案边界测试**

```python
def test_three_mixed_events_stay_signals():
    evidence = [
        event_evidence(easing),
        event_evidence(easing),
        event_evidence(mixed),
    ]
    assert derive_memory_state(evidence) == signals
```

另测 3 段一致有效事件才 pattern、组合不计入单品、纯用户记录只能称时间关联、删除证据可退级、输出同时包含差异和未知、next step 不得建议再次使用。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_product_memory_service.py tests/integration/test_product_memories.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现四段式 payload**

结论统计每种趋势方向的独立事件数量；rationale 列出来源和维度；reference value 列出相似、差异、组合与未知；next steps 只使用安全枚举。

- [ ] **Step 4: 实现版本化、失效和重新计算**

新结果插入新版本并 supersede 旧版本；删除、事实修订、usage 关联变化和事件改归属在同事务写 outbox invalidation。

- [ ] **Step 5: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_product_memory_service.py tests/integration/test_product_memories.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): derive evidence-guided product memories'`

### Task 12: 历程和区域趋势读取模型

**Files:**
- Modify: `backend/app/services/event_service.py`
- Modify: `backend/app/api/events.py`
- Modify: `backend/app/schemas/event.py`
- Modify: `backend/app/api/trends.py`
- Create: `backend/tests/integration/test_history.py`
- Modify: `backend/tests/test_trends.py`

**Interfaces:**
- Produces: `list_history()`、`load_event_detail()`、`load_region_trends()`。
- Consumes: observations、两类摘要、usage、feelings、contexts 和 cursor。

- [ ] **Step 1: 写统一趋势和照片遮盖测试**

```python
def test_manual_and_photo_observations_share_one_timeline(client, seeded_event, app_headers):
    response = client.get(f/api/v1/events/{seeded_event.id}, headers=app_headers)
    sources = [item[support_source] for item in response.json()[timeline]]
    assert sources == [photo, user, combined]
    assert all(photo_url not in item for item in response.json()[timeline])
```

另测摘要优先、原图 URL 只在主动接口返回、RegionTrend 有 direction/basis/boundary、无评分和严重度、100 条分页无重复遗漏。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_history.py tests/test_trends.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现批量读取模型**

先分页 event IDs，再批量加载时间线和摘要，避免 N+1。旧 `/trends/summary` 标记 deprecated，新客户端只使用区域趋势。

- [ ] **Step 4: 运行测试并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_history.py tests/test_trends.py -q`

Expected: PASS。

Commit: `git commit -m 'feat(backend): expose unified event history and trends'`

### Task 13: Provider 合规、删除、导出和恢复

**Files:**
- Create: `backend/app/models/data_job.py`
- Create: `backend/app/schemas/data_control.py`
- Create: `backend/app/services/data_control_service.py`
- Create: `backend/app/api/data_control.py`
- Create: `backend/app/workers/data_control_worker.py`
- Create: `backend/app/db/migrations/versions/0018_data_control.py`
- Modify: `backend/app/services/ai_gateway/routes.py`
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/integration/test_data_control.py`
- Test: `backend/tests/unit/test_provider_compliance.py`

**Interfaces:**
- Produces: `eligible_ai_bindings()`、`request_export()`、`request_erasure()`、`erase_photo_graph()`、`build_export_zip()`。
- Consumes: storage、auth proof、派生依赖图、outbox 和 Provider 配置。

- [ ] **Step 1: 写 Provider 门禁和删除测试**

```python
def test_provider_that_trains_on_photos_is_excluded(settings):
    settings.ai_provider_policies = {
        unsafe: {training_disabled: False, retention_days: 0, legal_version: 2026-08}
    }
    assert eligible_ai_bindings(settings) == []
```

另测删除照片清除副本/特征/AI/匹配但保留独立用户事实；删除记录使摘要和记忆退级；账号删除先撤销 sessions；导出只含当前用户。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_provider_compliance.py tests/integration/test_data_control.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现 Provider 合规门禁**

默认要求 `training_disabled=true`；优先零留存，非零留存不得超过 7 天并必须有审核版本和处理区域。每次调用在 ai_call_logs 记录 policy version，不记录完整 base64。

- [ ] **Step 4: 实现删除和导出 job**

删除顺序：tombstone 阻止读取 → 删除原图/副本 → 删除图像派生 → 写重算 outbox。对象已不存在视为幂等成功。ZIP 包含 manifest、events、observations、assertions、usages、contexts、consents 和原图，不含 token、密码哈希、prompt 或供应商原始响应。

- [ ] **Step 5: 冻结 MVP 恢复目标**

- PostgreSQL 与照片存储 RPO 不超过 24 小时，RTO 不超过 8 小时。
- 每日备份保留 30 天；每月在隔离环境执行恢复演练并校验外键、SHA-256 和用户隔离。
- 用户删除在活动数据立即生效，备份副本最迟 30 天随轮换清除。
- 导出对象 24 小时清理，下载 URL 15 分钟失效。

- [ ] **Step 6: 运行测试和迁移并提交**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/unit/test_provider_compliance.py tests/integration/test_data_control.py -q`

Run: `cd backend; .venv\Scripts\alembic.exe upgrade head`

Expected: PASS。

Commit: `git commit -m 'feat(backend): enforce provider privacy and data control'`

### Task 14: 旧 Check-in 降级回填和兼容冻结

**Files:**
- Create: `backend/app/db/migrations/versions/0019_legacy_backfill.py`
- Create: `backend/scripts/audit_legacy_backfill.py`
- Modify: `backend/app/api/check_ins.py`
- Modify: `backend/app/api/chat.py`
- Modify: `backend/app/api/trends.py`
- Test: `backend/tests/integration/test_legacy_backfill.py`
- Test: `backend/tests/test_check_ins.py`

**Interfaces:**
- Produces: 旧资源到 Record/Observation 的可追溯映射和 audit 报告。
- Consumes: 旧 check-ins、photos、analyses 和 lineages。

- [ ] **Step 1: 写回填边界测试**

```python
def test_legacy_photo_is_not_a_comparison_baseline(backfilled_photo):
    assert backfilled_photo.original_storage_key
    assert backfilled_photo.comparison_eligible is False
    assert backfilled_photo.legacy_comparison_approved_at is None
```

另测无法确定区域保持 unclassified、旧 skin index/severity 不进入新 API、回填重复执行不重复、历史顺序不变。

- [ ] **Step 2: 运行失败测试**

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_legacy_backfill.py tests/test_check_ins.py -q`

Expected: FAIL。

- [ ] **Step 3: 实现幂等回填**

每个旧 Check-in 建一个 `mode=full` record；保留原时间和 storage key。只有现有结构能可靠确定区域时才创建区域 assertion；不从旧评分推导 overall state。

- [ ] **Step 4: 冻结旧写 API**

兼容期添加 `Deprecation: true` 和 Sunset header；新客户端切换且旧 API 零流量一个发布周期后，旧写接口返回 `410 LEGACY_API_RETIRED`。旧表暂不物理删除。

- [ ] **Step 5: 运行审计和测试**

Run: `cd backend; .venv\Scripts\python.exe scripts/audit_legacy_backfill.py`

Expected: 零跨用户映射、零孤儿 photo、零旧评分公开字段、所有旧照片默认不可比较。

Run: `cd backend; .venv\Scripts\python.exe -m pytest tests/integration/test_legacy_backfill.py tests/test_check_ins.py -q`

Expected: PASS。

- [ ] **Step 6: 提交**

Commit: `git commit -m 'refactor(backend): backfill and freeze legacy check-ins'`

### Task 15: 全链路契约和发布验收

**Files:**
- Create: `backend/tests/e2e/test_manual_observation_loop.py`
- Create: `backend/tests/e2e/test_photo_observation_loop.py`
- Create: `backend/tests/e2e/test_product_memory_loop.py`
- Create: `backend/tests/e2e/test_privacy_lifecycle.py`
- Create: `backend/tests/contract/test_openapi_contract.py`
- Modify: `backend/tests/test_app.py`

**Interfaces:**
- Produces: 发布前验证证据。
- Consumes: Tasks 1-14 全部 API、worker 和迁移。

- [ ] **Step 1: 验证无照片闭环**

创建 change record → 写区域/状态/感受 → finalize → primary event → 一次性提醒 → 7 天后第二个无照片趋势点 → personal trend ready、photo comparison not eligible。

- [ ] **Step 2: 验证照片与用户纠正闭环**

上传原图 → AI assertions → 用户纠正一个 dimension → finalize → 后续可比照片 → photo comparison ready；重算后用户纠正保持不变。

- [ ] **Step 3: 验证产品记忆闭环**

建立 3 段独立事件和真实 usage；一致证据得到 pattern，矛盾证据保持 signals；组合只进入 combo memory；输出具有四段结构且无治疗建议。

- [ ] **Step 4: 验证事件拆分和隐私闭环**

同区域默认续接 primary；用户主动拆分创建 parallel；删除一张源照片后视觉结论失效但用户事实保留；撤回 AI 授权后继续无照片记录；账号删除撤销所有 token。

- [ ] **Step 5: 验证 OpenAPI 契约**

OpenAPI 必须声明 Bearer、Idempotency-Key、If-Match、cursor、统一 ErrorEnvelope、ObservationDraftPut 和 DecisionSupportOut；所有新响应 ID 序列化为字符串。

- [ ] **Step 6: 运行完整质量门**

Run: `cd backend; .venv\Scripts\python.exe -m pytest -q`

Run: `cd backend; .venv\Scripts\ruff.exe check app tests`

Run: `cd backend; .venv\Scripts\alembic.exe current`

Expected: 测试零失败，Ruff 零错误，数据库为 `0019_legacy_backfill (head)`。

- [ ] **Step 7: 提交**

Commit: `git commit -m 'test(backend): verify unified evidence product loop'`

## 9. 分阶段验收

| 阶段 | 可演示结果 | 必须通过 | 禁止出现 |
|---|---|---|---|
| A 契约底座 | 稳定错误、鉴权、授权、幂等、分页 | contract tests、0013 往返 | 裸 detail、offset、重复写 |
| B 统一趋势点 | 有照片和无照片都能生成同一种 observation | 原图 hash、用户事实、focus mark、来源追溯 | 强制照片、双趋势 |
| C 事件生命周期 | 默认续接 primary，用户主动拆 parallel | 并发唯一、30 天暂停、审计 | 自动拆事件、单颗追踪 |
| D 安全 AI | 中性照片事实与用户纠正合并 | strict schema、合规、缓存、降级 | 覆盖用户、诊断、评分 |
| E 产品闭环 | 标准/临时产品、组合 usage、趋势点关联 | 版本、幂等、组合隔离、确认关联 | 自动归因、疗效结论 |
| F 背景提醒 | 可选背景和一次提醒 | 缺失语义、timezone、只投一次 | 催促、逾期、生活线索 |
| G 长期价值 | 两类摘要、相似历史、四段式产品记忆 | 7 天门槛、来源、差异、未知、退级 | 照片不足仍做视觉结论 |
| H 数据权利 | 主动揭图、导出、删除、恢复 | Provider 门禁、重算、恢复演练 | 无限留存、伪成功 |
| I 迁移发布 | 历史可回顾但不污染新基线 | backfill audit、全量测试 | 旧评分进入新 API |

## 10. MVP 总验收

- [ ] 用户不拍照也能用区域、当前状态和可选感受完成记录。
- [ ] 有照片、用户补充、无照片自述进入同一个 Observation 时间线。
- [ ] 用户点选/圈选的关注位置独立保存，原图 SHA-256 不变。
- [ ] 用户纠正优先于 AI，模型升级后不被覆盖。
- [ ] 同区域默认续接 primary；只有用户二级操作可以创建 parallel。
- [ ] 两个有效趋势点且相隔 7 天可生成个人趋势；照片比较仍单独检查两张可比照片。
- [ ] 趋势明确返回 easing、more_visible、stable、mixed 或 insufficient，并说明依据与边界。
- [ ] 四段式输出包含结论、判断依据、参考价值和安全 next steps。
- [ ] 趋势摘要、相似历史和产品记忆均复用四段式契约，且每次最多一个结构化追问。
- [ ] next steps 只能用于观察、补全、回顾或准备专业咨询，不涉及具体产品和治疗行为。
- [ ] usage 可独立保存并由用户关联到 observation/event；系统建议不会自动落库。
- [ ] 组合证据不归因单品；不适不被表述为过敏因果。
- [ ] 相似历史只来自当前用户，区域硬门槛优先，且不返回相似度分数。
- [ ] 删除或纠正源事实后，摘要和记忆立即失效并重算、必要时退级。
- [ ] 旧照片默认不成为比较基线，旧评分和严重度不进入新 API。
- [ ] AI Provider 不满足不训练和受限留存时不能被路由选中。
- [ ] 生活背景只记录和回顾，MVP 无跨日线索。

## 11. 实施纪律

- 每完成一个 Task，立即追加 `backend/dev_notes.md`，包含文件、迁移、测试、遗留和下一步。
- 每个 Task 都先运行失败测试，再写最小实现，再运行定向和相关回归。
- 不一次创建全部空迁移；迁移随可独立验收能力落地。
- worker 首版使用 PostgreSQL outbox 和独立 Python 进程，不引入 Celery/Redis。
- 旧表物理删除必须晚于客户端切换、一个发布周期零流量、备份恢复演练和回填审计。
