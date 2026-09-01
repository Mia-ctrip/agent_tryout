# 第一阶段：基础视觉系统与观察旅程实施计划

> 执行原则：测试先行；每个任务独立验证；不重写现有观察 reducer、API 或保存逻辑。

## 目标

建立全局视觉令牌与核心共享组件，并把观察首页、拍摄、照片确认和观察结果迁移到已确认的金标准。完成后，用户可以从首页开始一次观察，在真实照片不被修饰的前提下完成确认、分析、保存与失败恢复。

## Task 1：建立视觉系统契约

**修改文件**

- `mobile/src/constants/theme.ts`
- `mobile/src/constants/observation-theme.ts`
- `mobile/src/constants/product-theme.ts`
- `mobile/tests/theme-contract.test.mjs`
- 新建 `mobile/tests/quiet-botanical-visual-contract.test.mjs`

**步骤**

1. 先为下列语义令牌写失败测试：`ground`、`paper`、`paperElevated`、`sage`、`sageSoft`、`moss`、`mossDeep`、`earth`、`ink`、`hairline`、`hairlineSoft`、`amber`、`clay`。
2. 为间距 40、64 和装饰透明度 `whisper: 0.08`、`soft: 0.16`、`medium: 0.28`、`strong: 0.45` 写契约测试。
3. 运行 `node --test tests/theme-contract.test.mjs tests/quiet-botanical-visual-contract.test.mjs`，确认测试因令牌缺失失败。
4. 在 `theme.ts` 增加新语义令牌；保留既有兼容别名，避免一次性破坏 legacy 页面。
5. 让 `observation-theme.ts` 与 `product-theme.ts` 只引用共享令牌，不新增不透明品牌色。
6. 增加源码扫描断言：证据组件不得引用 grain、botanical 或 overlay 装饰；表单和错误页面不得引入装饰组件。
7. 重跑两项测试并确认通过。

## Task 2：建立字体角色与编辑性文本组件

**新建文件**

- `mobile/src/constants/typography.ts`
- `mobile/src/components/editorial-text.tsx`
- `mobile/tests/typography-contract.test.mjs`

**接口**

```ts
export const typography = {
  displayFamily: string;
  bodyFamily: string;
  metadataFamily: string;
  display: TextStyle;
  pageTitle: TextStyle;
  sectionTitle: TextStyle;
  body: TextStyle;
  caption: TextStyle;
  metadata: TextStyle;
};

type EditorialTextProps = TextProps & {
  role: 'display' | 'pageTitle' | 'sectionTitle' | 'body' | 'caption' | 'metadata';
};
```

**步骤**

1. 写测试锁定角色而非页面级字号：衬线只允许 `display/pageTitle/sectionTitle`，按钮与正文必须使用清晰无衬线。
2. 先使用平台安全字体回退，不新增字体依赖：iOS/Web 优先 Georgia/系统衬线，Android 使用 `serif`；正文使用系统字体。
3. 如果后续要引入 Noto Serif SC、Inter 或 Fraunces，先核验许可、Expo 57 加载方式和首屏性能，作为单独任务，不在本阶段擅自安装依赖。
4. 在 `editorial-text.tsx` 集中实现角色映射，允许页面通过 `style` 补充布局但不覆盖字体职责。
5. 运行 `node --test tests/typography-contract.test.mjs`。

## Task 3：建立安静植物痕迹与基础信息组件

**新建文件**

- `mobile/src/components/botanical-trace.tsx`
- `mobile/src/components/editorial-header.tsx`
- `mobile/src/components/quiet-notice.tsx`
- `mobile/src/components/section-header.tsx`
- `mobile/tests/shared-visual-components.test.mjs`

**接口**

```ts
type BotanicalTraceProps = {
  kind: 'sprig' | 'leaf-shadow' | 'paper-echo' | 'bokeh';
  intensity?: 'whisper' | 'soft' | 'medium';
  placement?: 'topRight' | 'bottomRight' | 'bottomLeft';
  decorative?: true;
};

type EditorialHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  trace?: 'none' | 'whisper' | 'soft';
};

type QuietNoticeProps = {
  tone: 'neutral' | 'privacy' | 'medical' | 'nonCausal' | 'error';
  title?: string;
  children: ReactNode;
};
```

**步骤**

1. 写失败测试，锁定痕迹组件 `pointerEvents="none"`、默认对辅助技术隐藏、不得接收业务状态或照片 URI。
2. 使用 React Native View、渐变能力和已有 SVG data URI 路线实现轻量痕迹；不新增原生图形依赖。
3. `EditorialHeader` 负责标题、元数据和可选低强度痕迹，不包裹证据图。
4. `QuietNotice` 保留语义图标、标题和正文，不只用颜色表达状态。
5. 运行 `node --test tests/shared-visual-components.test.mjs`。

## Task 4：统一 App Shell、按钮和底部导航

**修改文件**

- `mobile/src/components/app-screen.tsx`
- `mobile/src/components/app-button.tsx`
- `mobile/src/components/brand-header.tsx`
- `mobile/src/app/(tabs)/_layout.tsx`
- `mobile/tests/tab-shell.test.mjs`
- 新建 `mobile/tests/app-shell-contract.test.mjs`

**步骤**

1. 写测试锁定：四个底部入口顺序和标签不变；主按钮为 Moss Deep 胶囊；每屏只有一个 primary；触控高度不低于 44。
2. 为 `AppScreen` 增加页面响度变体：`paper | form | camera`。`form` 禁止痕迹；`camera` 允许内容自行铺满但不自动叠装饰。
3. 将 `AppButton` 扩展为 `primary | secondary | text | danger`，保留 loading、disabled 和无障碍状态。
4. 去除普通内容卡的默认重阴影；以 Paper 色差和 Hairline 分组。
5. 底部导航继续使用平台原生符号，选中状态同时通过颜色、标签字重和顶部/底部短线表达。
6. 运行 `node --test tests/tab-shell.test.mjs tests/app-shell-contract.test.mjs`。

## Task 5：实现观察首页的编辑拼贴模式

**修改文件**

- `mobile/src/app/(tabs)/observe.tsx`
- `mobile/src/components/camera-start-panel.tsx`
- `mobile/tests/observation-flow.test.mjs`
- 新建 `mobile/tests/observe-home-visual-contract.test.mjs`

**新建文件**

- `mobile/src/components/editorial-collage.tsx`

**接口**

```ts
type EditorialCollageProps = {
  primarySource: ImageSourcePropType;
  secondarySource: ImageSourcePropType;
  primaryAlt: string;
  secondaryAlt: string;
  imageDose: 'hero';
};
```

**步骤**

1. 写契约测试：首屏只有一个主 CTA；拼贴只是一主一辅；历史记录与区域事件退到主任务之后。
2. 先建立素材登记文件 `mobile/assets/brand/ASSET_RIGHTS.md`。在没有确认素材前，不把交接包参考图复制到应用。
3. `EditorialCollage` 只接受已登记的本地品牌资源；没有合法资源时展示低强度纸面占位，并在开发环境给出明确警告。
4. 将首页调整为：编辑拼贴、页面标题、简短说明、开始观察主按钮、最近记录/区域上下文。
5. 品牌影像占首屏约 25%–30%；不遮挡标题和操作。
6. 运行观察流程测试和新视觉契约测试。

## Task 6：重构拍摄与照片确认的呈现层

**修改文件**

- `mobile/src/app/observation/new.tsx`
- `mobile/src/components/camera-guide-overlay.tsx`
- `mobile/src/components/camera-start-panel.tsx`
- `mobile/src/components/observation-action-bar.tsx`
- `mobile/src/components/face-region-map.tsx`
- `mobile/tests/observation-flow.test.mjs`
- `mobile/tests/observation-ui-contract.test.mjs`

**步骤**

1. 为权限、实时构图、拍后质量、区域选择、上传失败恢复写或补齐契约测试；先确认现有 reducer 行为保持不变。
2. 拍摄页使用全屏真实相机画面；移除植物、纸张和品牌拼贴。
3. 构图轮廓表达为摄影引导，不使用扫描网格、医疗靶点或虚假问题坐标。
4. 明确显示自然光、无滤镜、稳定距离和当前区域；减少动态效果开启时取消呼吸/扫描动效。
5. 照片确认页明示“原始照片 · 未修饰”，在同一屏处理可用性、最多两个区域和可选感受。
6. 底部操作固定为“重新拍摄”与“使用这张照片”，主次清晰；键盘打开时内容和操作不可被遮挡。
7. 不改变现有质量检查、保存、防重复提交和失败恢复逻辑。
8. 运行相关测试、TypeScript 和 lint。

## Task 7：重构观察结果的信息顺序

**修改文件**

- `mobile/src/app/observation/[observationId].tsx`
- `mobile/src/components/observation-result.tsx`
- `mobile/tests/observation-result.test.mjs`
- 新建 `mobile/tests/observation-result-visual-contract.test.mjs`

**步骤**

1. 写失败测试锁定顺序：观察结论 → 最多两项关键发现与原始照片证据 → 用户原文 → 下一步 → 非诊断与非因果说明。
2. 保留 `buildObservationResultModel()` 作为唯一数据整理入口，不在组件内推断新结论。
3. 移除“重点发现/详细分析/小结/趋势对比”的卡片墙表达；禁用趋势占位不进入首要阅读路径。
4. 证据照片保持原色，标注只说明实际检测区域；装饰组件不得成为其父层或覆盖层。
5. `needs_input`、处理中、失败重试和已完成兄弟区域继续使用既有状态，不丢失已完成结果。
6. 页面只保留一个主要完成动作；若现有记录已自动保存，则文案和按钮必须与真实行为一致，不伪造“再次保存”。
7. 运行结果模型、详情路由和视觉契约测试。

## Task 8：第一阶段综合验证

**验证**

```powershell
cd mobile
npm run test:unit
npm run typecheck
npm run lint
```

随后：

1. 导出 Expo Web 静态路由，确认非相机页面可渲染。
2. 在 Android 与 iPhone 检查观察首页、相机权限、拍摄、确认、分析中、结果、失败恢复和返回链。
3. 检查 320/375/390/430 宽度、系统大字体、长中文结论、长区域文案、键盘与安全区。
4. 保存本阶段关键截图作为视觉回归基线。
5. 向用户展示：首页、拍摄、确认、结果四张真实渲染图；得到验收后才进入第二阶段。

