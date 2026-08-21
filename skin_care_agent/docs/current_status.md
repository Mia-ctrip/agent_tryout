# Skin Care Agent 当前实现状态

> 状态：ACTIVE
>
> 核验日期：2026-08-21
>
> 代码核验基线：`main`，提交 `4b2dad1`
>
> 职责：记录经代码、测试、数据库迁移和 Git 验证的当前事实。产品范围以 `design/product/skin_care_app_mvp_spec.md` 为准。

## 当前结论

仓库包含一套能够通过现有自动化检查的旧版产品实现，但新版“全脸观察—异步 AI—实际产品使用—历史趋势”闭环尚未落地。

适合复用的是认证、协议、账号隔离、存储、签名 URL、请求幂等模式、通用 AI gateway、Expo 基础和相机权限封装。旧三视角 CheckIn、医学化分析、皮肤指数趋势、Patch lineage、聊天和旧日记不能直接进入新流程。

产品切片、四栏导航、个人产品范围和 `observation_scope` 方向已经由用户确认。书面 MVP 规格已转为 ACTIVE；准备阶段＋切片 1 的实施计划已经生成，但尚未开始执行。

## 验证口径

| 状态 | 含义 |
|---|---|
| 已实现并验证 | 代码存在，且有当前自动化检查或明确迁移证据 |
| 部分实现 | 有可复用基础，但接口、数据语义或流程不满足新版 MVP |
| Legacy | 代码能够工作，但属于旧产品，不能视为 MVP 完成 |
| 未实现 | 没有发现满足新版 MVP 的模型、API、页面和测试闭环 |
| 待验证 | 文档或代码有声明，但缺少足够运行证据 |

## 已确认但尚未实现的产品决策

- 当前 MVP 自动使用 `scope_type = full_face`，不展示区域选择页；
- 数据边界预留未来 `region`，但全脸不是第七个区域；
- 后续“全脸”和“选择区域”互斥，全脸历史不自动并入区域事件或区域趋势；
- 底部导航为观察、历程、产品、我的四栏；
- 首版只做个人产品柜、手动录入和“未注明产品”，不做平台总产品池；
- 切片顺序为全脸异步记录、产品使用、重复记录与贴纸、阶段趋势、公开测试就绪；
- 区域选择、区域事件和区域趋势延后到 MVP 之后。

这些是产品范围事实，不代表代码已经完成。

## 后端现状

| 能力 | 状态 | 证据与说明 |
|---|---|---|
| 邮箱密码注册、登录、Token 刷新和登出 | 已实现并验证 | `backend/app/api/auth.py`、`backend/app/services/auth_service.py`、`backend/tests/test_auth.py` |
| 协议、用户隔离和授权基础 | 已实现并验证 | `backend/app/api/me.py`、`backend/app/services/consent_service.py`、认证相关测试 |
| 本地对象存储和签名 URL | 已实现并验证 | `backend/app/services/storage_service/`、`backend/app/api/files.py`、照片测试 |
| 请求幂等基础 | 部分实现 | 旧 CheckIn 使用 `client_request_id`；新版 ObservationRecord 契约未实现 |
| 通用 AI provider gateway | 部分实现 | `backend/app/services/ai_gateway/` 已有 provider、fallback、校验和调用追踪；新版异步任务和业务状态机未实现 |
| 旧 CheckIn、三视角照片和聚合 | Legacy | `backend/app/api/check_ins.py`、`backend/app/services/check_in_aggregation.py` |
| 旧照片质量和几何处理 | Legacy | `backend/app/services/vision/quality.py`、`normalization.py`；新版只能做文件可读校验 |
| 医学化照片分析 | Legacy | `backend/app/schemas/analysis.py`、`backend/app/services/analysis_service.py` |
| Patch lineage、旧趋势和聊天 | Legacy | `backend/app/api/lineages.py`、`trends.py`、`chat.py` 及对应服务和模型 |
| ObservationRecord 与 ObservationTarget | 未实现 | 未发现与旧 CheckIn 分离的新领域模型 |
| `full_face` 观察范围与结构化事实 | 未实现 | 旧 Analysis Schema 仍含医学化字段，不满足新版语义 |
| 原始保存与异步 AI 状态分离 | 未实现 | 未发现 saving/saved/save_failed 与 queued/processing/completed/needs_input 的新状态链路 |
| 无照片和 AI 失败文字降级 | 未实现 | 旧日记不能证明新版有效观察记录闭环 |
| 个人产品与实际使用 | 未实现 | 未发现多产品、未注明产品、真实使用时间和个人产品历史的新模型 |
| 生活背景贴纸 | 未实现 | 未发现固定贴纸字典与观察记录关联 |
| 全脸前后变化和阶段趋势 | 未实现 | 现有趋势基于旧皮肤指数，不满足证据引用和 3 点 7 天门槛 |

## 数据库现状

- Alembic 迁移链位于 `backend/app/db/migrations/versions/`；
- 当前 migration head 是 `0012_app_foundation`；
- 已有用户、照片、分析、AI 调用、聊天、Patch lineage、CheckIn、旧日记和 App 基础字段；
- 尚未发现 ObservationRecord、ObservationTarget、全脸事实、个人产品、实际使用、生活贴纸和证据趋势所需的新结构；
- 历史迁移必须保留。新版只追加迁移，不回写旧迁移，也不把旧数据直接当成新版趋势证据。

## 移动端现状

| 能力 | 状态 | 证据与说明 |
|---|---|---|
| Expo Router 工程和会话恢复 | 已实现并验证 | `mobile/src/app/_layout.tsx`、`mobile/src/providers/session-provider.tsx` |
| 注册、登录和协议页面 | 已实现并验证 | `mobile/src/app/login.tsx`、`register.tsx`、`consents.tsx` |
| 相机权限和拍摄基础 | 部分实现 | 可复用相机能力位于 `mobile/src/lib/camera-*`；现有业务流程要求旧三视角 |
| 旧三视角 CheckIn | Legacy | `mobile/src/app/check-in.tsx`、`mobile/src/lib/check-in-*` |
| 旧分析、日记和皮肤指数趋势 | Legacy | `mobile/src/app/analysis/`、`diary/`、`trends.tsx` 及对应 lib 文件 |
| 四栏导航 | 未实现 | 当前路由仍围绕旧首页、CheckIn、分析、日记和趋势 |
| 单照片全脸异步记录 | 未实现 | 未发现保存恢复、异步轮询/刷新和结果重开闭环 |
| 无照片或 AI 失败文字降级 | 未实现 | 未发现满足新版状态机的生产页面和 API 调用 |
| 个人产品柜和多产品使用 | 未实现 | 未发现对应生产页面、状态管理和 API |
| 生活贴纸与新版历程 | 未实现 | 未发现对应页面、持久化和回读 |
| 全脸证据比较与趋势 | 未实现 | 未发现基线/前后变化/3 点 7 天趋势页面 |

## 主题与视觉现状

- `mobile/src/constants/theme.ts` 仍以旧绿色为主，不符合新版鸢尾紫、暖白和深暖灰基线；
- 共享主题常量具备改造成语义 token 的基础；
- 零散硬编码色主要位于照片叠层和 legacy 页面；
- 配色调整应在准备阶段服务新壳层和新页面，不要求重绘即将隐藏的 legacy 页面。

## 最近一次自动化验证

以下结果来自 2026-08-21 对代码基线的调查与测试：

| 检查 | 结果 |
|---|---|
| 后端 `pytest` | 44 项通过 |
| 后端 Ruff | 通过 |
| 移动端 `npm run test:unit` | 73 项通过 |
| 移动端 `npm run typecheck` | 通过 |
| 移动端 `npm run lint` | 通过 |

这些检查只证明 legacy 基线没有已知回归，不证明新版 MVP 已完成。当前仍缺少：

- 新领域模型和 API 的数据库集成测试；
- 移动端与真实后端的端到端测试；
- 真实 AI provider 联调；
- Android 和 iOS 真实设备或模拟器的完整用户闭环证据；
- 生产存储、授权撤回、数据导出、隐私和公开测试安全验证。

## 可复用与隔离原则

优先复用：

- 账号认证、协议和用户隔离；
- 本地存储与签名 URL；
- 请求幂等模式；
- AI gateway 的 provider 抽象、fallback、合规校验和调用追踪；
- Expo 工程、Token 安全存储、基础组件和相机权限封装。

按切片修改或隔离：

- 旧 CheckIn 和三视角路由；
- 拍照质量门槛；
- 医学化 AI Schema；
- 皮肤指数趋势和 Patch lineage；
- 聊天和旧日记。

在新版迁移和兼容策略明确前，不删除旧业务表、历史迁移或旧数据读取能力。

## 当前工作状态

- 文档治理：已建立唯一入口，历史噪音资料已从当前 fork 清除；
- MVP 规格：`design/product/skin_care_app_mvp_spec.md`，状态 ACTIVE；
- ACTIVE 实施计划：`docs/superpowers/plans/2026-08-21-full-face-observation-slice-1.md`；
- 当前计划范围：准备阶段＋切片 1；
- 当前执行进度：尚未开始，代码和迁移仍停留在核验基线；
- 当前阻塞：无；
- Slice 2 进入门禁：切片 1 前端、后端、数据库和异步 AI 全部实现，技术验收有证据，并由用户明确确认验收通过；
- 下一步：用户选择执行方式后，从计划 Task 1 开始；
- 禁止动作：不得跳到切片 2、区域能力或旧迁移方案。

## 更新规则

每完成一个可独立验证的切片或子步骤，直接更新本文件的当前事实、验证结果、阻塞和下一步。不要追加会话流水；Git 历史负责保存过去版本。没有代码、测试、迁移或 Git 证据时写“待验证”。
