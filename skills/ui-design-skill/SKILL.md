# SKILL.md

## Skill Name

Quiet Botanical Skincare UI System

---

## 1. Purpose

本 Skill 用于统一护肤品相关 APP 的所有 UI / UX 设计。

适用于：

- 首页
- 产品详情页
- 产品列表页
- 搜索页
- 护肤 Routine 页面
- AI 分析页面
- 肌肤档案页面
- 成分详情页
- 产品推荐页
- 收藏页
- Profile 页面
- 设置页面
- Modal / Drawer / Bottom Sheet
- Empty State
- Loading State
- Error State
- Onboarding
- 数据可视化
- Form / Input
- 所有新增页面和组件

所有设计必须共享同一套：

- Design Tokens
- Layout System
- Typography System
- Color System
- Component Language
- Interaction Language
- Image Language
- Information Hierarchy

目标不是让每一个页面“长得一样”。

目标是：

> 即使把 Logo 和产品名称全部移除，用户仍然能够判断这些页面属于同一个产品。

---

# 2. Core Design Philosophy

整个产品的 UI 应体现：

- 安静
- 柔和
- 自然
- 清晰
- 克制
- 有呼吸感
- 精致但不奢华
- 专业但不医疗化
- 温暖但不幼稚
- Editorial，而非 SaaS Dashboard

核心原则：

> Calm clarity over visual excitement.

优先保证：

1. 信息清晰
2. 操作顺畅
3. 阅读舒适
4. 视觉呼吸感
5. 品牌一致性

审美不能破坏 usability。

---

# 3. Visual DNA

品牌视觉来源于：

Quiet Botanical Skincare Editorial。

其核心视觉特征为：

- warm neutral
- low saturation
- generous negative space
- soft geometry
- tactile materiality
- botanical accents
- restrained typography
- subtle imperfection
- editorial composition

但是：

UI 不应直接模仿摄影或纸张设计。

必须将这些视觉特征转换为数字界面的设计语言。

---

# 4. Design Tokens

所有页面优先使用统一 Token。

不要在单个页面中随意创造新的：

- 颜色
- 圆角
- 阴影
- 间距
- 字号
- 边框
- 背景

---

## 4.1 Color Tokens

### Background

```text
bg-primary
暖象牙白 / cream white

bg-secondary
极浅鼠尾草绿 / pale sage

bg-tertiary
温暖米灰 / warm beige-grey
```

页面默认避免纯白 `#FFFFFF` 作为大面积背景。

---

### Surface

```text
surface-primary
卡片和主要容器

surface-secondary
次级区域

surface-soft
低强调模块

surface-elevated
Modal / Bottom Sheet
```

Surface 之间主要通过：

- 轻微色差
- spacing
- border

区分。

不要严重依赖 shadow。

---

### Text

```text
text-primary
深灰褐

text-secondary
中灰褐

text-tertiary
浅灰褐

text-disabled
低对比灰

text-inverse
浅色文字
```

避免大量纯黑 `#000000`。

---

### Brand

```text
brand-primary
muted sage

brand-secondary
soft olive

brand-soft
very pale sage
```

品牌绿不能：

- 鲜艳
- 荧光
- 科技感

---

### Accent

Accent 只允许小面积出现。

候选：

```text
accent-yellow
dusty yellow

accent-pink
muted blush

accent-plum
dusty plum
```

Accent ratio：

通常不超过当前页面视觉面积的 10%。

---

### Semantic Colors

功能状态必须优先保证可读性。

```text
success
warning
error
info
```

Semantic Colors 可以比品牌色稍强。

但需要：

- 降低纯度
- 保持品牌协调

不要为了品牌感而降低状态识别能力。

---

# 5. Typography

Typography 必须承担主要的信息层级工作。

不要依赖：

- 大量边框
- 不同背景
- 阴影
- 彩色块

来建立层级。

---

## 5.1 Typography Roles

建议统一为：

```text
Display
Page Title
Section Title
Card Title
Body
Secondary Body
Caption
Label
Button
Metadata
```

---

## Display

只用于：

- Onboarding
- Hero
- 特殊品牌页面

禁止在普通页面频繁使用。

---

## Page Title

页面一级标题。

特点：

- 清晰
- 有适当留白
- 不夸张

---

## Section Title

用于区分页面主要内容块。

避免：

所有 section 都做成巨大粗体标题。

---

## Body

正文优先：

- readable
- relaxed
- medium line height

不要为了“高级”使用过细字体。

---

## Caption / Metadata

用于：

- 时间
- 产品容量
- 浓度
- 品牌
- 分类
- 辅助说明

低强调，但必须仍然可读。

---

# 6. Spacing System

Spacing 是本设计体系非常重要的品牌元素。

核心原则：

> Use space before decoration.

当两个模块需要分隔时：

优先顺序：

1. spacing
2. background difference
3. subtle divider
4. border
5. shadow

不要首先增加线框。

---

## Recommended Rhythm

使用统一的 spacing scale，例如：

```text
4
8
12
16
24
32
40
48
64
```

禁止出现大量无规律：

```text
13px
19px
27px
37px
```

---

## Page Padding

手机页面左右保持稳定 padding。

普通页面：

```text
16–20
```

Editorial / Hero 页面：

可以扩大至：

```text
24
```

---

## Section Gap

不同 Section 之间应明显大于 Section 内部元素间距。

必须能够通过留白看出信息层级。

---

# 7. Shape Language

UI 中的形状语言来自：

> soft geometry + restrained organic accents

---

## Corner Radius

推荐：

- small
- medium
- large

只使用有限的 3–4 档 radius。

例如：

```text
radius-sm
radius-md
radius-lg
radius-pill
```

不要每个组件使用不同圆角。

---

## Card

Card 应：

- 简洁
- 扁平
- 柔和
- 有适度圆角

避免：

- 巨大圆角
- 强烈阴影
- 浮空感
- SaaS Dashboard 卡片墙

---

## Organic Shape

植物系 organic shape 可以存在。

但主要用于：

- Hero
- Empty State
- Illustration
- Background Decoration

禁止在：

- Form
- Data Table
- Dense Information
- Navigation

中过度使用。

---

# 8. Borders and Shadows

## Borders

推荐：

- 低对比
- 1px
- 暖灰 / 淡绿色

用于必要结构。

---

## Shadows

Shadow 不是主要层级工具。

允许：

- Bottom Sheet
- Modal
- Floating Action
- 临时浮层

禁止：

所有 Card 都带明显 shadow。

---

# 9. Layout

整体 Layout 应：

- spacious
- readable
- hierarchical
- slightly editorial

但不能为了留白浪费屏幕。

---

## Information Density

默认：

medium-low density。

针对复杂专业页面：

例如：

- Ingredient Analysis
- Skin Report
- Routine
- AI Result

允许提高信息密度。

但仍通过：

- 分组
- typography
- progressive disclosure

控制认知负担。

---

# 10. Navigation

导航必须：

- 简单
- predictable
- consistent

避免为了“创新”改变常见移动端交互。

例如：

- Bottom Navigation
- Back
- Search
- Close
- More

使用用户熟悉的位置和行为。

品牌视觉不能优先于可用性。

---

# 11. Component System

所有页面必须优先复用共享组件。

禁止针对每一个页面重新设计同类组件。

---

## Buttons

Button 类型限制为：

```text
Primary
Secondary
Tertiary / Text
Destructive
Icon Button
```

### Primary

用于当前页面最重要的行动。

一个 viewport 内尽量只存在一个视觉强 Primary CTA。

---

### Secondary

低于 Primary。

不要同时出现多个竞争性的强按钮。

---

### Button Style

避免：

- 大面积鲜艳色
- Gradient Button
- Glossy Button
- 3D Button
- Heavy Shadow

---

# 12. Input / Form

输入控件应：

- 清晰
- 柔和
- 有明显 focus state
- 有明确 validation

Label 不应只依赖 placeholder。

必须支持：

- default
- focus
- filled
- error
- disabled

---

# 13. Product Card

所有产品列表优先复用统一 Product Card。

必须定义：

```text
product image
brand
product name
category
key strength / concentration
optional rating/status
optional action
```

不要在不同页面创造完全不同的产品卡片体系。

---

## Product Image

产品图：

- 背景干净
- 低刺激
- 保留品牌产品摄影语言

避免：

- 强阴影
- 高饱和背景
- 杂乱道具

---

# 14. Product Detail Page

产品详情页建议信息优先级：

```text
Product Visual
Brand
Product Name
Category / Formula
Core Attributes
User Action
Usage / Instructions
Ingredients
Suitability
Notes / Warnings
Related Products
```

不要一打开就把大量专业信息平铺。

使用：

- progressive disclosure
- accordion
- tabs
- expandable sections

降低认知负担。

---

# 15. Skin Analysis / AI Result

这是高信息量页面。

禁止为了品牌“留白感”而损害信息效率。

优先结构：

```text
Conclusion
→ Key Findings
→ Evidence
→ Recommended Actions
→ Detailed Analysis
```

即：

先回答用户最关心的问题，再解释原因。

---

## Severity / Score

如果存在评分：

- 不使用夸张仪表盘
- 不做游戏化排行榜
- 不使用大量鲜艳红绿

优先：

- 简洁数字
- progress indicator
- subtle bar
- restrained semantic color

---

# 16. Routine Page

Routine 页面应强调：

- 顺序
- 时间
- 产品关系
- 可执行性

视觉优先级：

```text
AM / PM
→ Step
→ Product
→ Usage
→ Notes
```

不要设计成复杂 Dashboard。

---

# 17. Empty State

Empty State 应：

- 安静
- 简短
- 有指导性

允许：

- botanical illustration
- abstract organic shape
- 极简产品插图

不要：

- 巨大的 Cartoon Character
- 过度可爱化
- 无意义营销文案

---

# 18. Loading

优先：

- Skeleton
- subtle progress
- low-stimulation motion

避免：

- 大型跳动动画
- 复杂品牌动画
- 旋转过快
- 过度 playful

---

# 19. Error State

Error 首要目标：

> 让用户知道发生了什么，以及下一步怎么办。

不要只显示：

```text
Something went wrong
```

必须尽可能提供：

- 原因
- 下一步
- Retry
- Alternative action

---

# 20. Illustration and Image Style

APP 内视觉图片应遵守品牌原有视觉语言：

- quiet botanical
- warm neutral
- low saturation
- matte
- tactile
- editorial
- generous negative space

允许：

- 产品静物
- 植物摄影
- 纸本质感
- 柔光空间
- 半透明材质

禁止：

- stock photography feel
- glossy commercial beauty image
- cyber tech image
- neon gradient
- 3D cartoon
- anime

---

# 21. Material Translation

原品牌视觉中的实体材质需要翻译成数字 UI。

不要直接模拟真实材质。

例如：

### Linen

不要：

给所有背景贴明显布纹。

应该翻译成：

- warm neutral background
- low contrast
- subtle texture only when appropriate

---

### Paper

不要：

所有 Card 都做成纸张贴纸。

应该翻译成：

- matte surface
- restrained border
- editorial layout
- occasional texture

---

### Frosted Glass

不要：

全面使用 Glassmorphism。

应该翻译成：

- translucent layer 仅用于特定场景
- overlay
- modal
- image overlay

禁止把 APP 设计成 Glassmorphism UI。

---

# 22. Motion

动画语言：

- slow
- subtle
- functional
- calm

推荐：

- fade
- gentle slide
- subtle scale
- crossfade

避免：

- bounce
- elastic
- exaggerated spring
- spin
- flashy transition

Motion 必须服务：

- 状态变化
- 层级关系
- 操作反馈

而不是装饰。

---

# 23. Accessibility

审美不能牺牲 Accessibility。

必须保证：

- 正文对比度足够
- Button 可识别
- Semantic State 不只靠颜色
- Tap Target 足够大
- 字号可读
- Error Message 清晰

低对比是品牌视觉倾向。

但：

> low contrast aesthetic ≠ unreadable UI.

---

# 24. Page Generation Workflow

当需要创建新页面时，必须按顺序执行。

## Step 1
确认页面任务。

用户来到这里要完成什么？

---

## Step 2
确定页面 Primary Action。

一个页面尽量只有一个核心行动目标。

---

## Step 3
建立 Information Hierarchy。

按重要程度排序。

---

## Step 4
优先选择已有 Component。

禁止直接创建新视觉组件。

---

## Step 5
应用 Design Tokens。

不得随意添加：

- 新颜色
- 新字号
- 新圆角
- 新 Shadow
- 新 spacing

---

## Step 6
检查品牌视觉。

检查：

- calm
- breathing room
- low saturation
- warm neutral
- soft geometry
- editorial hierarchy

---

## Step 7
检查 UX。

确认：

- 用户知道自己在哪里
- 用户知道下一步做什么
- 操作路径足够短
- 错误可以恢复
- 信息容易理解

---

# 25. Component Creation Rule

只有满足以下条件时才允许创建新组件：

1. 现有组件无法合理完成任务
2. 新组件未来有明显复用价值
3. 新组件符合 Design System
4. 新组件不会与现有组件语义重叠

否则：

优先组合已有组件。

---

# 26. Forbidden UI Patterns

默认禁止：

## Visual

- Neon Gradient
- Glassmorphism everywhere
- Heavy Shadow
- 3D UI
- Metallic UI
- Glossy UI
- Pure Black Background
- Highly Saturated CTA
- Random Bright Colors
- Excessive Border
- Card inside Card inside Card

---

## Layout

- Dashboard wall
- Information overload
- Every section inside a card
- No spacing hierarchy
- Excessive centered text
- Too many competing CTAs

---

## Typography

- Too many font sizes
- Too many weights
- Oversized headings everywhere
- Tiny unreadable captions
- Decorative font for body copy

---

## UX

- Hidden core actions
- Novel navigation without reason
- Excessive steps
- Modal overuse
- Confirmation for harmless actions
- Infinite accordion nesting

---

# 27. Design Review Checklist

任何页面完成后必须检查：

### Brand

- 是否看起来属于同一个 APP？
- 是否保持暖中性低饱和？
- 是否具有足够呼吸感？
- 是否避免商业广告视觉？
- 是否具有适度 Editorial 气质？

### Layout

- 页面是否存在明确一级信息？
- Section 是否通过 spacing 分层？
- 是否存在无意义 Card？
- 是否存在过度留白？

### Component

- 是否优先复用现有组件？
- 同类 Button 是否一致？
- Card 是否一致？
- Input 是否一致？

### UX

- 用户是否知道下一步做什么？
- Primary CTA 是否明确？
- 是否存在不必要操作？
- 是否存在无法恢复的 Error？

### Accessibility

- 对比度是否足够？
- 字号是否可读？
- Tap Target 是否足够？
- 状态是否只依赖颜色？

---

# 28. Decision Priority

发生冲突时，按照以下顺序决策：

```text
1. Usability
2. Accessibility
3. Information Hierarchy
4. Consistency
5. Brand Aesthetic
6. Decorative Creativity
```

绝不允许为了视觉风格牺牲前四项。

---

# 29. Short System Rule

如果上下文有限，使用：

```text
设计一个 Quiet Botanical Skincare 风格的护肤 APP UI。

整体：
安静、柔和、自然、克制、有呼吸感、轻 Editorial。

使用：
暖象牙白、奶油色、淡米色、鼠尾草绿、灰橄榄绿等低饱和 palette；
soft geometry；
统一圆角；
低对比 surface；
大量但合理的 whitespace；
克制 typography；
极少 shadow；
matte、tactile 的视觉感受。

优先通过 typography、spacing 和 hierarchy 建立页面层级，
而不是通过大量 card、border 和颜色。

所有页面优先复用现有 Design Tokens 和 Components。

避免：
SaaS Dashboard、
Neon Gradient、
Glassmorphism、
Heavy Shadow、
3D、
Glossy UI、
高饱和颜色、
Card Wall、
过度圆角、
过度装饰、
信息密集电商视觉。

品牌风格不得损害：
usability、accessibility、information hierarchy 和 interaction clarity。
```