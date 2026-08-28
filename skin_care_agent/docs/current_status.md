# Skin Care Agent 当前实现状态

> 状态：ACTIVE
>
> 核验日期：2026-08-28
>
> 代码核验基线：`feat/mvp-dev`；此分支是当前 MVP 验收源
>
> 职责：记录经代码、测试、数据库迁移和 Git 验证的当前事实。产品范围以 `design/product/skin_care_app_mvp_spec.md` 为准。

## 当前结论

Slice 2“固定区域选择与按区域 AI”和 Slice 3“区域事件与时间点回看”已完成前后端实现及本地验收。新记录支持额头、本人左侧脸、本人右侧脸、鼻周、口周、下巴一至六个目标；保存前必须显式确认，服务端按用户和 `client_request_id` 原子幂等保存一张原图和全部目标。每个目标独立 queued/processing/completed/needs_input，独立展示、补录和恢复。

Slice 1 已复用认证、协议、账号隔离、存储、签名 URL、通用 AI gateway、Expo 基础和相机权限封装，并新建独立 Observation 领域。旧三视角 CheckIn、医学化分析、皮肤指数趋势、Patch lineage、聊天和旧日记未进入新流程。

区域 AI 使用独立 `region-observation-1.0.0` Prompt/Schema，稳定传入区域 ID，并拒绝未选区域、全脸结论、医学分类、评分、严重度、治疗、产品或因果内容。第二次响应仍越界时只保留可安全归属本区域的事实；没有可用本区域事实才进入人工补录。事件按设备本地日期组织：29 天内自动延续，30 天起由用户选择继续或新建；pending 事件和无效目标不可见。Slice 1 非阻塞遗留继续保持冻结。

Slice 4“实际产品使用与个人产品柜”和 Slice 5“历程整合与生活背景”现已完成前后端实现及本地验收。产品使用是独立事实，支持个人产品手动添加、多选、零关联“未注明产品”、真实发生时间、备注、幂等重试和产品历史。六项固定生活背景关联一次 Observation，可保存原始选择或明确空选择跳过，并在观察及相应区域事件时间点回看。统一历程按真实发生时间聚合区域事件、历史全脸和产品使用；产品与贴纸不进入 AI、趋势、相关性、疗效或因果判断。

产品范围已新增 Slice 4A“标准产品目录、搜索与图片”，当前完成 Task 1–11。后端已具备标准目录、别名、图片资产、说明书和清理队列模型，迁移已扩展个人产品的标准引用及产品使用快照字段；用户自建产品支持可选 JPEG/PNG/WebP 图片、固定 UUID 幂等、竞态对象清理、账号隔离和旧 JSON 创建兼容。版本化目录包现可严格校验并执行幂等正式导入：内容寻址资产先暂存，目录事务按稳定编码更新当前引用，旧图片和说明书版本不覆盖，显式停用保留稳定产品，事务失败只登记无引用对象供清理。统一搜索现按个人完全匹配、标准正式名称/品牌、受控别名、前缀、包含和 PostgreSQL trigram 模糊匹配稳定分页，只暴露当前账号个人产品并排除 inactive 标准产品；标准详情可按稳定 ID 读取当前主图与有来源、有版本的官方原文，不生成摘要或推荐。认证用户可用固定 UUID 将 active 标准产品幂等加入个人柜，同一账号同一标准产品只有一行，并发唯一约束竞态返回已提交赢家；个人柜读取显示覆盖名或当前标准名称/图片而不复制标准图片对象。产品使用现在在关联表写入名称、品牌、版本、图片资产和说明书版本快照，目录更新不改写历史使用；移动端已接入目录搜索、可选图片自建、标准资料详情、加入并选中及历史快照卡片。另有一个仅 `APP_ENV=dev` 挂载的临时 multipart 表单接口，供本地在 `/docs` 快速录入一款化妆品并立即体验搜索、加入产品柜和产品使用；每次提交由服务端生成 UUID、目录编号、导入批次和图片元数据，不替代正式目录包导入，也不接受药品或医疗器械。Task 12 的真实设备与完整闭环验收尚未执行，不能宣称 Slice 4A 完成。

产品栏 UX/UI 第一阶段优化已于 2026-08-28 结束。用户验收确认产品列表、详情、实时搜索新增和自建新增功能通过，修改后的操作动线与信息取舍使 UX 取得明显进步；当前视觉 UI 仍未达到用户期望，不视为最终视觉定稿，留待后续独立视觉优化阶段处理。

## 验证口径

| 状态 | 含义 |
|---|---|
| 已实现并验证 | 代码存在，且有当前自动化检查或明确迁移证据 |
| 部分实现 | 有可复用基础，但接口、数据语义或流程不满足新版 MVP |
| Legacy | 代码能够工作，但属于旧产品，不能视为 MVP 完成 |
| 未实现 | 没有发现满足新版 MVP 的模型、API、页面和测试闭环 |
| 待验证 | 文档或代码有声明，但缺少足够运行证据 |

## 已确认的产品决策

- 切片 1 既有记录使用 `scope_type = full_face`；切片 2 起新记录只创建一个至六个固定 `region` 目标；
- 固定区域为额头、用户左侧脸、用户右侧脸、鼻周、口周、下巴；全脸不是第七个区域；
- 全脸历史不自动并入区域事件或区域趋势；
- 底部导航为观察、历程、产品、我的四栏；
- 产品使用以个人产品柜为入口；新增配方版本级标准产品目录、图片、受控搜索和官方说明书原文，并保留用户自建和“未注明产品”；
- 标准目录采用双层引用、版本化离线导入和历史快照，不建设正式运营后台，不输出推荐、疗效、用药建议、相关性或因果判断；仅在开发环境保留临时化妆品表单入口以便体验；
- 当前顺序为全脸异步基线、固定区域与按区域 AI、区域事件、产品使用基础、标准产品目录、历程与贴纸、既有全脸趋势、公开测试就绪；
- 区域趋势仍延后到后续切片 8，不得混入切片 2–3。

Slice 1 历史全脸范围、四栏导航、固定区域、区域事件、产品使用基础、个人产品柜、统一历程与生活背景均已实现；标准产品目录完成 Task 1–11 的模型、迁移、用户图片、导入、搜索、详情、去重加入、不可变使用快照和移动端用户闭环，全脸趋势仍未实现。

## 后端现状

| 能力 | 状态 | 证据与说明 |
|---|---|---|
| 邮箱密码注册、登录、Token 刷新和登出 | 已实现并验证 | `backend/app/api/auth.py`、`backend/app/services/auth_service.py`、`backend/tests/test_auth.py` |
| 协议、用户隔离和授权基础 | 已实现并验证 | `backend/app/api/me.py`、`backend/app/services/consent_service.py`、认证相关测试 |
| 本地对象存储和签名 URL | 已实现并验证 | `backend/app/services/storage_service/`、`backend/app/api/files.py`、照片测试 |
| 请求幂等与原图可靠保存 | 已实现并验证 | Observation 创建使用 `client_request_id` 幂等；数据库提交后才调度 AI，失败重试返回同一记录 |
| 通用 AI provider gateway | 已实现并验证 | 路由遵循显式 primary/fallback；GLM-4.6V 视觉 payload、无静默 Mock、超时重试、调用追踪和失败降级已验证；原始响应和字段级修正审计均可追踪 |
| 旧 CheckIn、三视角照片和聚合 | Legacy | `backend/app/api/check_ins.py`、`backend/app/services/check_in_aggregation.py` |
| 旧照片质量和几何处理 | Legacy | `backend/app/services/vision/quality.py`、`normalization.py`；新版只能做文件可读校验 |
| 医学化照片分析 | Legacy | `backend/app/schemas/analysis.py`、`backend/app/services/analysis_service.py` |
| Patch lineage、旧趋势和聊天 | Legacy | `backend/app/api/lineages.py`、`trends.py`、`chat.py` 及对应服务和模型 |
| ObservationRecord 与 ObservationTarget | 已实现并验证 | `backend/app/models/observation.py` 与迁移 `0013_full_face_observations`；独立于旧 CheckIn |
| `full_face` 观察范围与结构化事实 | 已实现并验证 | 固定 `full_face` target 与七项中性可见事实；HTTP DTO 明确返回 `region_id: null`；Prompt 1.2 与确定性字段级安全修正均有回归测试 |
| 原始保存与异步 AI 状态分离 | 已实现并验证 | 创建接口先提交记录和原图，再调度 queued → processing → completed/needs_input |
| 无照片和 AI 失败文字降级 | 已实现并验证 | 支持纯文字记录；AI 失败时保留照片并允许补充文字完成记录 |
| 固定区域、多目标幂等持久化 | 已实现并验证 | 迁移 `0014_region_observation_targets`、区域字典、`targets_json` 和 PostgreSQL 集成测试；一张原图对应一至六个区域目标 |
| 按区域 AI 与独立状态恢复 | 已实现并验证 | 区域 Prompt、Schema、越界校验/修正、按目标 Worker、详情轮询和目标级人工补录均有自动化与本地 HTTP 闭环证据 |
| 区域事件与时间点回看 | 已实现并验证 | 迁移 `0015_region_events`；pending/current/ended、30 天选择、主动结束、账号隔离、有效时间点过滤和回看 API 均已验证 |
| 个人产品与实际使用 | 已实现并验证 | `0016_products_and_uses`、真实产品/使用 API、多产品与零关联“未注明”、幂等、账号隔离及产品历史均通过 PostgreSQL HTTP 闭环 |
| 标准产品目录、图片与说明书 | 部分实现 | Task 1–11 已实现目录/图片/说明书 ORM、`0018`/`0019` 迁移、双层引用、运行时不可变使用快照、用户自建图片、版本化正式导入、统一稳定搜索、标准详情、幂等去重加入及移动端搜索/自建/详情/使用集成；另有只在 `APP_ENV=dev` 挂载的临时化妆品 multipart 表单入口，自动生成技术元数据，可填写浓度/规格、说明书和搜索关键词（保存为受控别名），不能用于药品或医疗器械；Task 12 默认回归、脚本单测、SDK 57 依赖对齐和 Pixel 8 Expo Go 登录页启动已通过，但真实隔离 PostgreSQL 闭环与产品流验收仍待完成 |
| 生活背景贴纸 | 已实现并验证 | `0017_life_contexts`、固定六项字典、选择/替换/显式跳过、账号隔离及观察/事件回看均通过 PostgreSQL HTTP 闭环 |
| 统一历程 | 已实现并验证 | `/api/v1/timeline` 只读聚合区域事件、历史全脸与产品使用，按真实发生时间排序并标注来源，不输出关联或疗效字段 |
| 全脸前后变化和阶段趋势 | 未实现 | 现有趋势基于旧皮肤指数，不满足证据引用和 3 点 7 天门槛 |

## 数据库现状

- Alembic 迁移链位于 `backend/app/db/migrations/versions/`；
- 当前代码和本地开发数据库 migration head 是 `0019_personal_product_links`；
- 已有用户、照片、分析、AI 调用、聊天、Patch lineage、CheckIn、旧日记和 App 基础字段；
- `0014` 增加设备当地日期、区域目标文字和六区约束；`0015` 增加区域事件、目标归属和 current/pending 唯一约束；
- `0016` 增加个人产品、产品使用及多对多关联；`0017` 增加观察生活背景完成时间与固定贴纸关联；`0018` 增加标准目录、图片资产、说明书、导入批次和清理队列；`0019` 增加个人产品标准引用、用户图片与产品使用快照字段；
- 已实际执行 head → `0013` → head 往返，旧 Observation 行数与最终 schema 指纹保持不变；产品与生活背景数据通过关闭并重建 HTTP 客户端后的 PostgreSQL 恢复验证；
- 历史迁移必须保留。新版只追加迁移，不回写旧迁移，也不把旧数据直接当成新版趋势证据。

## 移动端现状

| 能力 | 状态 | 证据与说明 |
|---|---|---|
| Expo Router 工程和会话恢复 | 已实现并验证 | `mobile/src/app/_layout.tsx`、`mobile/src/providers/session-provider.tsx` |
| 注册、登录和协议页面 | 已实现并验证 | `mobile/src/app/login.tsx`、`register.tsx`、`consents.tsx` |
| 相机权限和单张照片 | 已实现并验证 | 新记录页只在选择拍照后请求权限，支持拍摄、预览、重拍和取消；旧三视角保留为 legacy |
| 旧三视角 CheckIn | Legacy | `mobile/src/app/check-in.tsx`、`mobile/src/lib/check-in-*` |
| 旧分析、日记和皮肤指数趋势 | Legacy | `mobile/src/app/analysis/`、`diary/`、`trends.tsx` 及对应 lib 文件 |
| 四栏导航 | 已实现并验证 | `(tabs)` 固定为观察、历程、产品、我的；旧页面不再作为主导航入口 |
| 单照片全脸异步记录 | 已实现并验证 | 新建页保存单张照片，详情页轮询异步结果，历程页可重新进入同一记录 |
| 无照片或 AI 失败文字降级 | 已实现并验证 | 支持纯文字保存；`needs_input` 可补充文字，且不显示内部失败码和 provider 信息 |
| 固定区域选择与保存前确认 | 已实现并验证 | 六区固定顺序、本人真实左右说明、上次选择恢复、选择变更使确认失效、逐区域文字与结构化提交均已覆盖 |
| 多区域详情与恢复 | 已实现并验证 | 按目标独立轮询、事实/来源/降级卡片；一个目标失败不遮住其他目标 |
| 区域事件组织与回看 | 已实现并验证 | 30 天合并确认、观察页 current 事件、历程页事件优先/历史全脸分区、事件时间点详情和主动结束已实现 |
| 个人产品柜和多产品使用 | 已实现并验证 | 产品栏已按使用频次展示带图横向卡片、汇总事实和最近使用，支持左滑露出归档动作、查看产品详情和同页说明书；归档后端接口待实现，前端不伪造成功。使用页多选/未注明/真实时间/备注、观察快捷入口和历程使用分区保持不变 |
| 标准产品搜索与图片选择 | 已实现并验证 | 独立新增页按输入实时搜索个人与标准产品，不默认展示完整目录；无匹配后才提供自建入口。Pixel 8 已验证标准产品加入和无图自建产品加入，历史使用仍按快照显示 |
| 生活背景选择与回看 | 已实现并验证 | 观察完成后可多选固定贴纸或全部跳过；观察详情和区域事件时间点显示原始选择，并固定说明不进入 AI、趋势或关联 |
| 新版统一历程 | 已实现并验证 | 区域事件、历史全脸和产品使用由同一真实 API 按发生时间排序；事件与全脸可下钻，产品使用保持事实文案 |
| 全脸证据比较与趋势 | 未实现 | 未发现基线/前后变化/3 点 7 天趋势页面 |

## 主题与视觉现状

- 产品栏五个设计状态已使用鼠尾草语义 token：品牌草木绿 `#9BAD50`、主操作深绿 `#71813C`、奶油底色 `#F8F0DD`、蜂蜜金 `#E8C76A`、深苔灰 `#46502C` 和柔白 `#FFFDF7`；
- 本次按边界只改产品列表、左滑归档、产品详情、搜索匹配和无匹配自建；其他四栏页面未做视觉重绘；
- 产品栏第一阶段功能与 UX 已获用户验收通过；视觉 UI 未达到最终目标，本阶段按“UX 通过、视觉待续”收口，不继续在当前实施计划内扩张；
- 产品图片保持中性原图，不叠加主题滤镜；颜色不表达疗效、改善或推荐。

## 最近一次自动化验证

以下结果包含 2026-08-24 对 Slice 2–5 工作树的最终回归；后续 Slice 1 行保留为历史验收证据：

| 检查 | 结果 |
|---|---|
| 产品栏鼠尾草 UI 迭代 | 移动端 137 项单元测试、TypeScript、Expo lint 和 diff-check 通过。Pixel 8 + Expo Go 57 已验证：4 个预录带图产品按 4/3/2/1 次使用排序、右侧左滑归档揭示态、产品详情同页官方说明书和中文本地记录时间、标准产品实时搜索加入、无匹配后自建无图产品加入；产品柜由 4 件增至 6 件。归档点击明确显示后端接口待完成，不写入假状态。2026-08-28 用户确认功能与 UX 验收通过、第一阶段结束；视觉 UI 尚未达到期望，留待后续视觉阶段 |
| 开发环境临时标准产品表单 | FastAPI `/docs` 中公开 multipart 表单；开发/生产 OpenAPI 挂载边界通过，真实 PostgreSQL HTTP 闭环覆盖图片校验、自动 UUID/目录元数据、浓度、说明书与关键词别名搜索命中；Ruff 与 diff-check 通过 |
| Slice 4A Task 12 当前状态 | 后端默认回归 184 项通过、27 项默认跳过；移动端 128 项通过、TypeScript 与 Expo lint 通过；闭环脚本单测 2 项通过、Ruff 与 diff-check 通过。SDK 57 依赖已按 Expo 兼容版本对齐，Pixel 8 Expo Go 57.0.9 清缓存 bundle 与业务登录页启动通过；本地测试账号及四项协议已准备。`scripts/verify_standard_product_catalog_flow.py` 使用随机 schema 和临时本地存储，但当前 worktree 默认 PostgreSQL 凭据不能建立新连接，脚本尚未实际运行，不能宣称 Slice 4A 完成 |
| Slice 4A Task 8–11 快照与移动端目录流程 | 完整后端回归 181 项通过、26 项默认跳过；真实 PostgreSQL 产品/目录 HTTP 组合闭环 22 项通过。覆盖标准产品 v1 使用快照在 v2 目录更新后的名称、品牌、配方、图片资产和说明书版本保留，当前个人柜仍读取最新资料；移动端 128 项单元测试、TypeScript 和 Expo lint 通过，覆盖搜索 URL/JSON/multipart 契约、陈旧响应阻断、加入后只选中一次、可选图片描述、来源与非推荐边界文案。后端 Ruff、compileall 与 diff-check 通过，暂存区为空 |
| Slice 4A Task 7 从标准目录加入个人柜 | 完整后端回归 180 项通过、25 项默认跳过；柜内 Schema/覆盖名与真实 PostgreSQL 聚焦 7 项通过；目录、柜内加入及既有产品 HTTP 组合闭环 15 项通过。覆盖请求 UUID 优先幂等、同用户标准产品唯一去重、PostgreSQL `IntegrityError` 赢家恢复、inactive 409、unknown 404、覆盖名裁剪/空白/超长校验、跨账号独立柜、v2 当前名称和图片解析、不复制目录图片、legacy 120 字名称兼容，以及旧 JSON 自建/图片/产品使用/恢复流程；全后端 Ruff、compileall 和 diff-check 通过，暂存区为空 |
| Slice 4A Task 6 统一搜索与标准详情 API | 完整后端回归 176 项通过、22 项默认跳过；聚焦 Schema、游标与 OpenAPI 11 项通过；真实 PostgreSQL 搜索/详情 HTTP 2 项通过，完整目录导入/搜索集成文件 9 项通过。覆盖全半角、大小写、空白和标点归一化，英文与受控拼音别名，个人/标准/别名完全匹配、前缀、包含、trigram 错拼、稳定游标、inactive 排除、柜内标记、账号隔离、用户自建结果、图片与原始文档 URL 重新签名，以及停用产品按稳定 ID 的原文详情读取；全后端 Ruff、compileall 和 diff-check 通过，暂存区为空 |
| Slice 4A Task 5 目录持久化与版本更新 | 完整后端回归 170 项通过、20 项默认跳过；Task 4→5 聚焦单元、图片、真实 PostgreSQL 导入及迁移往返共 38 项通过。Task 5 PostgreSQL 导入 7 项通过，覆盖同包与唯一约束竞态幂等、v2 当前图/说明书切换、旧版本保留、显式停用、不可改写说明书版本、失败回滚、仅无引用键清理登记及登记失败键报告；v1/v2 CLI dry-run 均输出产品 3、别名 4、说明书 2、图片 3、零错误；Ruff、compileall 和 diff-check 通过 |
| Slice 4A Task 4 包校验与 dry-run | 完整后端回归 169 项通过、13 项默认跳过；Task 3→4 组合聚焦 29 项通过；CLI 对合成 v1 包输出产品 3、别名 4、说明书 2、图片 3 且零错误；Ruff、compileall 和 diff-check 通过。回归同时确认受限 `search_path` 下 0018/0019 trigram 索引可迁移，且 Alembic 不再关闭应用日志器 |
| Slice 4A Task 3 后端聚焦 | 图片校验、产品/目录模型和 OpenAPI 共 21 项通过；Task 3 Ruff 通过 |
| Slice 4A Task 3 PostgreSQL HTTP 闭环 | 3 项通过：带图/无图自建、无效图片重试 UUID 幂等、竞态对象保护、图片 URL 账号隔离，以及既有 JSON 产品/使用/恢复流程兼容；未调用第三方服务 |
| Slice 4A Task 1–2 PostgreSQL 迁移 | 随机 schema 中 9 项通过；覆盖 `0017 → 0019 → 0017 → 0019`、旧产品/使用保留、Unicode 归一化回填、约束和 trigram 索引；Task 1/2 已通过独立复审 |
| Slice 4–5 后端完整回归 | 134 项通过、12 项默认跳过；Ruff `app tests scripts` 通过 |
| Slice 4–5 PostgreSQL 强制集成 | 11 项通过、1 项 live GLM 显式跳过；含产品/使用、贴纸、统一历程、新 HTTP 客户端恢复、账号隔离及 head→0013→head 迁移往返 |
| Slice 4–5 移动端完整回归 | 119 项通过；TypeScript 与 Expo lint 通过 |
| Slice 4–5 组合 HTTP 闭环 | 产品与使用 UUID 幂等、产品历史、选择/跳过贴纸、观察与事件恢复、统一时间线及跨账号 404 通过；未调用第三方 AI |
| Slice 2–3 后端完整回归 | 127 项通过、8 项显式集成/真实模型测试在默认模式跳过；Ruff `app tests scripts` 通过 |
| Slice 2–3 PostgreSQL 强制集成 | 7 项通过：旧全脸持久化、区域多目标幂等、事件完整生命周期与 open 唯一约束、真实 FastAPI HTTP 闭环、0014/0015 往返迁移 |
| Slice 2–3 移动端完整回归 | 103 项通过；TypeScript 与 Expo lint 通过 |
| 区域本地 HTTP 闭环 | 真实 FastAPI、认证/协议、PostgreSQL、本地对象存储和 gateway 路由：左脸确定性 AI 成功、下巴确定性失败、重复 UUID、目标补录、事件激活、客户端重启恢复、临时账号及照片清理均通过 |
| 区域 AI 输出边界 | 区域稳定 ID/本人左右 Prompt、跨区域/全脸拒绝、医疗与建议拒绝、二次响应字段级保守修正及无可用本区域事实降级均通过 |
| 外部模型边界 | 本轮未新增 GLM 请求；无人值守规则禁止向第三方提交照片。既有 Slice 1 GLM 证据仍有效，但不冒充本轮区域远端模型验收 |
| 后端 `pytest` | 97 项通过、2 项因未提供独立集成测试数据库而跳过 |
| 后端 Ruff | 通过 |
| 移动端 `npm run test:unit` | 94 项通过 |
| 移动端 `npm run typecheck` | 通过 |
| 移动端 `npm run lint` | 通过 |
| Slice 1 Task 1 模型测试 | 2 项通过 |
| `0013_full_face_observations` 往返迁移 | 临时 PostgreSQL schema 中 upgrade → downgrade 0012 → upgrade 通过；清理后 `public` schema 指纹不变 |
| Slice 1 Task 2 契约测试 | 15 项通过；严格七字段、安全校验、full_face HTTP DTO 和版本化 prompt 已验证 |
| Slice 1 Task 3 后端回归 | 73 项通过；幂等照片/文字创建、文件校验、对象清理与 OpenAPI 已验证 |
| Slice 1 Task 4 后端回归 | 83 项通过；提交后调度、原子认领、gateway fallback、调用日志和失败状态已验证 |
| Slice 1 Task 5 后端回归 | 89 项通过；列表、详情、签名 URL、Bearer 保护、账号隔离和人工降级已验证 |
| Slice 1 Task 6 PostgreSQL 集成 | 1 项强制运行并通过；完整后端 90 项通过，临时 schema 已清理且 `public` 未变化 |
| Slice 1 Task 7 移动端基础层 | 79 项单元测试通过；Observation 精确合约、无旧字段表单、认证请求路径、轮询退避和相机兼容别名已验证；typecheck、lint 通过 |
| Slice 1 Task 8 导航与主题 | 83 项单元测试通过；四栏顺序、跨平台图标、认证边界、七色主题和 legacy 语义映射已验证；typecheck、lint 通过；主要 CTA 对比度 4.98:1 |
| Slice 1 Task 9 单次记录页 | 87 项单元测试通过；单张照片可空备注、纯文字必填并裁剪、重拍/重试保留 UUID、通用 UUID 兼容旧流程已验证；typecheck、lint 通过；新页面无 check-in/view/region/评分依赖 |
| Slice 1 Task 10 详情与历程 | 91 项单元测试通过；详情即时读取、异步轮询、过期响应隔离、七项事实、`needs_input` 补充文字、真实历程列表和四状态展示已验证；typecheck、lint 通过 |
| Slice 1 真实 HTTP 链路 | 临时 PostgreSQL schema 中通过：纯文字创建、同 UUID 幂等、照片异步 mock AI 完成、签名原图可读、新客户端恢复、人工降级完成、跨账号 404；schema 与临时存储均已清理 |
| Slice 1 Android 端到端 | Pixel 8 AVD、Android 16、Expo Go 57.0.2 与本地 `8080` API 联调通过：UI 注册、四项协议、四栏导航、纯文字创建与回看、系统相机单照片上传、过期 Token 自动刷新、mock AI 七项事实、签名原图读取、历程回看，以及强制停止 Expo Go 后冷启动恢复；验收中发现并修复照片缩略图交叉轴拉伸，设备复核由 `221×902` 恢复为 `221×221`；临时 schema 中记录状态与 AI 调用日志复核一致 |
| Slice 1 Android 布局回归 | 新增固定正方形缩略图契约测试；移动端完整 92 项通过，typecheck、lint 通过；修复后 Android 冷启动设备回归通过，照片与文字两条记录同时正常显示 |
| Slice 1 详情导航回归 | 详情页改用原生 Stack Header：Android 显示标准返回箭头与导航标题，页面内容不再绘制“返回”文字；系统返回键设备回归通过，无页面历史时回到“历程”的策略由单元测试覆盖；移动端完整 94 项、typecheck、lint 通过 |
| Slice 1 GLM 真实模型契约 | 真实 `glm-4.6v` 接收 Base64 图片并返回通过七字段 Schema 与安全校验的结果；一次直接契约调用使用 1789 输入/331 输出 Tokens，约 11.97 秒 |
| Slice 1 GLM 正式 HTTP 闭环 | 本地 `8080` 正式注册/协议/Observation 上传/异步轮询完成；Observation 4 持久化为 `completed/photo_analysis`、`provider=glm`、`model=glm-4.6v`、Prompt `1.1.0`、Schema `1.0.0`；单次 1869 输入/195 输出 Tokens，约 7.25 秒 |
| Slice 1 GLM Android 呈现 | 可见 Pixel 8 AVD 连接本地 `8080`；为当前模拟器账号通过正式 API 创建 Observation 5 后，历程显示遮罩缩略图和真实摘要，详情显示原图、来源和七字段；数据库核验 `provider=glm`、`model=glm-4.6v`，单次 1869 输入/218 输出 Tokens，约 5.88 秒 |
| Slice 1 Prompt 1.2 五图回归 | 将 `pic/` 中五张手机照片作为五次正式 Observation 提交真实 `glm-4.6v`；5/5 均为 `completed/photo_analysis`，Prompt 均为 `full-face-observation-1.2.0`，模型输出均通过安全校验且修正数为 0；旧 Prompt 同组样本仅 2/5 可展示 |
| Slice 1 安全降级回归 | 第二次模型响应仍含医学化或建议性内容时，服务按字段修正或丢弃不安全内容、保留安全事实、重建摘要，并把修正原因写入 `ai_call_logs.validation_warnings`；真实解析/API 失败展示固定说明，不再出现空白结果 |
| Slice 1 最终 Android 持久化验收 | 独立验收账号在 Pixel 8 AVD 中显示真实 Observation 16；照片、来源和七项事实完整可见。退出当前账号、重新登录、离开页面并重新打开应用后，列表和详情仍从本地 `8080` API 与 PostgreSQL 恢复；后端日志再次记录列表、详情和签名原图请求 |

这些检查证明 Slice 1 的代码链路、真实模型、安全降级和 Android 持久化闭环成立，但不代表整个 MVP 或公开测试就绪。以下项目转入后续上线准备，不阻塞 Slice 2：

- iOS 模拟器或真实设备验收；Windows 环境无法运行 iOS 模拟器；
- 模型质量仍应随着真实样本积累持续评估；当前五图回归证明的是 Slice 1 产品化基线，不是医疗准确性声明；
- `needs_input` 人工降级由自动化测试和真实 HTTP 链路覆盖，尚未在本轮 Android UI 中再次强制触发；
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
- 已完成并冻结计划：`docs/superpowers/plans/2026-08-21-full-face-observation-slice-1.md`；
- 已完成实施计划：`docs/superpowers/plans/2026-08-23-region-observations-events-slices-2-3.md`；
- 已批准设计：`docs/superpowers/specs/2026-08-24-products-timeline-life-context-design.md`；
- 已完成实施计划：`docs/superpowers/plans/2026-08-24-products-timeline-life-context-slices-4-5.md`；
- 已完成实施计划：`docs/superpowers/plans/2026-08-27-product-ui-redesign.md`；
- 已批准设计：`docs/superpowers/specs/2026-08-24-standard-product-catalog-design.md`；
- 唯一 ACTIVE 实施计划：`docs/superpowers/plans/2026-08-24-standard-product-catalog-slice-4a.md`；
- 当前执行进度：Slice 4 与 Slice 5 已完成；Slice 4A Task 1–11 已完成，Task 12 的默认回归和闭环脚本已完成，完整出口证据待补；
- 当前阻塞：产品栏第一阶段不再阻塞，功能与 UX 已通过用户验收，视觉 UI 遗留转入后续独立阶段；Slice 4A 完整出口仍受当前 worktree `DATABASE_URL` 本地 PostgreSQL 凭据拒绝阻塞，需提供可丢弃 `TEST_DATABASE_URL`。本轮不需要也不允许向第三方提交项目或照片数据；
- 当前门禁：Slice 4A 只允许按已批准规格和唯一 ACTIVE 计划逐任务实施，未通过出口门禁前不得宣称完成；
- 下一步：产品栏视觉 UI 在后续独立阶段继续打磨；Slice 4A 主线仍需提供有效且可丢弃的 PostgreSQL 测试连接，运行 Task 12 闭环脚本，并补产品使用快照与重启恢复出口验收；
- 禁止动作：不得未经计划直接开发标准目录，不得引入产品推荐、自动网页抓取、产品/贴纸相关性或疗效、区域趋势及 legacy 日记复用。

## 更新规则

每完成一个可独立验证的切片或子步骤，直接更新本文件的当前事实、验证结果、阻塞和下一步。不要追加会话流水；Git 历史负责保存过去版本。没有代码、测试、迁移或 Git 证据时写“待验证”。
