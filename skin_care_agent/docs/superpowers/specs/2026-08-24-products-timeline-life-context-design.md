# Slice 4–5 产品使用、统一历程与生活背景设计

> 状态：APPROVED。用户在 2026-08-24 的持续目标中明确授权实现 Slice 4，并在完成后直接进入 Slice 5。
>
> 产品事实源：`design/product/skin_care_app_mvp_spec.md` 2026-08-23 ACTIVE 版。
>
> 本设计只细化 MVP 已确认的 Slice 4–5，不恢复平台产品池、产品资料补全、相关性、疗效、区域趋势或 legacy 日记。

## 1. 目标与边界

Slice 4 交付一个独立、真实持久化的产品使用闭环：用户可以维护个人产品柜，选择多个已有产品、立即加入手动名称，或不选产品以“未注明产品”记录真实使用时间和备注；使用事实能在产品页和历程中回看。

Slice 5 在此基础上交付统一历程和生活背景：历程按真实发生时间组织区域事件、区域时间点、既有全脸历史和产品使用；观察记录可以保存六项固定生活背景或明确跳过；贴纸只按用户原始选择展示，不进入 AI、趋势、相关性或因果解释。

## 2. 方案比较与选择

### 方案 A：独立产品/使用领域，加只读历程聚合层（采用）

- `Product` 和 `ProductUse` 独立于 Observation；产品使用可以在任何时间单独成立。
- `ProductUseProduct` 只保存某次使用与个人产品的多对多关系；零个关系就是“未注明产品”，不创建伪产品。
- `LifeContext` 只关联 Observation；统一历程服务读取各领域事实，不拥有或改写它们。
- 优点是语义直接、账号隔离明确、以后可以独立演进；代价是需要新增一组表、API 和聚合 DTO。

### 方案 B：把产品和生活背景都挂到 Observation（不采用）

能减少表和路由，但违反“产品使用不依附照片记录也能成立”，也会把三个独立事实重新耦合。

### 方案 C：复用 legacy CheckInDiary（不采用）

旧日记字段和三视角 CheckIn、评分语义绑定，不能表达多产品、未注明产品、独立使用事实或新版区域观察，复用会把 legacy 模型带回 MVP。

## 3. Slice 4 数据模型

### 3.1 `personal_products`

- `id`：用户内稳定标识；
- `user_id`：账号隔离；
- `client_request_id`：产品新增请求幂等键，与 `user_id` 组成唯一索引；
- `name`：去除首尾空格后 1–120 字；
- `created_at`、`deleted_at`。

首版不保存品牌、规格、浓度、包装、图片或平台标准 ID。同名产品不被系统自动解释为同一商品；只有相同 `client_request_id` 的重试返回同一条记录。

### 3.2 `product_uses`

- `id`、`user_id`；
- `client_request_id`：与 `user_id` 组成唯一索引，确保网络重试不产生重复使用记录；
- `used_at`：带时区的真实使用时间，默认由客户端初始化为当前时间并允许修改；
- `used_timezone_offset_minutes`：保存当时设备偏移，范围 -840–840；
- `note`：去除首尾空格后可空，最多 500 字；
- `created_at`、`deleted_at`。

### 3.3 `product_use_products`

- `product_use_id`、`product_id` 复合主键；
- 外键级联删除；
- 服务层必须验证所有产品属于当前账号，重复 ID、字典外 ID或其他账号 ID 整体拒绝，不产生部分记录。

零个关联产品是“未注明产品”的唯一数据语义。数据库中不创建名为“未注明产品”的 Product。

## 4. Slice 4 API 契约

### 4.1 个人产品

- `POST /api/v1/products`：`client_request_id`、`name`；首次返回 201，幂等重试返回 200；
- `GET /api/v1/products`：按最近使用时间、创建时间排序，返回 `use_count` 和 `last_used_at`；
- `GET /api/v1/products/{product_id}`：返回产品和按 `used_at` 倒序的真实使用历史；其他账号一律 404。

### 4.2 产品使用

- `POST /api/v1/product-uses`：`client_request_id`、`used_at`、`used_timezone_offset_minutes`、`product_ids`、`note`；首次 201，幂等重试 200；
- `GET /api/v1/product-uses`：按 `used_at`、`id` 倒序分页；
- `GET /api/v1/product-uses/{use_id}`：读取一次使用事实；其他账号一律 404。

响应中的 `products` 只返回当次真实关联产品的稳定 ID 和原始名称；为空时前端显示“未注明产品”。API 不返回疗效、推荐或观察关联字段。

## 5. Slice 4 移动端流程

- “产品”一级页加载个人产品柜，显示名称、使用次数、最近使用时间，并提供“添加产品”和“记录一次使用”；
- 新增名称在确认后立即通过真实 API 保存，成功后进入产品柜；
- 产品详情页只展示该产品的真实使用历史；
- 记录使用页可以从产品柜多选，保存零项，修改日期和时间，填写最多 500 字备注；
- 日期时间使用已安装的 Expo 57 `@expo/ui/community/datetime-picker`，Android 以分开的日期/时间 dialog 呈现，iOS 使用兼容组件；
- “观察”页增加“记录产品使用”快捷入口；
- Slice 4 先在历程中增加明确分区的产品使用事实，Slice 5 再升级为统一排序。

## 6. Slice 5 生活背景模型与契约

固定 ID 与页面名称只有：

| ID | 名称 |
|---|---|
| `sleep` | 睡眠 |
| `stress` | 压力 |
| `diet` | 饮食 |
| `mood` | 情绪 |
| `menstrual_cycle` | 生理期 |
| `care_change` | 护理变化 |

`observation_life_contexts` 使用 `observation_id`、`context_id` 复合主键。`observation_records.life_context_completed_at` 区分“尚未选择”和“已明确跳过”；空关联加非空完成时间表示跳过。

- `PUT /api/v1/observations/{observation_id}/life-contexts` 接受固定 ID 列表；排序归一化、拒绝重复和未知 ID；保存后返回更新后的 Observation；
- Observation 输出追加 `life_context_ids` 和 `life_context_completed_at`；
- 只有记录所属用户能读写，其他账号 404；
- 生活背景不传给任何 AI service/gateway，不出现在趋势输入 DTO。

观察详情在原始记录和各区域结果之后展示贴纸。尚未完成时允许多选并保存，也允许“这次跳过”；完成后仍展示保存的原始选择。区域事件时间点复用 Observation DTO，因此能看到同一观察记录的贴纸，不复制贴纸到每个区域事件。

## 7. Slice 5 统一历程

新增 `GET /api/v1/timeline` 只读聚合接口，返回按时间倒序的判别联合：

- `region_event`：区域、事件状态、最后有效日期、时间点数量、事实来源集合；
- `full_face_observation`：既有全脸记录、记录时间、状态和来源；
- `product_use`：真实使用时间、产品名称列表或空列表、备注、来源固定为 `user_record`。

区域事件仍是区域记录主线；区域时间点在事件详情中查看，避免同一事实在统一历程顶层重复两次。事件详情中的每个时间点显示原始依据、观察来源和生活背景。产品使用在时间线上只表示同时段事实，文案固定说明“不代表与皮肤状态存在关联或疗效”。

聚合服务只读已有事实，不创建关联、不调用 AI、不生成比较结论。排序时间分别取事件最后有效时间、全脸 `recorded_at` 和产品 `used_at`；同时间以稳定 kind/id 次序消除翻页抖动。

## 8. 一致性、失败与幂等

- 产品新增和产品使用分别使用客户端固定 UUID；提交失败时重试沿用原 UUID；
- 产品使用创建在一个事务中验证账号、写主记录和全部关联，任何一步失败整体回滚；
- 生活背景更新在一个事务内替换固定关联并写完成时间；
- API 技术错误经现有 `userFacingError` 转换，页面不显示数据库或 provider 信息；
- 产品、使用、生活背景和统一历程不调用 AI gateway，因此不会影响区域异步任务和状态恢复；
- 所有列表、详情和聚合查询都显式过滤 `user_id` 与 `deleted_at`。

## 9. 验证策略

- 模型/迁移：约束、外键、幂等唯一索引、零产品语义、固定贴纸字典、升级/降级往返；
- 后端单元/API：多产品、未注明、手动产品、时间/备注校验、重复 UUID、账号隔离、产品历史、贴纸跳过/选择、统一时间线排序和来源；
- PostgreSQL 集成：真实事务、外键、幂等、跨账号、应用重启恢复；
- 移动端单元：精确请求 DTO、表单校验、固定 UUID、时间转换、贴纸字典、时间线呈现与禁止因果文案；
- 移动端静态检查：全量 unit、TypeScript、Expo lint；
- 本地 HTTP 闭环：注册/协议、添加产品、多选与未注明使用、历程/产品历史恢复、观察贴纸选择与跳过、事件回看及跨账号 404；
- 回归：Slice 2 的六区、本人左右、多目标幂等、独立异步状态与 AI 边界，以及 Slice 3 区域事件回看必须继续通过。

## 10. 明确不做

- 平台总产品池、品牌/规格/浓度、包装或 OCR；
- 产品编辑、删除、去重推荐或别名合并；
- 产品推荐、使用频率建议、疗效或相关性；
- 自定义生活背景、贴纸自由文本或 AI 推断贴纸；
- 区域趋势、跨区域结论或把产品/贴纸送入全脸趋势；
- 修改 legacy CheckInDiary、旧趋势和聊天。
