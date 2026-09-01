# 第二阶段：档案与历程实施计划

> 前置条件：第一阶段通过用户验收。使用已确认的面部分区页，不采用“巨石像”探索版本。

## 目标

把历程变成按用户关心区域回看真实证据的安静档案。保留六区、真实左右、多事件显式选择、隐私缩略图、产品使用上下文和非因果边界。

## Task 1：锁定历程业务契约

**修改文件**

- `mobile/tests/history-ui-contract.test.mjs`
- `mobile/tests/history-flow.test.mjs`
- 新建 `mobile/tests/history-visual-contract.test.mjs`

**步骤**

1. 保留现有断言：六个固定区域、抽象脸图、不使用用户照片、真实左右说明、显式事件选择、隐私模糊和签名 URL 刷新。
2. 新增断言：区域选中使用 Sage Soft + Moss 边框/文字；主 CTA 才能使用 Moss Deep 实底。
3. 新增断言：时间线上产品节点与照片时间线视觉分离；非因果说明始终可见。
4. 运行历程测试并记录视觉改造前基线。

## Task 2：重构历程首页与面部分区

**修改文件**

- `mobile/src/app/(tabs)/history.tsx`
- `mobile/src/components/history-face-overview.tsx`
- `mobile/src/components/region-selector.tsx`

**步骤**

1. 使用 `EditorialHeader` 建立“历程 / 从你关心的区域，回看真实记录”的层级。
2. 调整脸部外轮廓、眼睛、鼻部和区域比例，使其更接近用户确认稿中的人像线稿；不得回到整块石像式几何。
3. 六区继续通过现有 `RegionOverviewItem` 数据呈现 active、historical、pending/needs_input、neutral。
4. 将冗长图例压缩为易读状态说明；每个区域仍保留完整无障碍标签。
5. 多事件继续进入显式选择器，不自动猜测用户想看的事件。
6. 运行历程契约测试并进行大字体检查。

## Task 3：重构区域照片时间线

**修改文件**

- `mobile/src/components/region-timechain.tsx`
- `mobile/src/components/privacy-photo-thumbnail.tsx`
- `mobile/src/components/region-event-row.tsx`
- `mobile/src/components/region-choice-bar.tsx`

**步骤**

1. 保留横向滚动、默认选中最新有效节点、自动滚动到选中项和单节点无连接线。
2. 缩略图继续使用客户端隐私模糊；选中后通过边框、节点和日期字重共同表达，不只靠颜色。
3. 时间线使用 Hairline + Moss 的安静轨道，不用重卡片和阴影。
4. 处理中、需补文字和纯文字记录保留清楚的替代节点，不伪造照片。
5. 运行隐私 URL 生命周期、分页和时间链测试。

## Task 4：重构区域事件详情与当天证据卡

**修改文件**

- `mobile/src/app/region-event/[eventId].tsx`
- `mobile/src/components/region-event-card.tsx`
- `mobile/src/components/timepoint-evidence-card.tsx`
- `mobile/src/components/product-use-card.tsx`
- `mobile/src/components/timeline-item-card.tsx`

**步骤**

1. 页面顺序固定为：区域与时间范围 → 照片时间线 → 相邻产品使用上下文 → 当天记录 → 来源与非因果说明。
2. 当天卡只展示照片中可见事实、用户原文和来源，不引入评分、改善暗示或推断。
3. 产品使用节点使用独立的低强度上下文条，不能连接成“药品 → 皮肤结果”的因果箭头。
4. 用 `QuietNotice tone="nonCausal"` 固定呈现“相邻记录只作时间上下文，不表示关联或疗效”。
5. 保留进入既有观察详情的主动路径，不让隐私缩略图自动变成原图。
6. 保留时间上下文加载失败、重试和无数据状态。

## Task 5：空、加载、需补充和错误状态

**修改文件**

- `mobile/src/app/(tabs)/history.tsx`
- `mobile/src/app/region-event/[eventId].tsx`
- 相关历程组件测试

**步骤**

1. 空历程使用 Paper 底和最多一个 Whisper 痕迹，只提供一个开始观察动作。
2. 加载使用与最终布局相同几何的骨架，不闪烁大面积品牌图。
3. 错误状态装饰为 0，保留重试与退出。
4. `needs_input` 明确回到原观察补文字，不伪造时间点。

## Task 6：第二阶段综合验证

```powershell
cd mobile
node --test tests/history-ui-contract.test.mjs tests/history-flow.test.mjs tests/history-visual-contract.test.mjs
npm run test:unit
npm run typecheck
npm run lint
```

在 Pixel 8 和一台 iPhone 上检查：六区点击、真实左右、多事件选择、长时间线、单节点、隐私缩略图、签名 URL 刷新、产品上下文、无数据、处理中、需补文字和返回链。展示历程首页与区域详情真实截图，用户验收后进入第三阶段。

