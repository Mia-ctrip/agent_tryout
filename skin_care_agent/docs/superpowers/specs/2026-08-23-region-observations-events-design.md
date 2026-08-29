# 固定区域观察与区域事件设计

> 状态：APPROVED_BY_DELEGATED_AUTHORITY
>
> 日期：2026-08-23
>
> 产品事实源：`design/product/skin_care_app_mvp_spec.md`
>
> 覆盖范围：切片 2 与切片 3，不包含产品、贴纸、区域趋势或公开测试加固。

## 1. 目标与边界

切片 2 把 Slice 1 的单目标全脸观察扩展为“一次记录共享一张原图、包含一至六个固定区域目标、每个目标独立 AI 状态与降级”。切片 3 把每个有效区域目标组织成区域时间点，并归入该区域唯一的当前事件或历史事件。

自切片 2 起，新建接口不再创建 `full_face` 目标。既有全脸记录继续读取和展示，不修改、不转换、不进入区域事件。区域事件只组织原始记录和事实，不生成变化方向、趋势或跨区域结论。

## 2. 方案选择

采用“扩展现有 Observation 领域并新增 RegionEvent”方案：

- `ObservationRecord` 仍代表一次用户保存动作，持有幂等键、时间和零或一张原图；
- `ObservationTarget` 从单个全脸目标扩展为一至六个区域目标，每个目标持有独立原文、状态、事实和 AI 版本；
- `RegionEvent` 只负责按用户和固定区域组织有效目标，不参与 AI 判断；
- 一个区域目标就是一个候选时间点，只有 AI 事实通过校验或用户提交非空原文后才在事件中可见。

不采用平行 `RegionObservation` 聚合，因为它会复制照片、幂等、日志和轮询链路。不改造 legacy Patch lineage，因为其医学化、单颗追踪和旧区域字典与当前 MVP 冲突。

## 3. 固定区域字典与左右方向

后端 `region_catalog.py` 是 API 和 AI 的最终校验来源；移动端 `region-catalog.ts` 保存同一组稳定常量并以契约测试锁定一致性。固定顺序为：

1. `forehead`：额头；
2. `left_face`：左侧脸；
3. `right_face`：右侧脸；
4. `nose_area`：鼻周；
5. `mouth_area`：口周；
6. `chin`：下巴。

左、右始终指用户本人真实左右。移动端选择项显示“你的左侧脸”和“你的右侧脸”，提交稳定 ID；`CameraView` 保持 `mirror={false}`。即使系统相机预览采用镜像，区域选择也不从屏幕坐标推导，因此镜像不能改变保存的 ID。

每个定义同时包含中文名称、固定边界、允许的位置词和其他区域的禁用位置词。后端拒绝字典外 ID、重复 ID、空列表和超过六项的列表。

## 4. 切片 2 数据模型

迁移 `0014_region_observation_targets` 在既有表上追加：

- `observation_records.recorded_timezone_offset_minutes`：UTC 到设备当地时间的分钟偏移，范围 -840 至 840；旧全脸记录允许空；
- `observation_records.recorded_local_date`：由后端根据 `recorded_at + offset` 计算，旧全脸记录允许空；
- `observation_targets.user_note`：区域原文，最多 500 字，和 AI 事实永久分离；
- 数据库区域约束：`region_id` 只能是六个固定 ID；
- 保留现有同一记录与区域唯一索引，确保一个区域最多一个目标。

新区域记录的记录级 `user_note` 固定为空。旧全脸记录继续从记录级 `user_note` 读取，响应层把它映射到唯一全脸目标，避免改写历史数据。

## 5. 切片 2 API 契约

`POST /api/v1/observations` 继续使用 multipart，以便原图和结构化目标一次提交：

- `client_request_id`：用户级幂等 UUID；
- `recorded_at`：UTC 时间；
- `recorded_timezone_offset_minutes`：设备偏移；
- `targets_json`：JSON 数组，每项为 `{region_id, user_note?}`；
- `taken_at` 和可选 `file`。

有照片时区域原文可空，目标初始为 `queued`。无照片时每个区域原文必须分别为去除首尾空格后的 1–500 字，目标直接为 `completed/user_record`。响应统一返回 `targets` 数组；既有全脸历史也作为单项数组返回。

幂等查询发生在读取和校验重传文件之前。同一用户重复提交同一 UUID，返回首次保存的原图、区域集合和目标，不创建额外照片、目标或 AI 任务。首次事务一次性保存照片、记录和全部目标；提交成功后才逐目标调度 worker。

失败区域的文字补充使用：

`PUT /api/v1/observations/{observation_id}/targets/{target_id}/note`

只允许当前用户所属、状态为 `needs_input` 的目标。它只完成该目标，不修改同记录其他目标、原图或 AI 审计。

## 6. 按区域 AI

新增 `region_observation_prompt.py` 和 `region_analysis_service.py`。每个目标独立调用统一 gateway，输入包含：

- 稳定 `region_id`；
- 中文名称和固定边界；
- “用户本人左右”的方向说明；
- 完整原图的 AI 输入副本；
- 与全脸一致的七项中性事实 Schema。

当前不做自动人脸定位或固定像素裁剪。未经验证的裁剪容易在角度、构图和自拍方向上删错证据；完整原图不被修改，Prompt 与输出校验负责限制观察范围。未来若增加区域分析副本，必须保留原图并单独验证方向。

展示校验分两层：

1. 通用安全校验禁止医学分类、严重度、评分、产品和建议；
2. 区域边界校验禁止显式输出其他五个区域或全脸综合结论。

首次不安全或越区响应由同一 provider 重试一次；第二次仍越界时，确定性修正只保留当前区域内的安全字段，删除越区项并重建摘要，同时写入 `validation_warnings`。修正后没有任何可用事实则目标进入 `needs_input`，不能显示空白或伪造结果。

worker 根据目标 `scope_type` 分派旧全脸或新区域分析。区域目标各自原子认领 `queued → processing`；成功或失败只更新当前目标。Prompt、Schema、provider、model、trace 和原始响应继续写入 AI 调用日志。

## 7. 切片 2 移动端流程

新建观察采用以下步骤：

1. 拍摄一张照片或选择无照片；
2. 从六区字典选择一至六项，可加载上次成功保存的选择；
3. 无照片时为每个区域分别填写非空原文；
4. 独立确认页显示最终区域、本人左右说明、照片/文字来源；
5. 只有确认后的区域集合可以保存，修改选择会使确认失效；
6. 保存成功后才把选择写入 SecureStore 并进入详情。

草稿固定 UUID、记录时间、时区偏移、照片和区域集合。重拍、返回修改、网络重试都不更换 UUID。详情页按固定区域顺序展示多个目标，每个目标独立显示排队、处理中、照片事实、用户原文或需要补充文字。只要任一目标仍在处理，页面继续轮询；离开或重启后从服务端恢复。

列表卡显示所选区域和汇总状态，不把多个区域合并成全脸结论。既有全脸卡明确标为“历史全脸记录”。

## 8. 切片 3 数据模型

迁移 `0015_region_events` 新增 `region_events`：

- `user_id`、`region_id`；
- `status = pending | current | ended`；
- `previous_event_id`，用于达到门槛后新事件保留前序关系；
- `started_local_date`、`last_valid_local_date`；
- `ended_at`、`end_reason = user_ended | replaced`；
- 每用户每区域最多一个 `pending` 和一个 `current` 的部分唯一索引。

`observation_targets.region_event_id` 指向预留或当前事件。事件可以先以 `pending` 内部状态预留，但 API 不展示 pending 事件；首个关联目标成为有效时间点时才激活为 `current`。这样 AI 失败不会产生用户可见的空事件，同时异步完成顺序不会丢失用户在保存前做出的事件选择。

## 9. 30 天规则与事件归属

`recorded_local_date` 由服务端根据 UTC 时间和设备偏移计算。日期差小于 30 自动续接；大于等于 30 必须选择继续或新建。

保存前调用：

`POST /api/v1/region-events/preview`

输入区域、记录时间和偏移；输出每个区域的 `auto_new`、`auto_continue` 或 `choice_required`、当前事件 ID 和相隔天数。多个需要选择的区域在移动端一个汇总确认页处理。

创建 Observation 时每个目标携带可选 `event_decision = continue | start_new`。后端在事务中重新核对 preview：

- 无当前事件：预留 pending 新事件；
- 存在 pending 新事件：新目标复用该 pending；
- 当前事件不足 30 天：直接关联当前事件；
- 达到门槛且选择继续：关联当前事件；
- 达到门槛且选择新建：预留一个 previous 指向当前事件的 pending 事件。

目标成为有效时间点时：当前事件更新最后日期；pending 事件转为 current，并把 previous 当前事件标记为 ended/replaced。该过程按目标、事件行加锁并保持幂等。事件归属不调用 AI。

主动结束使用 `POST /api/v1/region-events/{event_id}/end`。它只改变组织状态，文案不使用“痊愈”等医学含义。下次该区域形成有效时间点时创建新事件。

## 10. 切片 3 回看

API 提供：

- `GET /api/v1/region-events?status=current|ended`：事件列表和有效时间点数；
- `GET /api/v1/region-events/{event_id}`：按时间倒序的有效区域目标、记录时间、原图/原文、事实、来源和状态；
- 账号隔离：其他用户事件统一返回 404。

“观察”页展示当前区域事件和最近记录；“历程”页先展示区域事件，再单独保留既有全脸历史。事件详情不生成前后变化、阶段趋势、产品疗效或跨区域摘要。

## 11. 错误与恢复

- 字典外、重复或空区域：保存前 422；
- 30 天选择缺失或 preview 已过期：409 并返回最新 preview，移动端回到汇总确认；
- 原图保存或数据库失败：整条记录失败且清理新对象，不调度任何 AI；
- 单个 AI 失败：仅该目标 `needs_input`，其他目标继续；
- worker 重复执行：非 queued 目标不再次分析；
- 迟到结果：不能覆盖用户原文；
- pending 事件只有在目标有效后才对用户可见；
- 所有列表、详情、补充和结束操作均按当前用户过滤。

## 12. 验证策略

按 TDD 实现，每个生产行为先有失败测试。验证分四层：

1. 纯契约：六区字典、顺序、左右文案、草稿确认失效、表单内容、状态聚合；
2. 后端单元/API：多目标幂等、独立 worker、越区输出、目标级补充、30 天边界和用户隔离；
3. PostgreSQL：0014/0015 往返迁移、唯一索引、同 UUID 并发、事件唯一 current/pending、重新 Session 读取；
4. 本地真实闭环：真实 FastAPI、PostgreSQL、对象存储和 gateway 代码路径完成照片多区保存、独立异步结果、重启读取、事件续接/新建/结束/回看。

无人值守规则禁止把本地照片发送到第三方。本轮不会新增真实 GLM 请求；真实 provider 只使用已经存在的 Slice 1 证据，新区域 Prompt 以契约、gateway 集成和本地闭环验证。最终报告必须明确区分“真实本地闭环”和“未新增第三方推理”，不能用 Mock 冒充远端模型验证。
