# Skin Care Agent 项目入口

> 状态：ACTIVE
>
> 更新日期：2026-08-29
>
> 职责：说明项目资料入口、稳定产品方向和开发边界，不复制当前进度，也不替代产品规格。

## 会话启动顺序

处理本项目的产品、设计、代码或测试任务前，按顺序读取：

1. `project_background.md`；
2. `design/product/skin_care_app_mvp_spec.md`；
3. `docs/current_status.md`；
4. `docs/current_status.md` 指定的唯一 ACTIVE 实施计划；没有 ACTIVE 计划时，不得沿用历史计划。

## 信息源

| 要回答的问题 | 权威来源 |
|---|---|
| 当前 MVP 做什么、如何工作、如何验收 | `design/product/skin_care_app_mvp_spec.md` |
| 现在已经实现什么、验证到哪里、下一步是什么 | `docs/current_status.md` |
| 如何配置和运行本地环境 | `docs/environment_setup.md` |
| 当前任务如何实施 | `docs/current_status.md` 指定的唯一 ACTIVE 计划 |
| 早期设想、旧原型、旧进度和历史决策 | Git 历史及外部备份 |

`docs/current_status.md` 是唯一当前进度视图。项目不再维护独立的 overnight、会话流水或第二份状态日志。

## 稳定产品方向

Skin Care Agent 是面向希望长期回看皮肤外观变化用户的个人记录工具，包含 React Native + Expo 移动端和 FastAPI 后端。

当前核心闭环是：用户拍摄一张照片或使用文字，主动选择一个或多个固定面部区域，系统只整理所选区域的中性可见状态，并把有效时间点组织到区域事件中回看。实际产品使用与生活背景是独立事实，可以按时间并列展示，但不参与 AI、趋势、推荐、相关性、疗效或因果判断。

底部导航固定为观察、历程、产品、我的。产品栏以个人产品柜为入口，通过配方版本级标准目录提供图片、受控搜索和有来源的官方资料，同时保留用户自建产品和“未注明产品”。完整范围、行为与验收只以 MVP 规格为准。

## 技术基线

| 层级 | 当前选型 |
|---|---|
| 移动端 | React Native、Expo SDK 57、Expo Router、TypeScript |
| 后端 | FastAPI、SQLAlchemy、PostgreSQL、Alembic |
| 开发存储 | 本地文件系统与签名 URL |
| AI 调用 | 统一 provider gateway、版本化 Prompt/Schema、结构校验、安全修正和失败降级 |

迁移 head、测试数量、设备验收和当前阻塞容易变化，只在 `docs/current_status.md` 维护，不在本文件重复。

## Legacy 边界

以下能力可能仍存在于代码中，但不定义当前 MVP：

- 正面、左侧、右侧三张必拍；
- 旧拍摄质量门槛和几何标准化主流程；
- 医学化分析字段、严重度和综合皮肤指数；
- 旧按日分数趋势和 Patch lineage；
- 开放式 AI 问答和旧日记结构。

这些代码不因当前状态页更新而自动删除。新功能优先复用认证、协议、账号隔离、存储、幂等、AI gateway 和 Expo 基础，并保持旧数据与迁移链可恢复。

## 工作规则

- 产品问题先查 MVP 规格；
- 进度问题只查 `docs/current_status.md`，再用代码、测试、迁移、设备或 Git 证据复核；
- ACTIVE 计划只能细化 MVP，不能新增产品决策；
- 没有 ACTIVE 计划时不从旧日志、旧 SVG 或 Git 历史自行续做；
- 完成一个可独立验证的阶段后更新当前状态页，历史变化由 Git 保存；
- 不以静态 Mock 代替真实持久化闭环，不把 legacy 能力宣称为当前 MVP。
