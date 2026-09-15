# 项目收尾评估与优先级排期

评估日期：2026-09-14  
验收基准：`design/product/skin_care_app_mvp_spec.md`  
代码基线：`main@aab33d8` 加当前工作区未提交改动（本报告按磁盘现状评估，不把提交记录当作实现真相）

## 1. 结论摘要

按 spec 4.1 的 17 项能力等权估算（完成 1、部分 0.5、与 spec 不符 0.25、未开始 0），当前约 **66%**。拍照、六区、真实 AI、区域事件、产品柜和生活背景可运行，但还不是可发布 MVP。最大障碍：①无照片入口缺失且低质图被硬拦截；②统一历程缺全脸/产品，Slice 6 对比趋势未做；③同意撤回、数据导出、目录 PostgreSQL 出口和发布合规门禁未完成。

### 审计与运行基线

| 项目 | 结果 | 依据 |
|---|---|---|
| Android 实跑 | Pixel 8 模拟器、Expo Go；冷启动恢复登录成功，四个 Tab 可进入；未做 release APK/AAB 或物理真机验证 | 2026-09-14 运行现象；`mobile/src/providers/session-provider.tsx:229-270` |
| 拍照观察主链 | 相册原图 → 质量预检 → 六区选择 → 保存 → GLM 异步分析 → 结果页 → 生活背景可跑通；`POST /observations` 返回 201，GLM 调用成功 | 2026-09-14 运行现象；`mobile/src/app/observation/new.tsx:251-285`、`backend/app/services/observation_service.py:189-264` |
| 历程 | 区域总览、事件和待补文字记录可进入；未显示账号已有的全脸记录和 10 条产品使用 | 2026-09-14 运行现象；`mobile/src/app/(tabs)/history.tsx:53-80,105-251` |
| 产品 | 产品柜、图片、标准产品详情、模糊搜索和“观察 → 记录产品使用”表单可用；未实际提交新的产品使用 | 2026-09-14 运行现象；`mobile/src/app/product-use/new.tsx:49-183` |
| 我的 | 只有账号信息和退出按钮；没有协议状态、撤回、导出或删除入口 | 2026-09-14 运行现象；`mobile/src/app/(tabs)/me.tsx:12-47` |
| 崩溃/死路 | 本次所走主路径未崩溃、未见空白页；Android crash buffer 为空。首次打开短暂出现 Expo CLI 连接提示，随后正常加载，未复现 | 2026-09-14 `adb logcat -b crash -d`；运行现象 |
| 移动端自动化 | 226/226 单测通过；typecheck、lint 通过 | 2026-09-14：`npm run test:unit`、`npm run typecheck`、`npm run lint` |
| 后端自动化 | 197 通过、27 跳过、6 warnings；Ruff 通过。跳过项主要需要 `TEST_DATABASE_URL` 或显式 live 开关，不能算集成验收通过 | 2026-09-14：`.venv\Scripts\python.exe -m pytest -q -rs -p no:cacheprovider`、`.venv\Scripts\ruff.exe check app tests` |

运行副作用：本次验收在测试账号产生了观察记录 `113`、`114`，其中 `114` 完成了真实 GLM 分析；未删除，是否清理需确认。两条记录对应不同时间/请求，本次证据不足以认定为重复提交 Bug。

## 2. 模块状态总表

| 模块 | spec 要求 | 实现状态 | 关键证据（文件路径，必要时行号） | 验证方式 |
|---|---|---|---|---|
| 账号、登录与协议 | 注册/登录、协议同意状态、撤回、账号隔离 | 部分完成 | spec `:66`；会话刷新 `mobile/src/providers/session-provider.tsx:229-270`；后端查改同意 `backend/app/api/me.py:39-79`；“我的”仅退出 `mobile/src/app/(tabs)/me.tsx:12-47` | 实机验证 + 代码 |
| 四 Tab 导航 | 观察 / 历程 / 产品 / 我的，职责分离 | 已完成 | spec `:67,103-112`；`mobile/src/lib/tab-shell.ts:17-45`、`mobile/src/app/(tabs)/_layout.tsx:9-47` | 实机验证 |
| 有照片观察 | 单张原图，原始事实先保存；可选 1–6 区；仅要求照片可读取 | 与 spec 不符 | spec `:35,68,127,133-170,254-267`；前端失败即阻断 `mobile/src/app/observation/new.tsx:251-285,572-600`；后端 422 拒绝并先于存储 `backend/app/services/observation_service.py:189-214` | 实机验证 + 代码 |
| 无照片文字观察 | 明确入口；每个选区必须有文字；保存为 `user_record` | 部分完成 | spec `:69,129,269-273,326-335`；底层校验/组装已支持 `mobile/src/lib/observation-flow.ts:147-201`、`backend/app/services/observation_service.py:67-93,257-264`；当前入口只有拍照/相册 `mobile/src/app/(tabs)/observe.tsx:76-81`、`mobile/src/app/observation/new.tsx:461-481` | 实机验证 + 代码 |
| 固定六区与选择 | 额头、左/右脸颊、鼻、口周、下巴；每次 1–6 区 | 已完成 | spec `:70,133-154`；切换逻辑不设 2 区上限 `mobile/src/lib/face-analysis-flow.ts:168-188`；实测可同时选择 6 区 | 实机验证 + 代码 |
| 异步 AI 与恢复 | 每区独立 queued/processing/completed/needs_input/failed；可重试并恢复 | 已完成 | spec `:71,156-186`；`mobile/src/lib/observation-flow.ts:227-301,457-466`、`backend/app/services/region_analysis_service.py` | 实机验证 + 代码 |
| 区域事实 | 可见事实 + 来源；用户文字是一级事实；非诊断 | 已完成 | spec `:72,172-186,435-454`；`mobile/src/lib/observation-flow.ts:303-455`、`backend/app/services/region_analysis_service.py` | 实机验证 + 代码 |
| 记录详情与原图 | 查看原图、选区、事实、状态、补充文字 | 已完成 | spec `:73,337-350`；`mobile/src/app/observation/[observationId].tsx:67-344` | 实机验证 |
| 区域事件 | 30 天自动续接/选择、主动结束、历史可回看 | 已完成 | spec `:74,188-200,352-363`；`backend/app/services/region_event_service.py`、`mobile/src/app/region-event/[eventId].tsx` | 实机验证 + 代码 |
| 产品使用记录 | 零/多产品、真实时间、备注；观察页和产品页均可发起 | 部分完成 | spec `:75,275-284`；观察页入口 `mobile/src/app/(tabs)/observe.tsx:120-123`、表单 `mobile/src/app/product-use/new.tsx:49-183`；产品页只有新增/详情 `mobile/src/app/(tabs)/products.tsx:56-97` | 实机验证 + 代码 |
| 标准产品目录 | 搜索、详情、来源/版本/监管类型、去重加入产品柜 | 部分完成 | spec `:76,202-223,365-379`；API `backend/app/api/product_catalog.py:16-45`、`backend/app/api/products.py:30-157`；ACTIVE 计划仅剩 Task 12 `docs/superpowers/plans/2026-08-24-standard-product-catalog-slice-4a.md:5-7,1149-1253` | 实机验证 + 代码；PG 出口未验证 |
| 个人产品柜 | 标准/自定义产品、使用次数/最近使用、历史事实不可改写 | 已完成 | spec `:77,202-223`；`backend/app/services/product_service.py`、`mobile/src/app/(tabs)/products.tsx:20-107`、`mobile/src/app/product/[productId].tsx` | 实机验证 + 代码 |
| 生活背景 | 六类固定贴纸；允许跳过；仅作时间上下文 | 已完成 | spec `:78,225-229`；`mobile/src/lib/life-context.ts:3-44`、`mobile/src/components/life-context-selector.tsx` | 实机验证 + 代码 |
| 统一历程 | 同时呈现全脸、区域事件、产品使用和生活背景 | 部分完成 | spec `:79,286-290,381-388`；后端汇总三类 `backend/app/services/timeline_service.py:78-129`；移动端取回后只渲染区域视图 `mobile/src/app/(tabs)/history.tsx:53-80,105-251` | 实机验证 + 代码 |
| 全脸前后对比 | 同视角、有效时点、原图并排；不可比较要说明原因 | 未开始 | spec `:80,231-247,390-401`；仓库没有符合该契约的 comparison API/UI；当前状态也标为未实现 `docs/current_status.md:67` | 仅代码推断 |
| 阶段趋势 | 只基于记录事实，不做分数/诊断/疗效结论 | 未开始 | spec `:81,248-250,390-401`；现有 legacy 接口仍计算 `skin_health_index`、`healed` 和“趋势向好” `backend/app/api/trends.py:215-329` | 仅代码推断 |
| 数据控制与公开测试 | 同意状态、撤回、数据导出、隐私默认、真实服务、发布门禁 | 部分完成 | spec `:82,403-425,510-528`；隐私缩略图 `mobile/src/components/privacy-photo-thumbnail.tsx`；后端删除账号 `backend/app/api/me.py:82-125`；移动端无撤回/导出/删除入口 `mobile/src/app/(tabs)/me.tsx:12-47` | 实机验证 + 代码；发布未验证 |

计分：8 项完成 × 1 + 6 项部分 × 0.5 + 1 项不符 × 0.25 + 2 项未开始 × 0 = 11.25 / 17 = 66.2%。这是“功能实现估算”，不是上线就绪度。

## 3. 缺口清单

### 观察与 AI

| 缺口描述 | 类型 | 影响 | 工作量 | 依赖项 |
|---|---|---|---|---|
| 新 UI 没有“暂时不拍/只写文字”入口，已有底层能力无法被用户触达 | 功能缺失 | spec 的降级主流程不可用；不愿上传照片的用户无法记录 | M | 统一的文字式区域选择器 |
| 照片质量失败会在前后端被硬拦截，原始记录不会保存 | 与 spec 不一致 | 可读取但构图不佳的真实记录丢失；违背“先存原始事实” | L | 无关键点时的 1–6 区文字选择回退；AI `needs_input` 规则 |
| 结果与编辑文案仍使用“检测区域”等词 | 与 spec 不一致 | 加重医疗化理解风险 | S | 无 |
| AI 网关成功日志写入 `text_preview`，调用记录保存完整 `response_text/raw_response` | 技术债 | 可能把敏感的皮肤衍生信息写入日志或长期存储；生产策略未验证 | S | 隐私/保留期决策；`backend/app/services/ai_gateway/gateway.py:208-231` |
| 送模图片仍是简单等比缩放，留有 `FIXME(step-4)` | 技术债 | 真实模型的 token 成本与细节保真尚未基准化；当前不阻断功能 | M | 真实照片样本、成本/清晰度基线；`backend/app/services/vision/image_prep.py:3` |

### 历程、对比与趋势

| 缺口描述 | 类型 | 影响 | 工作量 | 依赖项 |
|---|---|---|---|---|
| 历程已获取 timeline，却不渲染 `otherHistory`；全脸和产品使用被隐藏 | 功能缺失 | “统一历程”不成立，用户无法在主导航回看两类事实 | M | 现有 timeline API 已具备 |
| 测试明确断言“不渲染 other-history”，把错误行为固化为绿灯 | 技术债 | 后续修正会先被现有契约测试阻止 | S | 先改回 spec 验收矩阵 |
| Slice 6 的有效时点、同视角前后对比和事实趋势未实现 | 功能缺失 | 核心闭环缺最后一段；MVP 不完整 | L | 统一历程、有效时点判定、全脸记录 |
| legacy `/trends` 仍注册，可被深链访问，语义包含评分、消退和“趋势向好” | 与 spec 不一致 | 可能绕过新导航暴露禁用表达 | M | 新 Slice 6 上线或明确移除旧路由 |

### 产品与目录

| 缺口描述 | 类型 | 影响 | 工作量 | 依赖项 |
|---|---|---|---|---|
| 产品 Tab 没有“记录使用”入口，测试还断言该入口不存在 | 功能缺失 | spec 指定的第二入口缺失；只能绕到观察页 | S | 更新产品 UI 契约测试 |
| Slice 4A Task 12 未执行；目录相关 PG 集成测试被跳过 | 功能缺失 | 迁移、导入、HTTP、Android 完整出口无法签字 | M | 可丢弃 `TEST_DATABASE_URL`；本地服务 |
| 当前目录是合成开发数据；实测详情出现 `dev-form-*`、字段值 `string` | 功能缺失 | 不可直接作为公开测试的可信产品内容 | L | 合法来源、授权、生产目录包、版本治理 |
| 产品左滑“归档”只有 UI 揭示态，前后端均留 TODO | 技术债 | 可点击却无法完成，形成假入口；非 MVP 必需 | S | 产品归档产品决策 |

### 账号、隐私与数据控制

| 缺口描述 | 类型 | 影响 | 工作量 | 依赖项 |
|---|---|---|---|---|
| “我的”没有协议状态与撤回入口；协议页却承诺可在账号设置查看/撤回 | 功能缺失 | 用户无法行使 spec 中的数据控制；页面承诺不实 | M | 现有 `GET/PUT /me/consents` |
| 没有数据导出 API 和移动端入口 | 功能缺失 | Slice 7 与发布阻塞项未满足 | L | 导出范围、格式、异步交付与保留期决策 |
| 后端已有删除账号，移动端没有入口 | 体验优化 | 用户无法自助删除；是否为首发硬门槛取决于发布市场 | M | 二次确认与重新认证策略 |

### 发布质量与 UI 重构收尾

| 缺口描述 | 类型 | 影响 | 工作量 | 依赖项 |
|---|---|---|---|---|
| 27 个后端用例跳过，覆盖观察、区域事件、产品、timeline、目录和迁移闭环 | 技术债 | 自动化绿灯不代表 PostgreSQL 持久化/迁移已验收 | M | 可丢弃 PostgreSQL |
| 只在 Pixel 8 模拟器 + Expo Go 实跑；物理 Android/iPhone、release 包、断网/弱网/大字体未验 | 功能缺失 | 设备、权限、相机、签名 URL 和恢复风险未出清 | L | 目标设备矩阵、签名构建配置 |
| UI 重构第 4 阶段产物缺失：迁移矩阵、共享 system-state/skeleton 与系统态契约测试均不存在 | 技术债 | 表单、错误/空/加载态与辅助功能缺统一验收 | L | 核心功能稳定后执行；handoff `plans/04-supporting-pages-and-release-audit.md:19,65-67,128` |
| 隐私、医疗边界、目标市场合规与应用商店发布材料未专项审查 | 功能缺失 | 公开测试/上线不可签字 | L | 发布国家/地区、隐私政策、商店账号 |
| 测试账号昵称和部分历史备注显示 `??`；根因未验证 | Bug | 干扰验收数据可信度；暂不能判断是旧数据、录入编码还是展示问题 | S | 清洁测试账号并复现 |

### `current_status.md` 过期或不准确项

| 文档描述 | 实际情况 | 证据 |
|---|---|---|
| 移动端测试 189/221 项通过 | 当前为 226/226 | `docs/current_status.md:29,119`；2026-09-14 `npm run test:unit` |
| 当前环境没有 Android SDK/adb，Android 待验 | 当前 Pixel 8 模拟器可连接并已完成一轮 Expo Go 实跑；物理真机仍未验 | `docs/current_status.md:31`；2026-09-14 运行现象 |
| Slice 2 已完成，日常关注“最多两个区域” | 代码与实测允许同时选择六区，符合 spec 的 1–6 区，状态文档的“两区上限”已过期 | `docs/current_status.md:61,143`；`mobile/src/lib/face-analysis-flow.ts:168-188` |
| “观察仍保留历史文字记录”且 Slice 2 完成 | 底层保留文字记录能力，但新 UI 没有无照片入口，用户无法触发 | `docs/current_status.md:60,94`；`mobile/src/app/(tabs)/observe.tsx:76-81` |
| Slice 5“统一历程”已完成 | 后端 timeline 完整，移动端主动隐藏全脸/产品 `otherHistory` | `docs/current_status.md:54,66`；`mobile/tests/history-ui-contract.test.mjs:19-22` |
| 拍后质量门槛属于当前完成项 | 它确已实现，但与唯一验收 spec 冲突，不能记为 MVP 完成 | `docs/current_status.md:54,142`；spec `:127`；`backend/app/services/observation_service.py:189-214` |
| 环境文档称迁移 head 为 `0013` | 当前迁移已到 `0019` | `docs/environment_setup.md:79`；`backend/app/db/migrations/versions/0019_standard_product_catalog_search.py` |
| 产品目录已有专项证据 | 单元/专项代码存在，但 Task 12 与 14 个目录 PG 用例仍未通过有效 `TEST_DATABASE_URL` | `docs/current_status.md:125-126,153-154`；2026-09-14 pytest skip 摘要 |

## 4. 优先级排期（核心产出）

| 序号 | 任务名 | 所属模块 | 为什么排这个位置 | 完成标准（可验证的 Done 定义） | 工作量 |
|---:|---|---|---|---|:---:|
| 1 | 重建 spec 验收追踪与失败测试 | 全局 | 当前测试把“隐藏历史/没有产品使用入口”等错误行为固化，先纠正基线才能安全收尾 | 17 项矩阵逐条链接到验收测试；为无照片、非阻断照片、统一历程、产品页入口新增/改成先失败的契约测试；不再以 `current_status.md` 覆盖 spec | S |
| 2 | 恢复无照片文字观察入口 | 观察 | 这是被 UI 重构切断的必需主流程，且底层能力已存在 | 观察首页有明确“暂时不拍”入口；可选 1–6 区；每个选区无文字时不可提交；提交后状态为 `completed/user_record`，历程可回看 | M |
| 3 | 把照片质量从硬门槛改为提示与降级 | 观察/AI | 当前会阻断保存并丢失原始事实，直接违反 MVP 第一原则 | 任意可解码单张照片先成功持久化；质量不足只提示；无关键点时可用文字列表选区；AI 不足返回 `needs_input`；原图仍可回看 | L |
| 4 | 在产品页补“记录使用”入口 | 产品使用 | 必需功能的小缺口，修复成本低，能快速完成双入口验收 | 产品 Tab 和产品详情均可进入记录表单；可零/多选、改真实时间、写备注并保存；对应测试通过 | S |
| 5 | 恢复真正的统一历程 | 历程 | Slice 6 和用户回看都依赖完整时间线 | 历程同时显示全脸观察、区域事件、产品使用和生活背景；空态按所有类型判断；详情跳转与分页可用 | M |
| 6 | 完成标准产品目录 Task 12 | 产品目录 | 目录功能已接近完成，先补小于 Slice 6 的出口门禁 | 使用可丢弃 PG 跑完强制集成、迁移 round-trip、目录闭环脚本和 Android 验收；零 skip/零失败；保存证据后再改 Slice 状态 | M |
| 7 | 实现 Slice 6 后端事实对比与趋势 | 对比/趋势 | 是核心闭环最后一个未开始的能力，且前端依赖其稳定契约 | 仅选择 `completed/needs_input` 有效时点；同视角可比较返回两张原图及逐字段事实；不可比较返回明确原因；无评分、诊断、因果或疗效字段 | L |
| 8 | 接入 Slice 6 移动端对比与趋势 | 对比/趋势 | 依赖任务 5、7，完成后才可称功能型 MVP 跑通 | 历程可发起前后对比；默认原图并排；阶段趋势仅展示记录事实；加载/空/错/不可比较状态均有真机验收 | L |
| 9 | 移除 AI 敏感文本日志与定义保留期 | 隐私 | 上线前的高风险小任务，应先于一般体验项 | 生产日志不含 prompt、AI 结果预览、原图或用户文字；调用记录字段、访问权限和保留/删除策略有测试和文档 | S |
| 10 | 清理医疗化与禁用文案 | 合规文案 | 小成本降低用户误解与审核风险 | 全仓与实机页面不再出现“检测区域/皮肤评分/已消退/趋势向好”等禁用表达；边界说明在结果和趋势页可见 | S |
| 11 | 上线同意状态、撤回与删除入口 | 账号/数据控制 | spec 必需且后端大部分接口已有 | “我的”展示三类协议版本/状态；可撤回并立即阻断相应处理；账号删除有二次确认且数据/对象清理集成测试通过 | M |
| 12 | 隔离或移除 legacy 路由 | 导航/趋势 | 新导航虽隐藏旧页，但深链仍能访问不合规实现 | `home/check-in/analysis/diary/trends` 不可从生产深链进入，或明确迁移为新契约；旧 fixture 在生产不可用；回归测试覆盖 | M |
| 13 | 修正状态与环境文档 | 项目治理 | 当前文档会误导后续执行，且修正应基于前述结果而非预报 | `current_status.md`、`environment_setup.md` 的测试数、SDK 状态、迁移 head、Slice 状态和剩余门禁与最新证据一致 | S |
| 14 | 实现用户数据导出 | 数据控制 | 上线必修但实现跨度大，排在现有接口可复用项之后 | 登录用户可导出照片、观察、区域事件、产品/使用和生活背景；格式、时区、失败重试、安全下载和过期删除均有测试 | L |
| 15 | 换入可发布的标准产品目录 | 产品目录 | 代码链路验证后才能装载真实内容，且依赖外部来源与授权 | 首发目录来源合法、版本可追踪；无 `string/dev-form` 占位；中英文/拼音常用查询和去重加入在 Android 通过 | L |
| 16 | 跑发布级矩阵与合规门禁 | 发布 | 汇总性任务必须在功能和数据控制稳定后执行 | 可丢弃 PG 全量零 skip；真实 GLM；物理 Android/iPhone；release 包冷启动、权限、相机、断网、弱网、大字体、前后台恢复、跨账号隔离通过；隐私/医疗边界/商店材料签字 | L |
| 17 | 收完 UI 重构第 4 阶段 | 全局 UI | 属于一致性与工程质量，不应挤占 MVP 功能闭环 | 迁移矩阵齐全；共享 loading/empty/error/skeleton；表单键盘/焦点/读屏/44pt 触控与小屏无溢出；视觉回归通过 | L |
| 18 | 处理产品归档假入口 | 产品 | 非 MVP，放在发布主链之后 | 二选一：移除归档 affordance；或完成后端软归档、列表过滤、撤销与测试，不再显示 TODO 提示 | S/M |
| 19 | 基准化送模图片预处理 | AI 成本/质量 | 现有 FIXME 不阻塞 MVP，待真实链路稳定后再优化 | 用同一批照片比较尺寸、token、耗时与事实保真；确定最小可靠尺寸并删除 FIXME；无原图覆盖或不可逆写回 | M |
| 20 | 清理旧实现与重复代码 | 技术债 | 功能稳定后再删，避免收尾阶段扩大回归面 | 未被生产路由使用的 legacy API、fixtures、presenter 和页面有清单；删除后全量测试/构建/深链检查通过 | L |
| 21 | 清洁测试数据并复现乱码 | 测试环境 | 不阻塞功能，先确认是否数据污染再决定修代码 | 新建 UTF-8 清洁账号复现昵称/备注；若不复现则清理旧数据，若复现则形成最小失败测试并修复 | S |

### 建议分批

- **P0「让 MVP 能完整跑通」：1–8。** 完成 spec 主链：两种观察入口、先存事实、完整历程、标准目录出口、全脸对比与阶段趋势。
- **P1「上线前必修」：9–16。** 完成隐私、文案、数据控制、legacy 隔离、生产目录、真实设备与发布门禁。
- **P2「上线后优化」：17–21。** UI 系统化、非必需归档、图片预处理基准、旧代码清理和测试数据治理。

## 5. 风险与待我确认的问题

### 需要拍板的问题

1. 首发/公开测试面向哪些国家或地区、通过哪个商店分发？这会决定账号删除、数据导出、隐私同意和医疗边界的强制门槛。
2. 能否提供一个明确可丢弃、允许迁移并启用 `pg_trgm` 的 `TEST_DATABASE_URL`，用于完成 Task 12 和 27 个跳过项中的 PG 集成验证？
3. 首发标准产品目录的合法数据源、图片/说明书授权和维护责任人是谁？当前合成目录不能直接发布。
4. 首发设备范围是什么：最低 Android/iOS 版本、至少哪些物理机型、是否首发 iOS？
5. 是否保留本次测试产生的观察记录 `113`、`114` 作为验收证据，还是由你授权后清理？

### 关键假设

- 以 `skin_care_app_mvp_spec.md` 为唯一产品验收基准；`docs/prompt.md` 或 UI 重构中与其冲突的质量门槛、两区限制、隐藏历史等不构成新规格。
- 当前工作区未提交改动代表最新实现，因此本评估针对磁盘现状，不仅针对 `HEAD`。
- “已完成”要求代码链路与本次可执行验证一致；需要 PostgreSQL、真实设备、release 包或合规签字但未具备条件的项目均标为“部分/未验证”。
- 本次 Android 证据来自 Pixel 8 模拟器 + Expo Go；不能替代物理真机与 release 构建。
- S/M/L 仅按单人有效工时：S≤2h，M≤1天，L>1天；外部授权、商店审核和等待环境的自然日不计入开发工时。
