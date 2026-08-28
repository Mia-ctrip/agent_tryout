# 产品栏鼠尾草主题设计实施计划

> 状态：COMPLETED（2026-08-27）

> 阶段验收：2026-08-28 用户确认功能与 UX 通过，产品栏 UX/UI 第一阶段结束；视觉 UI 未达到最终目标，后续另立视觉优化阶段。

> **For Codex:** 按测试先行逐项执行本计划；只修改产品列表、左滑归档、产品详情、搜索匹配和无匹配自建五个产品域状态，不改动其他业务页面。

**Goal:** 将已确认的 5 张产品栏 SVG 设计落地到 Expo Android 客户端，继续使用真实产品柜、标准目录与自建产品接口，并清楚标记尚无后端契约的归档能力。

**Architecture:** 保留现有 Expo Router 与产品 API 层。新增产品域主题 token 和纯展示/交互状态函数，以一组小型组件承载产品卡片及左滑动作；产品列表和新增页分别负责读取与写入，详情页按个人产品的标准目录引用补取当前官方说明书。归档只提供可操作的前端揭示态与“接口待完成”反馈，不伪造本地持久化。

**Tech Stack:** React Native 0.86、Expo SDK 57、Expo Router、TypeScript、react-native-gesture-handler、Node 内置测试运行器。

---

### Task 1: 产品域纯逻辑与静态契约

**Files:**
- Create: `mobile/src/lib/product-ui.ts`
- Create: `mobile/tests/product-ui.test.mjs`
- Modify: `mobile/tests/product-ui-contract.test.mjs`

- [x] 为使用频次排序、汇总、最近使用文案、搜索空态和左滑阈值编写失败测试。
- [x] 为五个设计状态的关键入口、边界文案和无“记录一次使用”入口编写静态失败测试。
- [x] 运行聚焦测试确认 RED，再实现最小纯逻辑使其 GREEN。

### Task 2: 产品列表与左滑归档

**Files:**
- Create: `mobile/src/constants/product-theme.ts`
- Create: `mobile/src/components/personal-product-card.tsx`
- Create: `mobile/src/components/swipeable-product-row.tsx`
- Modify: `mobile/src/components/product-image.tsx`
- Modify: `mobile/src/components/app-screen.tsx`
- Modify: `mobile/src/app/(tabs)/products.tsx`
- Modify: `mobile/tests/product-ui-contract.test.mjs`

- [x] 使用鼠尾草语义 token、奶油背景和柔白卡片还原列表视觉。
- [x] 列表按使用次数降序、最近使用时间和稳定 ID 排序，顶部显示产品数和累计使用次数。
- [x] 右上角仅保留“新增”入口，点击进入独立新增页。
- [x] 产品项左滑后在右侧露出深绿归档动作；点击显示待后端接口提示并复位。
- [x] 在 `backend/app/api/products.py` 留下与前端一致的归档 API TODO，不新增未经确认的接口或迁移。

### Task 3: 产品详情与直接说明书

**Files:**
- Modify: `mobile/src/app/product/[productId].tsx`
- Modify: `mobile/tests/product-ui-contract.test.mjs`

- [x] 读取个人产品详情；标准产品同时读取当前目录详情和官方说明书。
- [x] 用紧凑双列摘要呈现累计与最近使用，避免稀疏大卡片。
- [x] 在同一页面直接展示说明书原文、来源和版本，不再进入下一层详情。
- [x] 保留最近使用事实列表，移除产品域中的记录使用入口。

### Task 4: 实时搜索与无匹配自建

**Files:**
- Create: `mobile/src/app/product/new.tsx`
- Modify: `mobile/src/components/product-search-picker.tsx`
- Modify: `mobile/src/components/product-search-result-row.tsx`
- Modify: `mobile/src/components/custom-product-form.tsx`
- Modify: `mobile/tests/product-ui-contract.test.mjs`

- [x] 新增页默认只显示搜索栏和中性提示，不展示完整目录或自建表单。
- [x] 输入后 250ms 实时匹配并按后端排序展示结果；点击结果直接加入或复用个人产品后返回产品列表。
- [x] 只有非空查询完成且零结果时显示“没有找到你的产品？”与自建入口。
- [x] 用户确认自建后再展示名称、可选图片和创建按钮；成功后返回产品列表。

### Task 5: 验证与 Android 验收

**Files:**
- Modify after evidence: `docs/current_status.md`

- [x] 运行 `mobile` 全部单元测试、TypeScript、Expo lint 与 `git diff --check`。
- [x] 启动既有本地后端与 Pixel 8/Expo Go，不执行迁移或破坏性数据操作。
- [x] 核验预录产品按设计显示、详情可恢复、说明书同页展示、搜索新增和自建新增可用。
- [x] 记录归档接口 TODO 和任何环境阻塞；只有设备证据成立后更新当前状态。
