# 第三阶段：产品与药膏使用档案实施计划

> 前置条件：前两阶段已验收。真实包装图是识别证据，不承担美容广告功能。

## 目标

把产品栏从普通产品柜转化为可信、克制的使用档案：用户可以辨认真实包装、查看开始与最近使用记录、阅读有来源的资料，但不会看到电商推荐或疗效暗示。

## Task 1：锁定产品语义与视觉边界

**修改文件**

- `mobile/tests/product-ui-contract.test.mjs`
- 新建 `mobile/tests/product-archive-visual-contract.test.mjs`

**步骤**

1. 保留现有契约：单一新增入口、使用频次排序、产品栏不重复提供记录使用入口、详情同页展示官方说明、搜索仅用于记录。
2. 新增禁止词与结构断言：价格、销量、评分、立即购买、适合你的皮肤、推荐使用不得进入产品首页和详情。
3. 新增图片边界断言：`ProductImage` 不得包含 botanical、grain、tint、overlay 或疗效标签。
4. 新增标题区边界断言：植物痕迹只允许在非证据 hero，强度不得超过 Soft。

## Task 2：重构产品首页为使用档案

**修改文件**

- `mobile/src/app/(tabs)/products.tsx`
- `mobile/src/components/personal-product-card.tsx`
- `mobile/src/components/swipeable-product-row.tsx`
- `mobile/src/components/product-image.tsx`

**新建文件**

- `mobile/src/components/medicine-archive-header.tsx`

**接口**

```ts
type MedicineArchiveHeaderProps = {
  activeCount: number;
  inactiveCount: number;
  incompleteCount: number;
  onAdd: () => void;
};
```

**步骤**

1. 标题区使用 10%–14% 的透明容器、暖光、重叠纸面和叶影抽象元素；不得复制参考图品牌瓶身。
2. 标题与计数只来自真实产品数据。底层没有可靠药品分类字段时，文案使用“产品档案/使用记录”，不得凭名称推断全部产品都是药品。
3. 卡片去除电商货架感：真实包装图克制、无阴影或仅极轻分层；通用名/现有产品名、版本、记录次数、最近使用和状态优先。
4. 保留使用频次排序、单一新增入口和左滑揭示态；后端归档未实现时继续不伪造成功。
5. 图片加载失败显示中性识别占位，不使用品牌摄影替代药品包装。

## Task 3：重构个人产品详情

**修改文件**

- `mobile/src/app/product/[productId].tsx`
- `mobile/src/components/product-use-card.tsx`
- `mobile/src/components/quiet-notice.tsx`

**步骤**

1. 顺序固定为：包装与基础信息 → 个人使用摘要 → 时间记录 → 官方资料 → 来源与非医疗建议。
2. 客观资料和用户个人记录使用清楚的章节分隔，避免把个人感受呈现成产品功效。
3. 记录次数、最近使用和开始日期只显示真实值；缺失时显示“待补充”。
4. 官方资料继续显示来源与原文，不生成个体化使用建议。
5. 与历程的链接只打开时间上下文，不展示因果评分或前后对比结论。

## Task 4：重构搜索新增与自建产品表单

**修改文件**

- `mobile/src/app/product/new.tsx`
- `mobile/src/components/product-search-picker.tsx`
- `mobile/src/components/product-search-result-row.tsx`
- `mobile/src/components/custom-product-form.tsx`
- `mobile/src/components/form-field.tsx`

**步骤**

1. 保留 250ms 实时搜索、键盘收起、无匹配后才开放自建产品和“仅用于记录，不代表推荐”。
2. 表单与搜索页装饰强度为 0；依靠标题、间距、细线和输入状态建立层级。
3. 自建产品图片继续可选，保留拍摄、相册、重试与移除。
4. 长药名、浓度、剂型与中英文混排不得挤压主要动作或横向溢出。

## Task 5：重构记录使用页面

**修改文件**

- `mobile/src/app/product-use/new.tsx`
- `mobile/src/components/product-use-card.tsx`
- 相关产品使用测试

**步骤**

1. 入口仍只存在于观察相关流程。
2. 保留多选、“未注明产品”、真实记录时间和用户备注。
3. 页面明确这是个人记录，不是剂量提醒或医疗建议。
4. 保存失败时保留选择与备注，允许重试或安全退出。

## Task 6：第三阶段综合验证

```powershell
cd mobile
node --test tests/product-ui-contract.test.mjs tests/product-archive-visual-contract.test.mjs
npm run test:unit
npm run typecheck
npm run lint
```

在真实产品数据上检查：有图/无图、长名称、自建产品、标准目录产品、说明书长文、零次与多次使用、待补充、搜索无结果、上传失败和左滑揭示态。向用户展示产品首页、产品详情和新增页真实截图，验收后进入第四阶段。

