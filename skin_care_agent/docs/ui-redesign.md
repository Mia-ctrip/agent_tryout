# Skin Care Agent UI 重构实施交接包

这份目录是本轮 UI 共创的唯一交接入口。它把视觉原则、四组金标准页面和分阶段实施计划放在一起，供新的 Codex 任务直接读取。

## 目标项目

- 项目根目录：`D:\Mia\agent_tryout\skin_care_agent`
- 移动端目录：`D:\Mia\agent_tryout\skin_care_agent\mobile`
- 技术栈：Expo 57、React Native 0.86、Expo Router、TypeScript

## 开始前必须读取

进入项目后，严格按以下顺序读取：

1. 项目根目录的 `AGENTS.md`
2. `project_background.md`
3. `design/product/skin_care_app_mvp_spec.md`
4. `docs/current_status.md`
5. `mobile/AGENTS.md`
6. 本交接包的 `spec/2026-09-01-skin-care-ui-system-design.md`
7. `visual-directions/visual_direction_v1_1.html`
8. `visual-directions/visual_direction_v1_2_botanicals.html`
9. `golden-screens/golden-screens-index.html`
10. `plans/00-execution-order.md` 及当前阶段计划

## 强制约束

- 使用 `$quiet-botanical-ui` 作为本轮实现的页面级 UI 约束。
- 这是视觉重构，不改变后端数据结构、医学语义、隐私边界、现有 API 或业务状态机。
- 用户皮肤照片、药品包装和用户原文是证据，不得磨皮、换色、叠纹理或被装饰覆盖。
- `golden-screens/assets/` 中的参考照片与药品图只用于原型理解，不得复制到正式移动端资源目录。
- 首页品牌影像上线前必须替换为自主拍摄、明确可商用或经确认的原创素材，并登记来源。
- 装饰层独立于证据组件；表单、设置和错误页面装饰强度为 0。
- 不把产品页做成电商货架，不增加价格、评分、销量、购买或个体化推荐。
- 不用时间相邻暗示产品或药品造成皮肤变化。
- 当前项目 `main` 有用户未提交改动；不得直接在该工作树开展重构。先创建独立工作区或由用户指定安全分支。
- 当前唯一 ACTIVE 计划仍是标准产品目录 Slice 4A Task 12。启动 UI 重构前，先让用户确认是暂停它并切换 ACTIVE 计划，还是在独立工作区并行推进；不得静默改写 `docs/current_status.md`。
- `mobile/AGENTS.md` 要求写代码前阅读 Expo 57 的精确版本文档：`https://docs.expo.dev/versions/v57.0.0/`。
- 不擅自安装依赖、迁移数据库、删除数据、提交或推送 Git。

## 建议实施顺序

1. `plans/01-foundations-observation-flow.md`
2. `plans/02-archive-journey.md`
3. `plans/03-product-medicine-archive.md`
4. `plans/04-supporting-pages-and-release-audit.md`

每一阶段独立验收，通过后再开始下一阶段。不要一次性重写全部页面。

## 给新 Codex 任务的提示词

```text
请在项目 D:\Mia\agent_tryout\skin_care_agent 中实施 Skin Care Agent 全局 UI 重构。

本次工作的唯一设计交接入口是：
D:\Users\yumeifeng\Documents\Codex\2026-08-31\d-mia-agent-tryout-skin-care\outputs\skin-care-ui-rebuild-handoff-v1\CODEX_START_HERE.md

请先完整读取该文件列出的项目资料、视觉规范、四组金标准页面和实施计划，并使用 $quiet-botanical-ui。先检查当前 Git 状态和唯一 ACTIVE 计划；不要覆盖用户未提交改动，不要直接复用交接包里的参考图片，不要改变业务逻辑、API、数据语义、隐私或医学边界。

先只执行第一阶段 plans/01-foundations-observation-flow.md。按测试先行的顺序逐项完成，每完成一个可独立验证的切片就运行对应测试、TypeScript 检查和 Expo lint，并展示关键手机视口的真实渲染结果供我验收。第一阶段未验收前不要进入后续阶段。
```

## 基础验收命令

在 `mobile` 中运行：

```powershell
npm run test:unit
npm run typecheck
npm run lint
```

真机与视觉验收不能被静态检查替代。相机流程至少在一台常见 Android 和一台 iPhone 上检查权限恢复、预览、键盘、安全区、减少动态效果和长文案。

