# 观察流程产品使用衔接实施计划

> 状态：已完成（实现与可用环境验证完成；剩余真机证据转回当前状态门禁）
>
> **For agentic workers:** 本计划在当前工作区内逐项执行；用户未授权提交 Git，因此步骤不包含 commit。

**Goal:** 在观察已可靠保存后进入产品使用步骤，并让新增、保存、跳过、取消、恢复和来源返回都保持真实语义。

**Architecture:** 继续使用独立的 `Observation`、`PersonalProduct` 与 `ProductUse`，只通过 Expo Router 参数保存流程来源和返回目标。移动端复用现有产品搜索、自建、服务端幂等与观察轮询；新增的草稿恢复只保存客户端请求 ID、选择、时间、备注和服务端成功标记，不建立业务关联。

**Tech Stack:** Expo SDK 57、Expo Router、React Native、TypeScript、Expo SecureStore、Node test runner、FastAPI/PostgreSQL 既有接口。

**Spec:** `design/product/skin_care_app_mvp_spec.md` 6.6、7.1、7.3、切片 4、12.1。

## Global Constraints

- 新观察保存成功后才进入产品步骤，观察只创建一次，AI 在后台继续处理。
- AI 状态只作轻量提示，不自动导航、关闭子表单或改变草稿。
- 入柜与使用提交分离；今天还没用、跳过、取消和空选择均不创建 `ProductUse`。
- 零产品关联使用只能由“用过，但暂不注明产品”显式提交。
- 来源只控制返回；产品和备注不进入照片 AI，不建立观察—使用关联表。
- 标准目录 Slice 4A Task 12 继续保留为待验收出口。

---

### Task 1: 来源路由与可恢复草稿

**Files:**
- Modify: `mobile/src/lib/observation-navigation.ts`
- Modify: `mobile/src/lib/product-use-flow.ts`
- Modify: `mobile/tests/observation-navigation.test.mjs`
- Modify: `mobile/tests/product-use-flow.test.mjs`

**Interfaces:**
- Produces: `productUseHref(...)`、`productUseExitTarget(...)`、`loadProductUseSession(...)`、`saveProductUseSession(...)`、`productUseObservationStatus(...)`。

- [x] 先写行为测试：观察后、观察详情、区域当天记录与观察首页生成稳定入口，并解析到正确返回目标。
- [x] 运行专项测试，确认因新接口缺失而失败。
- [x] 实现最小路由与存储函数；损坏或其他流程草稿回退为同一 `flowId` 的新草稿。
- [x] 覆盖处理中、即时完成、全部失败和部分失败的轻量状态文案。
- [x] 运行专项测试确认通过。

### Task 2: 产品步骤提交语义与恢复

**Files:**
- Modify: `mobile/src/app/product-use/new.tsx`
- Modify: `mobile/src/lib/product-use-flow.ts`
- Modify: `mobile/tests/product-use-flow.test.mjs`

**Interfaces:**
- Consumes: Task 1 的来源、草稿与状态函数；既有 `createProductUse` 幂等接口。
- Produces: 多选保存、显式未注明、未用/跳过/取消退出，以及服务端成功后只重试导航的页面行为。

- [x] 先写测试：普通保存必须有产品，显式未注明允许零关联；退出动作不构造提交载荷。
- [x] 运行专项测试确认失败原因是旧空选择语义。
- [x] 将常用/最近产品按真实 `use_count` 与 `last_used_at` 展示为可触达的图片列表，不默认选择。
- [x] 默认折叠时间与备注，空柜主动展开搜索；失败保留草稿，双击由现有 guard 阻止。
- [x] 服务端返回成功后持久化 `product_use_id`，后续只导航，不再次 POST。
- [x] 观察来源后台轮询只更新轻量状态提示。

### Task 3: 就地新增的关闭与恢复

**Files:**
- Modify: `mobile/src/components/product-search-picker.tsx`
- Modify: `mobile/src/components/custom-product-form.tsx`
- Modify: `mobile/src/lib/product-image-picker.ts`
- Modify: `mobile/tests/product-image-picker.test.mjs`

**Interfaces:**
- Produces: 新增取消只收起子表单；新增成功收起并选中；图片选择取消/失败保留名称和已有草稿。

- [x] 先写图片选择结果测试，覆盖选择、取消和错误恢复输入。
- [x] 运行专项测试确认失败。
- [x] 给自建表单增加明确取消；搜索组件在成功、取消与 Android 返回键时只关闭这一层。
- [x] 捕获图片选择异常；不清空名称、图片或父级选择。
- [x] 运行专项测试确认通过。

### Task 4: 观察流程与追加入口

**Files:**
- Modify: `mobile/src/app/observation/new.tsx`
- Modify: `mobile/src/app/observation/[observationId].tsx`
- Modify: `mobile/src/app/(tabs)/observe.tsx`
- Modify: `mobile/src/app/region-event/[eventId].tsx`

**Interfaces:**
- Consumes: Task 1 的 `productUseHref(...)`。
- Produces: 新观察保存后进入产品步骤；结果、处理中/失败详情、当天记录和观察首页均可追加并返回来源。

- [x] 新观察 POST 成功与导航分离；导航失败时展示“照片已保存”恢复动作，禁止再次创建观察。
- [x] 结果/处理中/失败详情始终提供“继续记录产品使用”。
- [x] 区域时间点提供当天追加入口；观察首页独立入口带自己的返回来源。
- [x] 历史详情不主动弹出产品步骤。

### Task 5: 验证与状态文档

**Files:**
- Modify: `docs/current_status.md`
- Modify: `docs/wrapup_assessment_2026-09-14.md`
- Modify: 本计划

- [x] 运行移动端 `npm run test:unit`、`npm run typecheck`、`npm run lint`。
- [x] 运行 `git diff --check`。
- [x] 在可用 Android 模拟器和真实后端验证新观察、AI 状态并行、三类选择/新增、退出语义、超时重试、来源返回和重启读取；无法执行的设备项如实记录。
- [x] 检查 320/375/390/430 宽度、大字体、键盘、长名称、空柜和错误态。
- [x] 更新当前状态与收口证据；保持标准目录 Slice 4A Task 12 未完成，并恢复其唯一 ACTIVE 指针。

## 完成证据

- 自动化：移动端 237 项单测、TypeScript、Expo lint 与 `git diff --check` 通过。
- Android/HTTP：Pixel 8 模拟器与本地后端完成空柜、标准加入、自建、取消、显式未注明、多选、同日追加、键盘/返回/图片选择器和 1.3 字体；相同 UUID 的 HTTP 重试为 201→200、同一 ID、数据库仅一行。
- 视觉：`artifacts/product-use-flow-review/` 通过 320/375/390/430、长名称和自建表单，无横向溢出或浏览器运行错误。
- 环境限制：没有合适且获授权的测试皮肤原图，未伪造新观察或 AI 截图；真实新照片/AI 多状态、主动断网恢复、iPhone、物理 Android 相机及系统终止后的选择器恢复保留在 `docs/current_status.md` 的设备门禁中。
- 本计划结束后不成为 ACTIVE；唯一 ACTIVE 继续指向 `docs/superpowers/plans/2026-08-24-standard-product-catalog-slice-4a.md`，其中 Task 12 仍未完成。
