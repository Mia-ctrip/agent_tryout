# 切片 6：区域对比与阶段趋势实施计划

> **状态：** ACTIVE（2026-09-29 起；Slice 4A Task 12 暂停，出口门禁保留）
>
> **执行方式：** 当前会话内按测试先行执行；不提交 Git；数据库迁移只写文件，执行前单独征得用户同意。

**目标：** 同一区域事件有两个不同日期的有效照片时间点后支持用户选择两点对比；最近 30 天内至少三个不同日期且跨度不少于 7 天后展示阶段趋势。请求体量受控，不因照片增多超出 provider 限制。

**架构：** 纯函数负责门槛、代表点与关键帧选择；请求时从原图临时生成区域裁切副本；对比与趋势共用一张派生结果表，按输入指纹缓存与判断过期；后台任务沿用 observation worker 的 `BackgroundTasks` 模式；AI 调用只经统一 gateway，结构、引用、合规三道校验后发布。

**技术栈：** FastAPI、SQLAlchemy、Alembic、Pillow、pytest；Expo Router、React Native、TypeScript、Node test runner。

**规格：** `design/product/skin_care_app_mvp_spec.md` 6.8、6.9、7.4.3、切片 6、10、12。

**Prompt 源稿：** `tools/vision-prompt-lab/prompt/skin_compare.md`（`region-comparison-1.1.0`）、`tools/vision-prompt-lab/prompt/skin_trend.md`（`region-timeline-trend-2.0.0`）。

## 全局约束

- 只读同一用户、同一区域事件内带照片的有效时间点；旧 `full_face`、无照片记录、其他区域不进入。
- AI 输入不含产品使用、生活背景、用户原文、标准产品资料。
- 对比缓存键：`(user_id, kind=comparison, fingerprint(earlier_target_id, later_target_id, prompt_version))`。
- 趋势：窗口 30 个当地日历日，同日取最后一个代表点，关键帧上限 `K=6`，其余点只传已存事实。
- 区域裁切副本仅在内存中生成，不写存储、不覆盖原图。
- 数值参数集中为可配置常量：`TREND_WINDOW_DAYS=30`、`TREND_MIN_DAYS=3`、`TREND_MIN_SPAN_DAYS=7`、`TREND_MAX_KEYFRAMES=6`、`INSIGHT_CROP_EDGE_PX=640`、`INSIGHT_FULL_PHOTO_EDGE_PX=1024`、`INSIGHT_STALE_PROCESSING_S=300`。
- 不新增依赖；不改动既有观察创建、事件归属与 30 天规则。
- 旧 `/trends`、legacy 皮肤指数不复用、不暴露。

## 输入预算（按 Task 10 实测修正）

| 请求 | 图片 | 文字 | 估算 |
|---|---|---|---|
| 对比 | 2 张 640px 区域裁切 | 区域定义 + 时间 | 每图约 0.5k token 量级，请求体 < 300KB |
| 趋势 | ≤ 6 张 640px 区域裁切 | ≤ 30 个时间点 × 六项已存事实 | 图片约 3k + 文字约 6–10k token，请求体 < 1MB |

token 数为按 28px patch 的量级估算；GLM-4.6V 的单次图片张数、请求体上限和耗时以 Task 10 实测为准。若超出 90 秒超时或 provider 限制，先降 `K`，再降裁切边长。

---

### Task 1：门槛、代表点与关键帧选择（纯函数）

**文件：** 新增 `backend/app/services/region_insight_selection.py`；测试 `backend/tests/test_region_insight_selection.py`

**接口：**

- `photo_timepoints(event_detail) -> list[InsightTimepoint]`：只保留带照片的有效目标，按 `(recorded_at, target_id)` 排序；`stored_facts` 仅取 `result_source=photo_analysis` 的六项事实（不含 `summary`），用户原文目标为 `None`。
- `comparison_eligibility(points)`：不同当地日期数 ≥ 2；返回默认对 `(最早, 最近)`。
- `validate_comparison_pair(points, earlier_id, later_id)`：同事件、不同日期、earlier 早于 later，否则 422。
- `trend_window(points)`：终点为最近代表点日期，向前 30 日；同日取最后一个。
- `trend_progress(window)`：返回 `days`、`span_days`、`eligible`、`missing_days`、`missing_span_days`。
- `select_keyframes(window, k=6)`：`n ≤ k` 全选；否则固定首尾，余下按时间均匀目标点取最近未选点；同距优先有区域几何者；结果按时间排序且确定性。
- `input_fingerprint(kind, target_ids, keyframe_ids, prompt_version)`：SHA-256。

- [x] 先写失败测试：0/1/2 点；同日两点不可对比；跨事件拒绝；逆序对自动拒绝；同日多点取最后；3 天跨度 6 天不满足、跨度 7 天满足；窗口外点排除；n=5/6/7/30 的关键帧数量、首尾必含、确定性与几何优先；指纹对集合顺序稳定、对提示版本敏感。
- [x] 实现最小逻辑；运行聚焦测试与 Ruff。

### Task 2：区域裁切副本

**文件：** 修改 `backend/app/services/vision/image_prep.py`（新增函数，不改 `prepare_for_llm` 行为）；测试 `backend/tests/test_image_prep_region_crop.py`

**接口：** `prepare_region_crop_for_llm(raw_bytes, quality_meta, region_id, *, edge_px=640, fallback_edge_px=1024) -> PreparedImage & crop_mode`。先 `exif_transpose`，再按 `quality_meta.regions[region_id].points` 外接框外扩 15% 并夹紧；几何缺失或无效时返回缩小完整原图，`crop_mode=full_photo`。

- [x] 先写失败测试：六区各自裁切框不同；左右脸按保存的真实左右 ID；越界点、少于 3 点、宽高为 0 时回退；EXIF 旋转后坐标一致（与 `mobile/src/lib/region-photo-crop.ts` 相同的归一化语义）；输出长边不超过设定值；原始字节不被修改。
- [x] 实现；运行聚焦测试。

### Task 3：Prompt、Schema 与三道校验

**文件：** 新增 `backend/app/services/region_insight_prompt.py`、`backend/app/schemas/region_insight.py`、`backend/app/services/region_insight_validation.py`；测试 `backend/tests/test_region_insight_validation.py`

**内容：**

- Prompt 由 lab 源稿移植，常量 `REGION_COMPARISON_PROMPT_VERSION="region-comparison-1.1.0"`、`REGION_TREND_PROMPT_VERSION="region-timeline-trend-2.0.0"`，Schema 版本独立；`timepoint_metadata` 由服务端生成 JSON，`T1…Tn` 与真实 `target_id` 的映射只保存在服务端。
- Pydantic：枚举字段（`level`、`overall_change`、`overall_trend`、`evidence_strength`、各维度 `trend`、`source`）严格限定；长度与数组上限按 prompt。
- 引用校验：`timepoint_facts` 与输入一一对应；`evidence`/`phases`/`notable_timepoints` 中的 T-id 必须存在；`[图]` 只能用于有图时间点；仅 `[记录]` 证据的维度不得为“总体减少/总体增加”，颜色须为“无法可靠判断”。
- 一致性：可比性/可靠性“不足”时 `overall_*` 必须为“无法可靠判断(趋势)”，`headline` 为空。
- 合规：复用 `validate_full_face_display` 禁用词与 `foreign_location_terms(region_id)`，新增评价词表：改善、好转、变好、变差、恶化、恢复、复发、爆发、有效、无效、治愈、起效、反弹、健康、严重、轻微。

- [x] 先写失败测试：合法样例通过；每类违规各一例被拒；未知 T-id、`[图]` 冒用、仅记录证据的方向性趋势、颜色无图、不足时带 headline、其他区域词、评价词。
- [x] 实现；运行聚焦测试与 Ruff。

### Task 4：派生结果模型与迁移（需用户确认后执行）

**文件：** 新增 `backend/app/models/region_insight.py`、`backend/app/db/migrations/versions/0020_region_insights.py`；修改 `backend/app/models/__init__.py`；测试 `backend/tests/test_region_insight_models.py`

**表 `region_insights`：** `id`、`user_id`、`region_event_id`、`region_id`、`kind`（`comparison`/`trend`）、`status`（`processing`/`completed`/`degraded`/`failed`）、`input_fingerprint`、`earlier_target_id`、`later_target_id`（对比用）、`referenced_target_ids` JSONB、`timepoint_map` JSONB（T-id → target_id / 日期 / 是否有图 / crop_mode）、`result` JSONB、`prompt_version`、`schema_version`、`provider`、`model`、`trace_id`、`failure_code`、`processing_started_at`、`completed_at`、`superseded_at`、时间戳。

**约束：** `kind`/`status`/`region_id` CHECK；唯一索引 `(user_id, kind, input_fingerprint)`；索引 `(user_id, region_event_id, kind, superseded_at)`。

- [x] 先写失败的模型测试（SQLite）：约束、唯一指纹、账号隔离查询。
- [x] 写迁移并在测试中验证 `0019 → 0020 → 0019 → 0020`；有可丢弃 `TEST_DATABASE_URL` 时跑 PostgreSQL，否则按配置跳过并记录。
- [x] **暂停点：** 向用户说明迁移内容，得到同意后再对开发库执行 `alembic upgrade head`。（2026-09-29 已执行）

### Task 5：对比服务、worker 与 API

**文件：** 新增 `backend/app/services/region_comparison_service.py`、`backend/app/services/region_insight_worker.py`；修改 `backend/app/api/region_events.py`、`backend/app/schemas/region_event.py`；测试 `backend/tests/test_region_comparison.py`

**API：**

- `POST /region-events/{event_id}/comparisons`，body `{earlier_target_id, later_target_id}`：校验成对规则 → 按指纹查找；`completed`/`degraded` 直接返回（200）；`processing` 未超过 300 秒直接返回；不存在、`failed` 或超时则新建或重领为 `processing` 并投递后台任务（202）。
- `GET /region-events/{event_id}/comparisons/{id}`：读取状态与结果。
- 返回体始终包含两侧时间点的原图引用与已存事实，供失败/不足时并列展示。

**worker：** 原子领取 → 两张区域裁切 → gateway `vision_analyze` → 解析 → 三道校验 → 失败时携带 RETRY PROMPT 重试一次 → 仍失败则 `failed`；可比性“不足”落 `degraded`（保存结果但不展示方向性结论）。每次尝试写 `AICallLog(kind="region_comparison")`。

- [x] 先写失败测试（mock provider）：他人事件 404；同日/逆序/跨事件 422；同对重复 POST 只调用一次 AI；`processing` 超时可重领；不安全输出重试后成功；两次失败为 `failed` 并可再次 POST 重试；“不足”落 `degraded`；请求消息不含产品、生活背景、用户原文；请求图片为两张裁切图。
- [x] 实现；运行聚焦测试、全量后端回归与 Ruff。

### Task 6：趋势服务、摘要与刷新 API

**文件：** 新增 `backend/app/services/region_trend_service.py`；修改 `backend/app/services/region_insight_worker.py`、`backend/app/api/region_events.py`、`backend/app/schemas/region_event.py`；测试 `backend/tests/test_region_trend.py`

**API：**

- `GET /region-events/{event_id}/insights`（无副作用）：返回 `comparison_eligible`、默认对、`trend_progress`、最新一版可展示趋势（`completed`/`degraded`）、`trend_stale`（当前指纹 ≠ 最新一版指纹）、`trend_status`（`locked`/`ready`/`processing`/`failed`）。
- `POST /region-events/{event_id}/trend/refresh`（幂等）：未达门槛 409；当前指纹已完成返回 200；已有未超时 `processing` 返回 202；否则新建并投递（202）。
- 新结果完成后，将同事件旧趋势行写入 `superseded_at`。

**worker：** 构造窗口与关键帧 → 最多 6 张裁切图 + 全部代表点已存事实 → 调用 → 校验 → 重试一次 → 发布或 `failed`；`[记录]`/`[图]` 映射回真实 `target_id` 写入 `result`。

- [x] 先写失败测试：未达门槛 409 且不调用 AI；30 个代表点时请求图片数为 6、文字事实为 30 条；同日多点只进 1 个；新增时间点后 `trend_stale=true` 且旧结果仍可读；刷新幂等；失败不覆盖上一版；输出引用未知 T-id 被拒；消息不含产品、生活背景、用户原文。
- [x] 实现；运行聚焦测试、全量后端回归与 Ruff。

### Task 7：移动端 API 与 presenter

**文件：** 修改 `mobile/src/lib/region-event-api.ts`；新增 `mobile/src/lib/region-insight-flow.ts`；测试 `mobile/tests/region-insight-flow.test.mjs`

**接口：** `getRegionInsights`、`createRegionComparison`、`getRegionComparison`、`refreshRegionTrend`；presenter `buildComparisonView(result)`、`buildTrendView(insights)`、`buildTrendProgressText(progress)`、`defaultComparisonPair(timepoints)`、`nextComparisonPair(current, tappedTargetId)`。

- [x] 先写失败测试：进度文案（“已记录 N 天，跨度 M 天；再记录约 X 天…”）；`degraded`/`failed`/`processing` 各自视图；`headline` 为空时使用固定说明；维度与证据强度映射为中性文案；同日节点不可组对；点选第三个节点时替换较近一侧并保持时间顺序。
- [x] 实现；运行聚焦测试、typecheck、lint。

### Task 8：对比页（替换随机选点）

**文件：** 修改 `mobile/src/app/region-event/[eventId].tsx`、`mobile/src/components/region-comparison.tsx`；测试 `mobile/tests/region-comparison-ui-contract.test.mjs`

- [x] 先写失败的 UI 契约测试：不再调用 `Math.random`；默认最早/最近；节点条可改选 A/B；处理中显示真实状态且可离开；完成后显示 headline、可比性、维度变化与证据强度、无法判断、来源（“AI 对比 · 提示版本 · 生成时间”）；不足/失败显示固定说明与两侧已存事实，失败有重试；产品与生活背景不出现在结论卡内。
- [x] 实现；视觉沿用 `compare-320.png` 结构与既有 journey 主题，不新增依赖。
- [x] 运行聚焦测试、typecheck、lint；在 `mobile/scripts/ui-visual-review.mjs` 增加 `--compare-only` 场景并跑 320/375/390/430。

### Task 9：事件详情中的积累进度与趋势卡

**文件：** 新增 `mobile/src/components/region-trend-card.tsx`；修改 `mobile/src/app/region-event/[eventId].tsx`；测试 `mobile/tests/region-trend-card.test.mjs`

- [x] 先写失败测试：1 点显示基线与“再记录 1 天后可对比”；可对比未达趋势显示进度；达标后首次进入调用一次 `refresh`；`trend_stale` 时显示上一版并标“正在更新”；趋势卡显示 headline、可靠性、各维度方向、阶段、值得回看的节点（可点击跳转时间点）；`[记录]` 证据标“记录显示”；失败显示固定说明。
- [x] 实现；运行聚焦测试、typecheck、lint、`--journey-only` 与 `--compare-only` 回归。

### Task 10：真实 provider 体量与边界验证

**文件：** 新增 `backend/scripts/verify_region_insight_provider.py`（只读本地样本，不写业务库）；结果写入 `artifacts/region-insight-provider-review/`

- [ ] 用 ≥ 10 张同区域真实照片（用户提供或已有本地样本）跑：对比 × 3 对、趋势（n=10、n=30 模拟文字事实）；记录每次请求体字节、图片数、`input_tokens`/`output_tokens`、耗时、校验结果。
- [ ] 若超过 90 秒或 provider 报错，按“先降 K、再降裁切边长”调整常量并复测；把最终值写回本计划“输入预算”。
- [ ] 人工抽查输出：无评价词、无跨区域、无同一颗痘痘追踪、拍摄差异未被表述为变化。

### Task 11：闭环验收与状态更新

- [ ] 后端全量回归、Ruff；移动端单测、typecheck、lint、Web 四宽回归。
- [ ] Android + 真实后端：用真实多日照片（或用户同意的测试账号）验证对比默认对、改选、缓存复用、失败重试、进度文案、趋势生成与“正在更新”；不伪造 AI 结果写入真实账号。
- [ ] 更新 `docs/current_status.md`：已验证实现、验证命令与结果、剩余缺口；完成后恢复 Slice 4A Task 12 为 ACTIVE 或由用户指定下一计划。

## 出口门禁

- 规格 12.1 新增的对比/趋势条目全部有自动化证据；
- Task 10 的真实 provider 体量数据在超时与限制内；
- Android 真实后端完成对比与趋势主链；
- 未执行的 PostgreSQL / iPhone 验收如实记录为待验证。

