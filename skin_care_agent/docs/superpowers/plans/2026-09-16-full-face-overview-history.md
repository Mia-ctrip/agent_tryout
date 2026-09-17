# 全脸选择、结果概览与历程回看实施计划

> **状态：** CODE_COMPLETE / ENV_ACCEPTANCE_PENDING（非 ACTIVE；`docs/current_status.md` 中唯一 ACTIVE 仍为 Slice 4A Task 12）
>
> **执行方式：** 当前会话内按测试先行执行；保留工作区既有产品使用流程改动，不提交 Git。

**目标：** 在不新增数据类型、任务、事件或 AI 请求的前提下，实现六区全选、当次完整照片概览，以及历程“全脸 / 分区”双视图。

**架构：** 选择状态继续只保存六个 `RegionId`；纯 presenter 从现有 `Observation` 生成概览和照片历程模型；详情页和历程页只增加视图状态与导航上下文。图片继续读取原 `ObservationPhoto` 并复用现有补签接口。

**技术栈：** Expo Router、React Native、TypeScript、Node test runner。

**规格：** `design/product/skin_care_app_mvp_spec.md` 3.2、6.2、6.4、7.4、12.1。

## 全局约束

- 新记录仍只创建 1–6 个 `region` 目标；不得创建新 `full_face` 目标、全脸事件或综合 AI 请求。
- 全脸固定等于 `REGION_IDS` 六区，状态由集合推导；重复点击保持全选，逐区取消恢复部分选择。
- 全脸概览与照片历程只读现有观察、原图、目标事实和状态；旧 `full_face` 仅作历史兼容。
- 产品使用步骤仍位于照片保存后、观察详情前；AI 状态变化不得抢占该步骤。
- 不覆盖现有未提交改动，不新增依赖，不改数据库。

---

### Task 1：六区全选与确认语义

**文件：**

- 修改 `mobile/src/lib/region-catalog.ts`
- 修改 `mobile/src/lib/face-analysis-flow.ts`
- 修改 `mobile/src/components/region-choice-bar.tsx`
- 修改 `mobile/src/components/region-selector.tsx`
- 修改 `mobile/src/app/observation/new.tsx`
- 测试 `mobile/tests/region-catalog.test.mjs`、`mobile/tests/face-analysis-flow.test.mjs`

**接口：** 新增 `hasAllRegions()` 与 reducer 事件 `all_regions_selected`；组件只调用该事件或传回 `REGION_IDS`，不保存“全脸模式”。

- [x] 先写失败测试：全选得到固定六区、重复全选返回相同集合、取消任一区后全选态为假、手动选满为真。
- [x] 运行聚焦测试并确认因缺少接口失败。
- [x] 实现最小逻辑与“选择全部 6 个区域”可访问控件；确认按钮显示实际数量。
- [x] 运行聚焦测试、TypeScript 与 lint。

### Task 2：当次全脸概览与独立目标状态

**文件：**

- 修改 `mobile/src/lib/observation-flow.ts`
- 新增 `mobile/src/components/full-observation-photo.tsx`
- 修改 `mobile/src/components/observation-result.tsx`
- 修改 `mobile/src/app/observation/[observationId].tsx`
- 测试 `mobile/tests/observation-result.test.mjs`、`mobile/tests/observation-result-cards.test.mjs`、`mobile/tests/observation-result-visual-contract.test.mjs`

**接口：** `buildObservationOverviewModel(observation)` 返回实际范围、是否六区全选、旧全脸标记及每个目标的来源/状态/简短内容；`ObservationResult` 接受 `initialView: 'overview' | 'regions'`。

- [x] 先写失败测试：六区、部分区域、混合 completed/processing/needs_input、全部失败、用户原文、旧 `full_face`。
- [x] 运行聚焦测试并确认因 presenter 缺失失败。
- [x] 实现完整原图补签组件、概览/分区切换和逐区入口；处理中时仍显示已完成事实，失败恢复控件留在详情页。
- [x] 让六区默认概览、1–5 区默认分区、历程全脸入口强制概览；切换不发业务请求、不改目标（原图补签读取除外）。
- [x] 运行聚焦测试、TypeScript 与 lint。

### Task 3：历程全脸/分区双视图

**文件：**

- 修改 `mobile/src/lib/history-flow.ts`
- 新增 `mobile/src/components/full-face-history-card.tsx`
- 修改 `mobile/src/app/(tabs)/history.tsx`
- 修改 `mobile/src/components/app-screen.tsx`
- 修改 `mobile/src/lib/observation-navigation.ts`
- 测试 `mobile/tests/history-flow.test.mjs`、`mobile/tests/history-ui-contract.test.mjs`、`mobile/tests/observation-navigation.test.mjs`

**接口：** `buildFullFaceHistory(observations)` 仅返回有照片记录，按 `recorded_at` 降序及 `observation_id` 稳定排序并按 ID 去重；导航参数 `view=overview&source=history_full_face` 保留入口语义。

- [x] 先写失败测试：部分选区也进入、六目标去重、同日/同图独立记录保留、重叠页去重、无照片排除、旧全脸标记、混合状态与稳定排序。
- [x] 运行聚焦测试并确认因 presenter 缺失失败。
- [x] 在区域图上方增加双视图切换；分别计算加载与空态；照片错误保留卡片和恢复入口。
- [x] 保存两种视图各自滚动位置；进入详情并系统返回后保留当前视图与位置。
- [x] 运行聚焦测试、TypeScript 与 lint。

### Task 4：回归、界面与状态文档

**文件：**

- 修改 `mobile/scripts/ui-visual-review.mjs`
- 修改 `docs/current_status.md`
- 修改 `docs/wrapup_assessment_2026-09-14.md`

- [x] 运行 `npm run test:unit`、`npm run typecheck`、`npm run lint`。
- [x] 运行全脸专项 Web 布局脚本，检查 320/375/390/430、混合状态、返回与横向溢出。
- [x] 使用 Android 模拟器只读验证已有部分选区照片概览、分区横滑和历程系统返回；缺失环境项目记录于 `artifacts/full-face-overview-history-review/native-review.md`。
- [ ] 使用授权测试原图和可丢弃环境补验原生新六区保存/产品/真实 AI、小屏大字体/读屏与 PostgreSQL/跨账号持久化。
- [x] 运行 `git diff --check` 和 `git status --short`。
- [x] 仅按实际证据更新当前状态与收口盘点；不更改 Slice 4A ACTIVE 状态，不把本项等同整个 MVP 完成。

## 最小读取修正与复核

原分页按发生时间排序、按 ID 大小续页，回填时间的 51 条记录会遗漏；已改同账号 `(recorded_at, id)` 游标与客户端页尾 ID，未新增接口字段或迁移。对应 pytest 27 项通过，PG 集成 1 项缺可丢弃环境跳过，Ruff 通过。

独立代码复核发现并关闭分页游标和分区重挂载恢复两项 Important。实际界面回归进一步修正条件容器测得零宽度：从常驻根容器测量正宽度，切回分区下一帧恢复真实页。照片补签同地址的重载与自动恢复上限也由交互场景验证。证据：`artifacts/full-face-overview-history-review/`。
