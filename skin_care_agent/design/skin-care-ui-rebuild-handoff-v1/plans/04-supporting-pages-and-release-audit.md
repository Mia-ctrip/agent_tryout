# 第四阶段：其余页面、系统状态与发布前视觉审计

> 前置条件：四组核心金标准中的观察、历程和产品已通过用户验收。

## 目标

将登录注册、协议、我的、设置、表单、弹层、空态、加载和错误页迁移到同一视觉系统，清理残余页面级样式，并建立防止后续漂移的全局回归门禁。

## Task 1：建立路由与组件视觉盘点

**检查范围**

- `mobile/src/app/**/*.tsx`
- `mobile/src/components/**/*.tsx`
- `mobile/src/constants/**/*.ts`

**新建文件**

- `mobile/docs/ui-migration-matrix.md`

**步骤**

1. 列出全部 Expo Router 页面，记录页面模式：brand、task、result、timeline、archive、form、settings、modal、empty/error。
2. 记录每页使用的共享头部、按钮、提示、表单和状态组件。
3. 标记硬编码颜色、重复圆角、重阴影、卡片墙、多个主按钮和未处理的长文案。
4. legacy 页面只做一致性和可用性迁移，不借本轮恢复旧产品能力。

## Task 2：迁移身份、协议和表单页

**修改文件**

- `mobile/src/app/login.tsx`
- `mobile/src/app/register.tsx`
- `mobile/src/app/consents.tsx`
- `mobile/src/components/form-field.tsx`
- `mobile/src/components/inline-notice.tsx`
- 对应身份与协议测试

**步骤**

1. 使用 `AppScreen variant="form"`；装饰、照片和植物痕迹为 0。
2. 标题可使用页面级衬线角色，输入、协议、按钮和错误信息使用清晰无衬线。
3. 错误、禁用、聚焦和成功不得只通过颜色表达。
4. 键盘、密码管理、自动填充、大字体和长协议文案保持可用。

## Task 3：迁移“我的”与设置类页面

**修改文件**

- `mobile/src/app/(tabs)/me.tsx`
- 与账号、隐私、导出或偏好相关的现有路由和组件
- 对应测试

**步骤**

1. 使用 Paper 底、编辑性章节标题和 Hairline 列表；不用卡片墙。
2. 隐私和数据操作的风险级别保持可识别；破坏性操作使用独立 Clay/危险语义。
3. 设置页面装饰为 0，不把品牌感建立在无意义插图上。
4. 用户照片、个人记录可见性与数据边界说明保持清楚。

## Task 4：统一系统状态与恢复组件

**新建文件**

- `mobile/src/components/system-state.tsx`
- `mobile/src/components/quiet-skeleton.tsx`
- `mobile/tests/system-state-contract.test.mjs`

**接口**

```ts
type SystemStateProps = {
  kind: 'empty' | 'error' | 'permission' | 'offline' | 'incomplete';
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
  trace?: 'none' | 'whisper';
};
```

**步骤**

1. 写测试：error/offline/incomplete 的 `trace` 必须为 none；empty 只允许 whisper；每个状态最多一个主动作。
2. 骨架布局与最终内容几何一致，并尊重系统减少动态效果。
3. 将重复的加载、空、权限和错误呈现逐步替换为共享组件；保留各业务页现有恢复行为。
4. 上传或保存失败必须保留用户输入、选择和照片。

## Task 5：清理残余视觉漂移

**修改文件**

- `mobile/tests/theme-contract.test.mjs`
- `mobile/tests/quiet-botanical-visual-contract.test.mjs`
- 盘点矩阵中标记的页面和组件

**步骤**

1. 扫描移动端源码中的未授权不透明色值、旧紫色、重阴影、任意透明度和页面级重复字体。
2. 允许相机遮罩、危险语义和真实图片背景等有理由的例外，但在测试中显式列明，禁止模糊白名单。
3. 检查装饰痕迹只通过共享组件和强度令牌出现。
4. 确保证据照片和产品包装没有装饰父层、滤镜、tint 或品牌覆盖。

## Task 6：视觉回归、无障碍与性能门禁

**新建或更新**

- `mobile/docs/ui-visual-regression.md`
- 项目现有截图或端到端测试配置

**步骤**

1. 为四组金标准页面及关键系统状态保存稳定截图：观察首页、拍摄确认、结果、历程首页、区域详情、产品首页、产品详情、表单错误和空态。
2. 至少覆盖 320/375/390/430 宽度、大字体、深色系统栏适配、键盘和安全区。
3. 检查无障碍标签、阅读顺序、触控尺寸、选中/禁用/错误的非颜色提示。
4. 检查图片内存、长列表滚动、低端 Android 和减少动态效果。
5. 任何视觉快照只用于回归，不替代真机交互与业务测试。

## Task 7：最终验证与文档更新

```powershell
cd mobile
npm run test:unit
npm run typecheck
npm run lint
```

随后执行项目要求的 Expo Web 导出和 Android/iPhone 真机验收。只有在所有证据齐备且用户授权后，才更新 `docs/current_status.md`：记录已验证页面、命令结果、设备、仍未完成的素材权利与真机门禁，并设置下一份唯一 ACTIVE 计划。没有授权时只提交验证报告，不修改状态文件，不提交或推送 Git。

