# Slice 4–5 持续实施进度

> 2026-08-26：Slice 4A Task 12 新增隔离 PostgreSQL/临时存储闭环脚本；默认后端和移动端回归通过。更新 Expo SDK 57 兼容依赖（含 worklets）后，Pixel 8 Expo Go 57.0.9 清缓存启动并进入 Skin Care Agent 登录页，Hermes 崩溃已消失；认证测试账号和四项协议已在本地后端准备。真实闭环仍等待可丢弃的 `TEST_DATABASE_URL`，产品流尚未完成，不能将 Slice 4A 标为完成。

> 目标：实现 Slice 4 实际产品使用与个人产品柜，验证后直接实现 Slice 5 统一历程与生活背景。
>
> 工作区：`D:\Mia\agent_tryout\.worktrees\slice-1-full-face-observation\skin_care_agent`
>
> 更新日期：2026-08-24

## 当前阶段

- Slice 4 已完成：`0016`、个人产品柜、真实产品使用、多选与零关联“未注明”、真实时间/备注、产品历史和历程入口；
- Slice 5 已完成：`0017`、六项固定生活背景、显式跳过、观察/区域事件原始贴纸和统一历程；
- 新增组合 HTTP 闭环关闭并重建 TestClient 后仍从 PostgreSQL 恢复全部事实，并验证 UUID 幂等和账号隔离；
- 后端最新完整回归、强制 PostgreSQL、移动端完整回归和最终 diff 审计见下方“最终证据”；
- Expo 57 官方文档已核对 Router 与 `@expo/ui` DateTimePicker；当前 `@expo/ui` 57.0.7 已安装并导出 community datetime picker；
- 设计：`docs/superpowers/specs/2026-08-24-products-timeline-life-context-design.md`；
- 已完成计划：`docs/superpowers/plans/2026-08-24-products-timeline-life-context-slices-4-5.md`。

## 关键决策

- 产品与使用是独立领域，不绑定 Observation，不复用 legacy CheckInDiary；
- “未注明产品”保存为零关联，不创建伪产品；
- LifeContext 只关联 Observation，空选择加完成时间表示明确跳过；
- Timeline 是只读聚合层，不调用 AI，也不把产品或贴纸变成原因、疗效或趋势输入；
- 本轮不调用第三方 AI，不修改 `D:\Mia\agent_tryout` 外部状态，不执行 push/PR/部署。

## 最终证据

1. Slice 4 RED/GREEN：模型缺失与产品 API 404 按预期失败；实现后模型 3 passed、产品 PostgreSQL HTTP 闭环通过；
2. Slice 5 RED/GREEN：生活背景模型缺失、生活背景路由 404、时间线路由 404、移动端模块缺失均按预期失败；实现后聚焦测试全部通过；
3. 组合闭环：产品/使用、两次区域观察、贴纸选择与空选择跳过在新 HTTP 客户端中恢复，产品历史、事件时间点、时间线和跨账号 404 全部通过；
4. 无第三方调用：Slice 4/5 代码不导入 AI gateway，验证使用纯文字区域事实；live GLM 测试保持显式跳过；
5. 虚拟环境直接脚本入口仍引用宿主旧 Python 3.12 路径，等价验收通过可用的 `python -m pytest` 路径执行；不影响应用或测试结果。

最终命令与结果：

- `backend/.venv/Scripts/python.exe -m pytest -q`：134 passed、12 skipped；
- `backend/.venv/Scripts/python.exe -m pytest tests/integration --local-postgres -q`：11 passed、1 live-GLM skipped；
- `backend/.venv/Scripts/ruff.exe check app tests scripts`：All checks passed；
- Slice 2–3 后端聚焦回归：59 passed；移动端聚焦回归：23 passed；
- `mobile/npm run test:unit`：119 passed；`npm run typecheck` 与 `npm run lint`：通过；
- OpenAPI 与 Bearer 门禁：`backend/tests/test_app.py` 5 passed；
- 本地 PostgreSQL `SELECT version_num FROM alembic_version`：`0017_life_contexts`；
- `git diff --check`：退出码 0，仅有 Windows LF/CRLF 提示；新切片文件无尾随空白、TODO/FIXME、Mock 占位或平台产品池实现。

---

# Slice 2–3 持续实施进度

> 目标：冻结 Slice 1 非阻塞遗留，完成切片 2 的固定区域与按区域 AI，以及切片 3 的区域事件与时间点回看。
>
> 工作区：`D:\Mia\agent_tryout\.worktrees\slice-1-full-face-observation\skin_care_agent`
>
> 分支：`feature/slice-1-full-face-observation`
>
> 更新日期：2026-08-23

## 不可变约束

- 产品事实源：`design/product/skin_care_app_mvp_spec.md` 2026-08-23 ACTIVE 版；
- 新记录只允许六个固定区域，不再创建新的 `full_face` 目标；
- 左右方向始终指用户本人真实左右，自拍预览镜像不改变区域 ID；
- 一张原图可对应 1–6 个独立目标，各自异步处理、降级和恢复；
- 区域事件不生成区域趋势、跨区域结论或医学判断；
- 不执行 GUI 自动化、远端写操作、Git push、PR 或部署；
- 不改动 `D:\Mia\agent_tryout` 之外的文件。

## 已完成

| 阶段 | 证据 |
|---|---|
| 读取项目约束与最新版 MVP | 已完整读取根/移动端 `AGENTS.md`、项目入口、当前状态、Slice 1 计划和 2026-08-23 MVP |
| 隔离工作区确认 | 已位于 linked worktree；主工作区 `docs/prompt.md` 的用户修改未触碰 |
| 基线验证 | 后端 97 passed、2 skipped；Ruff 通过；移动端 94 passed、typecheck 和 lint 通过 |
| Expo 57 文档核对 | 已核对官方 Camera、FileSystem 和 Router 版本化文档；`CameraView mirror=false` 表示前摄输出不镜像 |
| Slice 1 冻结 | 遗留与恢复条件记录在 `docs/frozen/2026-08-23-slice-1-deferred.md` |
| Slice 2 Task 1 | 六区字典测试先因 `app.domain` 缺失失败；实现后区域与模型测试 10 passed，Ruff 通过；迁移 `0014_region_observation_targets` 已创建，等待 PostgreSQL 往返验证 |
| Slice 2 后端主链 | 多区域原子创建、区域输出边界、按类型 Worker 和目标级补录已实现；后端全量 114 passed、2 skipped，Ruff 通过 |
| Slice 2 移动端主链 | 固定区域、上次选择、保存前确认、多目标提交/详情/轮询已实现；移动端 100 passed，typecheck、lint 通过 |
| Slice 3 事件领域 | `0015_region_events`、30 天规则、pending/current/ended、有效目标激活、主动结束和账号隔离已实现 |
| Slice 3 移动端 | 30 天多区域合并确认、current/ended 组织、事件时间点详情、历史全脸分区和非医学化结束提示已实现 |
| PostgreSQL/HTTP 闭环 | 7 项强制集成通过；head→0013→head 往返、旧行保留、区域成功/失败/补录、幂等、open 唯一约束、客户端重启与事件回看均实际验证 |
| 最终自动化 | 后端 127 passed/8 default-skipped，Ruff 通过；移动端 103 passed，typecheck/lint 通过 |

## 关键决策

- 在现有 Observation 领域上追加区域目标，不复用 legacy Patch lineage；
- 切片 2 使用结构化 `targets` 创建契约，幂等键仍是用户加 `client_request_id`；
- 六区字典前后端各有固定顺序和边界，后端是最终校验者；
- 按区域 AI 使用独立 Prompt、稳定 `region_id` 和区域输出校验，不能合并为全脸；
- 切片 3 使用独立 `RegionEvent`，有效 ObservationTarget 是事件时间点；事件归属由规则和用户选择决定，不由 AI 决定；
- 30 天门槛按设备当地日历日计算，新记录保存设备时区偏移和当地日期；
- 本轮不新增产品、贴纸、趋势、平台产品池或自由选区。

## 待执行

1. 完成最终 diff 与文档一致性审计；
2. 停止后续切片开发，等待用户评估与验收。

## 外部验证边界

无人值守规则禁止向第三方提交本地照片或项目数据，因此本轮不会主动发起新的真实 GLM 请求。区域 provider 链路会以真实 gateway 代码、严格契约测试和本地 HTTP/PostgreSQL 闭环验证；若最终完成条件必须新增一次第三方真实推理，本日志会保留为唯一未完成的外部验收项，不能用 Mock 冒充。
