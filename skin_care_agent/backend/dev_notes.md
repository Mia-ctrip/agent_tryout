# Backend 开发日志

> 每完成一个可测试小步，追加一段。三段结构：**我做了什么** / **关键设计决策** / **你需要操作什么**。
> 不是通用文档，是给下一次会话（或未来自己）快速接手用的。
## 项目路线图（初始规划）

以下是项目最初按产品能力拆分的主线。实际实现过程中，Step 3 已从原计划的 Mock 版调整为真实 LLM gateway 接入，Step #6 的 tracker 也提前完成；后续以本文件各章节的实际状态为准。

1. 基础脚手架：FastAPI、配置、PostgreSQL、Alembic、健康检查
2. `storage_service` + 照片上传：本地存储、`photos` 表、签名 URL
3. AI 业务接入：原计划为 Mock 全链路，实际改为真实 LLM、多 Provider 降级、限流、合规和问答
4. vision 模块：MediaPipe 对齐、眼部打码、标注图渲染（不含 tracker）
5. 真实视觉 LLM：Qwen-VL 优先，并接入 Provider 降级链
6. `vision.tracker`：跨日 patch 匹配和生命周期状态机
7. trends、diary、medications、chat 及小程序对接
8. 首启免责声明与 `checkNeedDoctor` 规则（合规收尾）

---

## Step 1 — 项目脚手架

### 我做了什么

搭起最小可运行的 FastAPI + PostgreSQL 骨架。

- `pyproject.toml` — 依赖声明，分核心 / `[dev]` 两组
- `app/config.py` — pydantic-settings 读 `.env`，`@lru_cache` 单例
- `app/db/session.py` — SQLAlchemy `engine` + `SessionLocal` + `get_db()` 依赖
- `app/models/base.py` — `Base` / `IdMixin`（BigInteger 主键）/ `TimestampMixin`（含软删 `deleted_at`）
- `app/main.py` — FastAPI factory + CORS + lifespan
- `app/api/health.py` — `/health`（进程） + `/health/db`（`SELECT 1` 验 PG）

初始项目结构的关键部分：

```text
skin_care_agent/
├── .gitignore
└── backend/
    ├── pyproject.toml
    ├── alembic.ini
    ├── .env.example
    ├── README.md
    └── app/
        ├── main.py
        ├── config.py
        ├── api/health.py
        ├── db/session.py
        ├── db/migrations/
        └── models/base.py
```
- `app/api/health.py` — `/health`（进程） + `/health/db`（`SELECT 1` 验 PG）
- `alembic.ini` + `app/db/migrations/env.py` — DB URL 从 settings 注入，避免硬编码
- `.env.example` — 全部环境变量模板
- `.gitignore` — 忽略 `.venv` / `.env` / `storage_local/`

### 关键设计决策

- **PG 不选 MySQL**：为后面 JSONB（日记 tags）/ 数组+GIN（合规审计）/ pgvector（相似图检索）留路。PG License 永久免费，自己装零成本。
- **`.env` 注入 alembic URL**：alembic.ini 里 `sqlalchemy.url=` 留空，由 `env.py` 从 settings 注入，避免在 git 里漏密钥。
- **软删而非硬删**：所有业务表带 `deleted_at`，配合"不支持用户删数据"的产品定位。
- **uv 管理虚拟环境**：`.venv` 落在项目内（`backend/.venv/`），删项目即删环境。
- **配置全走 pydantic-settings + .env**，不硬编码 key
- **软删除**：所有业务表带 `deleted_at`，查询时 filter `deleted_at IS NULL`
- **user_id 用 BigInteger**：为将来接微信 openid 独立表留空间

### 你需要操作什么

（环境初始化已完成；以下是可复现步骤）

```powershell
cd D:\agent\model\projects\skin_care_agent\backend
uv venv
.venv\Scripts\activate
uv pip install -e ".[dev]"
copy .env.example .env
```

编辑 `.env`，至少确认：

```text
DATABASE_URL=postgresql+psycopg://skin:skin@localhost:5432/skin_care
```

首次使用前创建 PostgreSQL 16 用户和数据库：

```sql
CREATE USER skin WITH PASSWORD 'skin';
CREATE DATABASE skin_care OWNER skin;
```

然后执行：

```powershell
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

验证：

- `GET http://localhost:8000/health`：进程存活
- `GET http://localhost:8000/health/db`：数据库可达
- `http://localhost:8000/docs`：打开 Swagger 接口页面

---

## Step 2 — storage_service + 照片上传

### 我做了什么

**ORM 模型**：

- `app/models/user.py` — `users` 表（`id` / `wx_openid` / `nickname` / 软删）。微信 openid 独立建模，登录接入前可为空。
- `app/models/photo.py` — `photos` 表（`user_id` 外键 / 唯一 `storage_key` / mime / size / 宽高 / `taken_at` / 软删）。
- `app/models/__init__.py` — 导入新模型，保证 `Base.metadata` 能感知。

**存储抽象** `app/services/storage_service/`：

- `base.py` — `StorageBackend` 抽象类 + `SignedURL` dataclass，定义 `put` / `get` / `exists` / `delete` / `signed_url` 五个方法。
- `local.py` — `LocalStorage` 实现，文件落在 `backend/storage_local/`。
- `signing.py` — HMAC-SHA256 签名/校验，URL 形如 `/files/{key}?exp=...&sig=...`。
- `factory.py` — `get_storage()` 工厂，按 `STORAGE_BACKEND` 返回实现，`@lru_cache` 单例。

**Schema 与 HTTP 路由**：

- `app/schemas/photo.py` — `PhotoUploadResponse` / `PhotoOut`。
- `app/api/photos.py` — `POST /photos` multipart 上传 + `GET /photos/{id}/url` 重签 URL。
- `app/api/files.py` — `GET /files/{key:path}` 验签后返回文件流。

**配置与迁移**：

- `STORAGE_URL_SIGN_SECRET`、`STORAGE_URL_TTL_SECONDS=900`、`UPLOAD_MAX_BYTES=8MB`、`UPLOAD_ALLOWED_MIMES=image/jpeg,image/png,image/webp`。
- `app/db/migrations/versions/0001_init.py` — 手写迁移，建 `users` 和 `photos`，不用 autogenerate。

### 关键设计决策

- **签名 URL 而非直挂静态目录**：防路径猜测 + 短期过期（默认 15 分钟）。
- **接口和 S3/COS 对齐**：`SignedURL` dataclass + `signed_url(key, ttl)`，将来切云存储不改业务。
- **签名内容**：`HMAC(secret, "{key}|{exp}")`；key 防止签名复用到其他文件，exp + 短 TTL 限制 URL 外传后的有效窗口。
- **种子用户 user_id=1**：未接微信登录前，所有请求挂到 id=1；`_ensure_seed_user` 幂等创建。接入 `/auth/wx/login` 后只替换真实登录态，不改表结构。
- **Pillow 二次校验**：不信任 `Content-Type`，用 `PIL.verify()` 确认图像合法并提取宽高。
- **路径结构**：`photos/{uid}/YYYY/MM/DD/{uuid}.{ext}`，按日分目录避免单目录文件爆炸，uuid 防猜测。
- **上传与算法解耦**：上传接口只存盘和入库，不在上传请求中运行 MediaPipe/LLM；分析走后续流程，保持上传接口快速。

### 你需要操作什么

（已完成。`/photos` POST 已能上传，`GET /photos/{id}/url` 已能拿到签名地址。）

验证流程：

1. 执行 `alembic upgrade head`，预期迁移到 `0001_init`，数据库中出现 `users`、`photos` 和 `alembic_version`。
2. 重启 uvicorn，在 `/docs` 中调用 `POST /photos` 上传 jpg/png/webp。
3. 把返回的 `url` 贴到浏览器，确认能看到图片。
4. 修改 URL 末尾的 `sig` 任意一个字符，确认返回 `403 invalid or expired signature`。

示例返回字段：

```json
{
  "photo_id": 1,
  "storage_key": "photos/1/2026/06/29/xxx.jpg",
  "width": 1080,
  "height": 1920,
  "url": "http://localhost:8000/files/photos/1/2026/06/29/xxx.jpg?exp=...&sig=...",
  "url_expires_at": "..."
}
```

---

## Step 3 — ai_service 业务接入（真实 LLM + 合规 + 限流）

### 总体计划

3 拆 4 步交付：

- **3a**（已完成）：限流表 + 中间件 + dev 豁免
- **3b**（本次）：`POST /analyses` + 双表持久化 + 图片压缩后 base64 送 LLM
- **3c**（下一步）：schema_guard 严格版 + 合规出参扫描（违禁词/药品名/诊断词）
- **3d**：`POST /chat` + chat_messages 表

---

### Step 3a — 限流表 + 中间件 + dev 豁免

#### 我做了什么

- `app/models/ai_usage.py` — `AIUsageCounter` 表，`(user_id, kind, usage_date)` 唯一约束。
- `app/db/migrations/versions/0002_ai_usage.py` — 数据库迁移。
- `services/ai_gateway/rate_limit.py` — `try_consume` / `peek` / `require` / `QuotaExceeded`。
- `app/api/ai_debug.py` — `GET /ai/debug/quota` 查看 seed user 当日配额，`POST /ai/debug/quota/{kind}/consume` 手动占额。
- `config.py` 和 `.env.example` — 新增 `AI_RATELIMIT_ENFORCE_IN_DEV`。

#### 关键设计决策

- **单 SQL 完成原子占额**：`INSERT ... ON CONFLICT DO UPDATE ... WHERE count < :limit RETURNING count`。未存在时插入 1；未达上限时更新 +1；达到上限时 WHERE 阻止更新且无 RETURNING，避免“先 SELECT 再 UPDATE”的并发竞态。
- **dev 豁免**：`APP_ENV=dev` 且 `AI_RATELIMIT_ENFORCE_IN_DEV=false`（默认）时直接放行，不查库、不写库，调试时不会误占产线配额。
- **测试真实限流**：将 `.env` 中 `AI_RATELIMIT_ENFORCE_IN_DEV=true`、`AI_ANALYZE_DAILY_LIMIT=2`，连续调用三次应为 200、200、429；测完改回 false。
- **不落在中间件层**：限流是业务动作，让 API handler 显式调用 `rl.require(db, user_id, "analyze")`；健康检查等路径不需要排除清单。

#### 你需要操作什么

1. `.env` 追加（可选，默认就是 false）：

```text
AI_RATELIMIT_ENFORCE_IN_DEV=false
```

2. 执行迁移：

```powershell
cd D:\agent\model\projects\skin_care_agent\backend
.venv\Scripts\activate
alembic upgrade head
```

预期：`Running upgrade 0001_init -> 0002_ai_usage`。

3. 重启 uvicorn。

4. 在 `/docs` 验证：
   - `GET /ai/debug/quota` 应看到 analyze/chat 两条记录，dev 豁免下 `used=0`。
   - `POST /ai/debug/quota/analyze/consume` 应返回 `allowed=true`，dev 豁免下 used 仍为 0。
   - 打开真实限流开关并设置每日上限为 2，连续调用三次应为前两次 200、第三次 429；测完改回 false。

---

### Step 3b — POST /analyses + 双表持久化 + 图片压缩

#### 我做了什么

**新增文件**：
- `models/ai_call_log.py` + `models/analysis.py`
- `db/migrations/versions/0003_analyses.py`（建 ai_call_logs + analyses 两表）
- `services/vision/image_prep.py`（Pillow 压缩 → JPEG q=85 → base64 data URL）
- `services/ai_gateway/prompts.py`（vision system prompt 集中管理 + version 字段）
- `services/analysis_service.py`（业务层：拉图 → 压缩 → gateway → 解析 → 落库）
- `schemas/analysis.py`（AnalyzeRequest / AnalysisOut）
- `api/analyses.py`（`POST /analyses` / `GET /analyses/{id}` / `GET /analyses/by-photo/{photo_id}`）

**修改文件**：
- `models/__init__.py` 追加导入
- `main.py` 挂载 analyses router

#### 关键设计决策

**1. 双表分离（业务表 + 日志表）**
- `analyses` 只存成功结果（前端/趋势查询用）
- `ai_call_logs` 全量落日志（success / llm_failed / parse_failed），供成本核算 + 排障
- 关联：`analyses.ai_call_log_id → ai_call_logs.id`

**2. 幂等（force=false 默认走缓存）**
- 默认命中 `photo_id` 的最近一条成功 analyses 直接返回（`cached=true`）
- `force=true` 时跳过缓存 → 消耗一次配额 → 真调 LLM
- 缓存命中**不消耗配额**（读旧结果不算 AI 调用）

**3. 图片压缩策略**
- 长边 > 1600px → 等比缩放到 1600；JPEG q=85
- **FIXME(step-4)**：接入 vision 模块后应改为"人脸检测 + 裁剪 + 眼部打码"再送 LLM，image_prep 下沉为纯 resize 工具。压缩必然影响细节，只是 MVP 阶段控成本的过渡方案。
- 为什么不上公网 CDN：MVP 本地部署，外网 LLM 拉不到 localhost；上 CDN 是生产方案。

**4. 失败落库分类**
- `llm_failed`：gateway 抛 FatalRequestError / AllProvidersFailedError（HTTP 502）
- `parse_failed`：LLM 返回非 JSON 或 shape 异常（HTTP 422）
- 都写 ai_call_logs 一条，errno + error_message 全存；成功不写 analyses

**5. Prompt 版本化**
- `VISION_ANALYZE_PROMPT_VERSION = "vision-1.0.0"` 写入 `ai_call_logs.input_meta.prompt_version`
- 后面 3c 改 prompt 时递增版本号，就能 SQL 对比"新 prompt 通过率 vs 旧 prompt"

**6. 兼容 gateway 现状**
- 复用 `UnifiedRequest(response_format="json", temperature=0.1)`
- `Message` 中 `image_urls` 塞 base64 data URL；openai_compat 的 `_encode_message` 会自动组装 multipart content
- 不改 gateway 代码

#### 你需要操作什么

**1. 跑迁移**
```bash
cd backend
alembic upgrade head
# 应看到 Running upgrade 0002_ai_usage -> 0003_analyses
```

数据库应新增 `ai_call_logs`、`analyses` 两张表。

**2. 确认 .env 已配 MiniMax key**
```
MINIMAX_API_KEY=sk-xxx（你已配）
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M3
```

**3. 重启 uvicorn**
```bash
uvicorn app.main:app --reload
```

**4. 端到端验证（在 /docs 或 curl）**

```bash
# a. 先上传一张人脸照片
curl -X POST http://localhost:8000/photos \
     -F "file=@/path/to/face.jpg"
# → 返回 photo_id，记下

# b. 分析这张照片（第一次会真调 LLM）
curl -X POST http://localhost:8000/analyses \
     -H "Content-Type: application/json" \
     -d '{"photo_id": <上一步的id>, "force": false}'
# → 返回完整 parsed_result，cached=false

# c. 再调一次（应走缓存）
curl -X POST http://localhost:8000/analyses \
     -H "Content-Type: application/json" \
     -d '{"photo_id": <同上>, "force": false}'
# → cached=true，秒返回

# d. force 重跑
curl -X POST http://localhost:8000/analyses \
     -d '{"photo_id": <同上>, "force": true}'
# → cached=false，又调一次 LLM

# e. 看历史
curl http://localhost:8000/analyses/by-photo/<photo_id>
# → 返回该照片的所有分析记录（按时间倒序）
```

**5. 观察数据库**
```sql
-- 看每次 AI 调用日志
SELECT id, status, provider, model, input_tokens, output_tokens, latency_ms, error_message
FROM ai_call_logs ORDER BY id DESC LIMIT 10;

-- 看成功的分析结果
SELECT id, photo_id, overall_severity, skin_health_index, needs_doctor, provider
FROM analyses ORDER BY id DESC LIMIT 10;

-- 看 parsed_result 里的痘痘计数
SELECT id, parsed_result->'acne_types' FROM analyses ORDER BY id DESC LIMIT 3;
```

**6. 已知遗留问题（3c 处理）**
- Prompt 里的 schema 是自然语言描述，模型偶尔字段不全时不会拦截
- 违禁词/药品名扫描还没做
- description 字段的合规审计还没做

---

### Step 3b+ — AI 调用可观测性（trace + 每次 provider 落库 + debug API）

#### 我做了什么

**新增文件**：
- `services/ai_gateway/observability.py`
  - `trace_id`（contextvar 存 + `new_trace_id`）
  - `TracedLogger`：结构化日志，格式 `[trace=xxx] event key=val key=val`
  - `sanitize_messages_for_log`：把 base64 data URL 替换成 `<data:image/jpeg;base64,...(N chars)...>`
  - `ProviderCallRecord` dataclass：一次 provider 调用的完整快照
- `db/migrations/versions/0004_ai_call_log_trace.py`

**改造文件**：
- `models/ai_call_log.py`：加 `trace_id / attempt_seq / request_payload` 三列
- `services/ai_gateway/gateway.py`：
  - 新增 `GatewayInvokeResult`（含 response + records）
  - 新增 `invoke_detailed(task, req, *, trace_id, start_attempt_seq, skip_bindings)`
  - `invoke()` 保留旧签名，内部走 `invoke_detailed`
  - 每次 provider 调用/跳过都产生一条 record
  - 关键节点打 trace log
- `services/analysis_service.py`：全部重写
  - 生成 `trace_id` 挂到 contextvar
  - 用 `invoke_detailed` 拿全量 records
  - **B 方案**：gateway 说 ok 但 JSON parse 失败 → 把该 (provider, model) 加入 skip_bindings → 再跑一次 gateway 走下一家；最多 5 轮兜底
  - 每条 record 落一条 `ai_call_logs`
  - `analyses.ai_call_log_id` 关联最终 success 那条
- `api/analyses.py`：response header 加 `X-Trace-Id`；失败 detail 也含 trace_id
- `api/ai_debug.py`：新增
  - `GET /ai/debug/logs?limit=&kind=&status=&provider=`：列最近
  - `GET /ai/debug/logs/{id}`：完整详情
  - `GET /ai/debug/logs/{id}/raw-text`：只看 LLM 原文，方便复制
  - `GET /ai/debug/traces/{trace_id}`：按 trace 聚合，一次业务请求的所有 attempt
- `services/ai_gateway/__init__.py`：导出 `GatewayInvokeResult / ProviderCallRecord / trace_log / new_trace_id / sanitize_messages_for_log`

#### 关键设计决策

**1. 一次业务请求 = 一个 trace_id，一次 provider 调用 = 一条 log**
- 旧版：`/analyses` 一次 → 只落最终一条 log（fallback 时中间的家消失了）
- 新版：minimax parse_failed → glm success → 表里两条 log，同一 trace_id，attempt_seq=1/2
- `analyses.ai_call_log_id` 只指向最终 success 那条，前端看结果不用理会日志

**2. parse 失败的处理归 service，不归 gateway**
- Gateway 只管"网络传输 + 断路"，返回 200 就算 ok
- Service 拿到 response 后 try_parse_json，失败就把这家扔进 `skip_bindings` 再调 gateway
- 好处：gateway 保持职责纯粹；3c 加 schema_guard 时可以复用同一套 skip 机制

**3. request_payload 图片脱敏**
- 直接存 base64 会撑爆 JSONB（180KB 图 × N 条）
- `sanitize_messages_for_log` 把 data URL 换成 `<data:image/jpeg;base64,...(240000 chars)...>` 占位符，长度信息保留
- 排障时能看到 prompt 全文 + 图片元信息，看不到图本身

**4. 兜底解析器 `_extract_json_object`**
- 有些模型（MiniMax M3）习惯在 JSON 前后加散文
- 新 parser 会从文本里抠出第一个平衡的 `{ ... }` 块尝试解析
- 这一步是补救，不是长期方案（3c 会做 schema_guard 严校验）

**5. 保持向后兼容**
- 老的 `gateway.invoke()` 签名不变，别处代码（如 `/ai/debug/invoke`）不需要改
- 内部走 `invoke_detailed`，但只返回 response 或抛异常

#### 你需要操作什么

**1. 跑迁移**
```bash
cd backend
alembic upgrade head
# 应看到 Running upgrade 0003_analyses -> 0004_ai_call_log_trace
```

**2.（可选）智谱 GLM key 现在放上去**
```
# .env
GLM_API_KEY=xxx（你已配）
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODEL=glm-4v-plus
```
factory 会自动把 GLM 加入 `vision_analyze` 的 fallback 链。

**3. 重启 uvicorn**

**4. 端到端验证**

```bash
# 触发一次分析（force=true 跳过缓存）
curl -X POST http://localhost:8000/analyses \
     -H "Content-Type: application/json" \
     -d '{"photo_id": <id>, "force": true}' \
     -i
# 关注 response header 的 X-Trace-Id: xxx
```

**5. Debug API 打点点**

打开 http://localhost:8000/docs，展开 `ai-debug` 标签，重点看：

- `GET /ai/debug/logs?limit=10` → 看最近调用列表，含 status/provider/latency/text_preview
- `GET /ai/debug/logs/{id}` → 完整 request_payload + raw_response
- `GET /ai/debug/logs/{id}/raw-text` → 只看 LLM 原文，方便复制到别处
- `GET /ai/debug/traces/{trace_id}` → 一次 /analyses 的完整 attempt 链（minimax → glm → ...）

**6. 终端看结构化日志**

uvicorn 终端会看到：
```
[trace=abc123] analyze.start photo_id=5 user_id=1
[trace=abc123] analyze.image_prep original=3024x4032 resized=1200x1600 bytes=184320
[trace=abc123] gateway.provider.request seq=1 provider=minimax model=MiniMax-M3 task=vision_analyze
[trace=abc123] gateway.provider.ok seq=1 provider=minimax latency_ms=8321 tokens_in=1500 tokens_out=850 text_preview="The image shows..."
[trace=abc123] analyze.parse.fail provider=minimax text_preview="The image shows..."
[trace=abc123] gateway.provider.request seq=2 provider=glm model=glm-4v-plus
[trace=abc123] gateway.provider.ok seq=2 provider=glm latency_ms=6100 tokens_out=920 text_preview="{\"observation\":..."
[trace=abc123] analyze.parse.ok provider=glm fields=15
[trace=abc123] analyze.done status=success analysis_id=3 log_id=8 provider=glm
```

**7. DBeaver 连接串**

```
Host: localhost
Port: 5432
Database: skin_care
User: skin
Password: skin
```
连上后重点看两张表：`ai_call_logs`（全量日志）+ `analyses`（成功结果）。JSONB 字段 DBeaver 会自动展开。

---

### Step 3b++ — 推理模型 reasoning 分离 + parse_strategy 可观测

#### 我做了什么

**背景**：MiniMax M3 是推理模型，会在正式答案前输出 `<think>...</think>` 块。3b+ 的 `_extract_json_object` 兜底 parser 能从散文里抠出中间的 `{...}` 让业务跑通，但排障时 `text_preview` 显示的是 think 内容，看起来像"输出错乱"。

**新增文件**：
- `services/ai_gateway/parsing.py`：`parse_llm_json(text) -> ParseResult`，返回 `(parsed, reasoning, strategy, stripped_text)`
- `db/migrations/versions/0005_reasoning_fields.py`

**改造文件**：
- `models/ai_call_log.py`：加 `reasoning_text TEXT` + `parse_strategy VARCHAR(16)` 两列
- `services/analysis_service.py`：删除内嵌 parser，改用 `parse_llm_json`；record 落库时并入 `reasoning + strategy`
- `api/ai_debug.py`：
  - `LogRowOut` 加 `parse_strategy` + `has_reasoning`
  - `LogDetailOut` 加 `reasoning_text` + `parse_strategy`
  - `/logs` 和 `/traces/{id}` 支持 `preview_len` query 参数（0-5000，0 表示全文）
  - `/logs/{id}/raw-text` 返回体加 `parse_strategy` + `reasoning_text`
- `services/ai_gateway/prompts.py`：版本升到 `vision-1.2.0`
  - 明确允许 `<think>...</think>` 前置
  - 强调 `</think>` 之后必须只有 JSON
  - 推理块语言不限，正文中文

#### 关键设计决策

**1. parse_strategy 三档：direct / extracted / failed**
- `direct`：模型老实输出 JSON，可以直接 `json.loads`
- `extracted`：从散文里抠出 `{...}` 才成功（MiniMax M3 目前几乎全走这条）
- `failed`：完全没抠到，触发 fallback

意义：将来切模型时，SQL 一句就能出"哪家模型有多少比例是 direct"，量化"结构化能力"。

**2. reasoning 单独存 Text 列，不合并到 raw_response**
- `raw_response` 是 gateway 层原始存档，不该被业务后处理污染
- `reasoning_text` 单独查询、单独展示（未来可能在小程序里"给用户看 AI 是怎么想的"）
- 前端 UI 决策：普通用户看 `parsed_result` + `observation`；高级用户/开发者才展开 `reasoning`

**3. 老数据保留**
- id=1、2、3、4 的 `reasoning_text` 和 `parse_strategy` 都是 NULL
- 保留用于纵向对比"prompt v1.1.0 vs v1.2.0 的 parse_strategy 分布"
- 不清

**4. 兼容非推理模型**
- 没有 `<think>` 标签时 `_extract_reasoning` 返回 `(None, 原文)`
- 后续 GLM-4V / Qwen-VL 直接走 direct 路径，reasoning_text 为空

#### 你需要操作什么

**1. 跑迁移**
```bash
alembic upgrade head
# Running upgrade 0004_ai_call_log_trace -> 0005_reasoning_fields
```

**2. 重启 uvicorn**

**3. 触发一次分析（force=true）**
```bash
curl -X POST http://localhost:8000/analyses \
     -d '{"photo_id": <id>, "force": true}' -i
```

**4. 打点验证**

/docs 里点：

- `GET /ai/debug/logs?limit=5` → 新增 `parse_strategy` 和 `has_reasoning` 字段
  - 应该看到最新一条 `parse_strategy=extracted`（如果 MiniMax 还是 think 模式）或 `direct`（如果它听了新 prompt）
  - `has_reasoning=true` 说明拿到了 think 块
- `GET /ai/debug/logs/{id}` → `reasoning_text` 里能看到完整推理过程
- `GET /ai/debug/logs?preview_len=1000` → 预览拉长到 1000 字符
- `GET /ai/debug/logs/{id}/raw-text` → 返回体多了 `reasoning_text` 和 `parse_strategy`

**5. DBeaver 里跑一句看分布**
```sql
SELECT parse_strategy, COUNT(*)
FROM ai_call_logs
WHERE status = 'success'
GROUP BY parse_strategy;
```

**6. 期望的现象变化**
- 如果 MiniMax M3 遵守新 prompt → `<think>` 里放推理、外面只有 JSON → `parse_strategy=direct`
- 如果 MiniMax 仍然习惯性用散文 → `parse_strategy=extracted`，reasoning 依然被剥离得干干净净
- 两种都能业务成功，区别只是可观测性

---

### Step 3c — schema_guard + 合规出参扫描 + 模板兜底

#### 我做了什么

**新增文件**：
- `services/ai_gateway/schema.py`：pydantic v2 model 定义所有 vision_analyze 字段 + 分级校验
- `services/ai_gateway/compliance.py`：违禁词库（疾病/药品/建议句）+ 扫描 + **B4 模板兜底**
- `services/ai_gateway/validators.py`：一致性 + **needs_doctor 服务端强判**
- `db/migrations/versions/0006_compliance_fields.py`

**改造文件**：
- `models/ai_call_log.py`：加 `schema_errors JSONB` + `compliance_flags JSONB` + `validation_warnings JSONB`
- `services/analysis_service.py`：主循环加两个 fail 分支
  - Parse ok 后跑 schema_guard → 失败也 skip 该 provider + 切 fallback
  - Schema ok 后跑 compliance + validator（不失败，只标记）
  - 最终落 `parsed_result` 用 model.model_dump()（已被模板改写过的合规版本）
- `api/ai_debug.py`：
  - `LogRowOut` 加 `compliance_hit_count / schema_error_count / validation_warning_count / needs_doctor_adjusted`
  - `LogDetailOut` 加 `schema_errors / compliance_flags / validation_warnings`

#### 关键设计决策

**1. 分级 schema（Q1=C）**
- 核心严格：`observation / overall_severity / skin_health_index / needs_doctor / acne_points / acne_types` 缺失或类型不可修复 → schema_failed → 切 fallback
- 边缘宽松：`regions / other_concerns / scars / status_counts` 缺失自动补默认值，未知枚举 fallback 到 unknown
- pydantic v2 `field_validator(mode="before")` 做类型强转（str→int / null→默认值）

**2. B4 模板兜底（Q2）**
- 违禁词命中 → **整字段丢弃**，服务端用模板重生成
- 模板举例：
  - `observation` 命中 → `"共观察到约 X 处皮损特征，主要分布于 Y。"`
  - `regions.{r}.note` 命中 → `"{中文区域}区域可见约 X 处皮损特征。"`
  - `other_concerns.{k}.description` 命中 → 按 severity 拼一句（如 `"该维度呈中度表现。"`）
- 违禁词库分三类：`DISEASE_WORDS`（26 个）/ `DRUG_WORDS`（24 个）/ `ACTION_PATTERNS`（7 个正则）
- 词库集中在 `compliance.py`，合规团队直接编辑列表即可
- 每次命中在 `compliance_flags` 落库：`{field, hits, action, original(前200字), replaced_with}` —— 保留原文用于审计但截断防止表膨胀

**3. needs_doctor 服务端强判（Q3=要）**
- 规则：`overall_severity>=7 OR nodule>0 OR cyst>0 OR broken>=3` → true
- 与 LLM 结果 OR 运算，宁可多提示不可少提示
- 服务端上调时 `validation_warnings.needs_doctor_adjusted=true`，记录原因

**4. schema 失败也切 fallback（用与 parse 相同的 skip_bindings）**
- 复用 3b+ 的 `skip_bindings` 机制，schema 失败也扔进去
- max_parse_retries=5 兜底防死循环

**5. 落库的 parsed_result 是"清洁版"**
- 不再落 LLM 原始 JSON，而是落经过 schema 修正 + 合规重写 + needs_doctor 校准的最终结果
- 想看原文？raw_response.text 仍完整保留
- 用户/前端拿到的永远是合规版本

**6. 老数据兼容**
- id=1~5 的记录 `schema_errors / compliance_flags / validation_warnings` 都是 NULL
- debug API 已处理 None case（compliance_hit_count=0）

#### 你需要操作什么

**1. 跑迁移**
```bash
alembic upgrade head
# Running upgrade 0005_reasoning_fields -> 0006_compliance_fields
```

**2. 重启 uvicorn**

**3. 触发一次分析（force=true）**
```bash
curl -X POST http://localhost:8000/analyses \
     -d '{"photo_id": <id>, "force": true}' -i
```

**4. Debug API 验证**

打开 /docs，看 `GET /ai/debug/logs?limit=5`，最新一条应该有：
- `schema_error_count: 0` （schema 都通过了）
- `compliance_hit_count: N` （0 表示没违规，>0 表示有词被拦下模板改写）
- `validation_warning_count: N`
- `needs_doctor_adjusted: bool`

点 `GET /ai/debug/logs/{id}` 看完整：
- `compliance_flags`：列出被替换的字段和命中的词
- `validation_warnings`：一致性问题 + needs_doctor 校准信息

**5. 端到端测试合规拦截**

想主动触发一次拦截，可以人工构造一次调用（假装 LLM 输出了违规内容）：

方式 A：直接调 `POST /ai/debug/invoke`（跳过 schema/compliance），看模型是否已经会自己不违规
方式 B：临时改 prompt 让 LLM 说"痤疮"，然后跑 /analyses 看 compliance_flags 是否命中

**6. DBeaver 里跑一句看统计**
```sql
-- 各字段被命中的频次
SELECT jsonb_array_elements(compliance_flags)->>'field' AS field,
       COUNT(*)
FROM ai_call_logs
WHERE compliance_flags IS NOT NULL
GROUP BY field
ORDER BY COUNT(*) DESC;

-- 最常见的命中词
SELECT jsonb_array_elements_text(
         jsonb_array_elements(compliance_flags)->'hits'
       ) AS hit_term,
       COUNT(*)
FROM ai_call_logs
WHERE compliance_flags IS NOT NULL
GROUP BY hit_term
ORDER BY COUNT(*) DESC LIMIT 20;
```

**7. 已知局限（不阻塞 MVP）**
- 违禁词库靠字面匹配，"痤 疮"（中间加空格）能绕过——生产建议改为 Aho-Corasick + 正则
- 模板生成的 description 缺少 LLM 观察到的细节（比如"鼻翼旁"这种精细位置）
- 违禁词库需要合规团队定期 review 更新

---

### Step 3d-pre — 痘颗→痘斑（Patch）建模换轨

#### 背景

用户发现"每颗痘单独定位"的设计在重度用户上崩塌：满脸融合成片时无法逐颗计数，跨日追踪无稳定坐标可匹配。

**建模换轨**：
- 主结构：`acne_patch`（一片区域，含 region + bbox + coverage + estimated_count + dominant_type + inflammation + severity + description），**必填**（可为空数组）
- 附加：`acne_point`（单颗痘，含精确定位），**只在轻度可枚举时输出**（<10 颗 且 全为 sparse）

#### 我做了什么

**文档改动**：
- `docs/skin_condition_labels.md`：加 1.4 章"Point vs Patch"，重写 5.1/5.2/5.3（v2 输出格式 + 展示适配 + patch-based 追踪），改 6.2（needs_doctor 加 confluent 触发规则）
- `project_background.md`：核心技术差异点段落改为"区域生命周期追踪 + 单颗痘追踪（轻度可选）"

**代码改动**：
- `schema.py`：新增 `AcnePatch` 类（10 字段，bbox 坐标钳位/coverage/inflammation 枚举校验）；`VisionAnalyzeResult.acne_patches` 必填，`acne_points` 改可选（默认空数组）
- `prompts.py`：升级到 `vision-2.0.0`，重写 system + user prompt 说明 patch-first 规则和 Point 输出条件
- `compliance.py`：
  - 加 `COVERAGE_ZH` / `INFLAMMATION_ZH` 中文映射
  - 加 `_tpl_patch_description`：命中违禁词时用 coverage/type/count/inflammation 拼合规描述
  - `apply_compliance` 主循环加对 `acne_patches[i].description` 的扫描
- `validators.py`：
  - 一致性检查从 `acne_types vs acne_points` 改为 `sum(patch.estimated_count) vs acne_types.total`（±30% 容差）
  - 新加 `point_output_violation` 规则（acne_points > 10 时警告）
  - `_compute_needs_doctor` 加 `任意 patch.coverage == "confluent"` 触发条件
  - `_needs_doctor_reasons` 追加 confluent_patches 原因

**没有 DB 迁移**：`analyses.parsed_result` 是 JSONB，schema 变化不需要 DDL；`ai_call_logs.request_payload.prompt_version` 会自动记为 `vision-2.0.0` 与老数据区分。

#### 关键设计决策

**1. Patch 必填、Point 条件输出**
- v1 用户不确定的问题："这颗痘和上次那颗是同一颗吗？"——重度用户根本没法回答
- v2 用 patch 做主体：即使 estimated_count 抖动，coverage 和 dominant_type 趋势稳定
- Point 只在轻度用户上激活，两条追踪路径并存

**2. bbox_norm 归一化到 [0,1]**
- 相对整张照片而非人脸框：MVP 阶段没有人脸对齐（Task #4 才做）
- 未来 Task #4 上线人脸对齐后，bbox 可以改为相对人脸区域，v3 prompt 升级即可
- 前端画高亮框只需 `img_width * x`

**3. coverage 四档 vs 连续值**
- `sparse/moderate/dense/confluent` 离散化——LLM 更容易稳定输出
- 连续 area_ratio 已经存在，需要更细粒度时可以从这里算

**4. needs_doctor 加 confluent 触发**
- 融合成片临床意义上就是重度信号，不管 severity 数字多少
- 服务端兜底代码里已加，`validation_warnings.reasons` 会记录 `confluent_patches=[p1, p3]`

**5. 一致性容差 ±30%**
- `estimated_count` 本身就是估算，尤其 confluent 情况下
- 强制严等于会频繁误报，反而让日志变噪
- 超过 ±30% 才 warn，代表模型确实自相矛盾

#### 你需要操作什么

**1. 清老数据（Q3=A）**

在 DBeaver 里跑：

```sql
-- 先看当前状态
SELECT COUNT(*) FROM analyses;
SELECT COUNT(*) FROM ai_call_logs;

-- 清 v1 的 analyses 记录（parsed_result 是旧结构）
DELETE FROM analyses;

-- 可选：ai_call_logs 保留（历史 prompt version 对比很有价值）
-- 如果非要清：DELETE FROM ai_call_logs;
```

**2. 重启 uvicorn**

不需要迁移，代码热重载。

**3. 端到端验证**

```bash
# 上传一张照片，force=true 触发真调
curl -X POST http://localhost:8000/analyses \
     -d '{"photo_id": <id>, "force": true}' -i
```

**期望现象**：
- 响应 `parsed_result` 里有 `acne_patches` 数组（可能为空）
- 轻度照片：`acne_points` 也有内容
- 重度照片：`acne_points: []`，`acne_patches` 里有 coverage>=dense 的项

**4. Debug API 检查**

`GET /ai/debug/logs?limit=5`：
- 最新一条 `parse_strategy` 应该是 direct 或 extracted
- `schema_error_count`=0 说明新 schema 通过
- `compliance_hit_count`>0 时说明 patch description 被兜底过

`GET /ai/debug/logs/{id}` 详情看 `parsed_result` 结构。

**5. DBeaver 里看 patch 数据**

```sql
-- 看最新一条 analyses 的 patches
SELECT parsed_result->'acne_patches' FROM analyses ORDER BY id DESC LIMIT 1;

-- 统计新旧 prompt 版本的分布
SELECT input_meta->>'prompt_version' AS version, COUNT(*)
FROM ai_call_logs GROUP BY version ORDER BY version DESC;
```

**6. 已知遗留**
- 前端展示逻辑（sparse→点标 vs dense→高亮框）在小程序阶段处理
- 跨日 patch 匹配算法（Task #6 的 vision.tracker）需要重写：从匈牙利算法+坐标改为 region+特征向量
- 未来 vision 模块（Task #4）上线人脸对齐后，bbox_norm 语义要更新

---

### Step 3d — POST /chat + 合规 + 医疗兜底

#### 我做了什么

**新增文件**：
- `models/chat_message.py`：ChatMessage ORM（问答对业务表）
- `db/migrations/versions/0007_chat_messages.py`
- `schemas/chat.py`：ChatRequest / ChatResponse / ChatMessageOut / ChatContext / ChatHistoryItem
- `services/chat_service.py`：核心业务（医疗兜底 → 拉上下文 → 组装 messages → gateway → 精确删句 → 落库）
- `api/chat.py`：`POST /chat` + `GET /chat/history`

**改造文件**：
- `services/ai_gateway/prompts.py`：加 `CHAT_QA_SYSTEM_PROMPT`（chat-1.0.0）+ `build_chat_context_message`
- `services/ai_gateway/compliance.py`：
  - 加 `MEDICAL_EMERGENCY_KEYWORDS`（20+ 医疗紧急词）+ `detect_medical_emergency`
  - 加 `apply_compliance_to_chat_text`：按中文断句切分，命中违禁词的句子整句删除
  - `MEDICAL_INTERVENTION_MESSAGE`：服务端预设的紧急就医提示文案
- `models/__init__.py`：注册 ChatMessage
- `main.py`：挂载 chat router

#### 关键设计决策（对应 Q1-Q5）

**Q1=B — 前端传上下文**
- `ChatRequest.context.latest_analysis_id`：前端根据当前页面主动传
- 后端拿到 ID 查 `analyses` 表 → `build_chat_context_message` 压缩成短摘要 → 作为额外 system message 注入
- 摘要只包含：observation + severity + skin_health_index + 前 5 个 patches + needs_doctor（防 token 爆炸）

**Q2=A — 单轮（history 可选透传）**
- `ChatRequest.history: list[ChatHistoryItem]` 前端维护多轮
- 服务端零状态，不建 chat_sessions 表
- 需要跨设备同步是 Task #7 之后的事

**Q3=C — 精确删句合规**
- 用 `(?<=[。！？；\.\!\?])\s*|\n+` 中文断句
- 每句独立扫违禁词（复用 vision 那套 DISEASE_WORDS/DRUG_WORDS/ACTION_PATTERNS）
- 命中即整句删，其他句保留 → 用户看到的是自然的短一点的回答
- 兜底：如果所有句子都被删了，返回"抱歉，这个问题涉及无法提供的医疗建议..."的通用回复
- `compliance_flags` 落库：`{field, hits, action:"drop_sentence", original, replaced_with:""}`

**Q4=B — chat_messages 业务表**
- 成功的问答对落 `chat_messages`（干净，前端历史查询用）
- 每次 provider 调用落 `ai_call_logs`（全量，`kind='chat_qa'`，含 fallback/失败）
- 关联：`chat_messages.ai_call_log_id → ai_call_logs.id`
- 医疗兜底的问答也落 `chat_messages`（`medical_intervention=true / provider='server'`），但不落 `ai_call_logs`（根本没调 LLM）

**Q5=B — 医疗关键词兜底**
- `detect_medical_emergency` 命中 → 直接返回 `MEDICAL_INTERVENTION_MESSAGE` 预设文案
- 不调 LLM，成本 0
- 关键词分四类：严重症状（流脓/剧痛/发烧等）、疑似严重疾病（癌/肿瘤）、感染扩散/败血症、特殊风险（怀孕/婴幼儿——涉及用药禁忌）
- 也会占额（防绕限流），落 `chat_messages.medical_intervention=true` 供审计

#### 复用 3b/3b+/3c 基础设施

- Gateway `chat_qa` 链（minimax → deepseek）现成，不改
- 每次 provider 落 `ai_call_logs`：复用 `invoke_detailed`
- trace_id + 结构化日志：复用 observability
- 限流：复用 `rate_limit.require(kind='chat')`
- 合规词库：复用 vision 的 DISEASE_WORDS/DRUG_WORDS/ACTION_PATTERNS

#### 你需要操作什么

**1. 跑迁移**
```bash
alembic upgrade head
# Running upgrade 0006_compliance_fields -> 0007_chat_messages
```

**2. 重启 uvicorn**

**3. 端到端验证**

**场景 A：普通护肤问答**
```bash
curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "T 区经常出油怎么办"}' -i
```
期望：assistant_message 给出成分级建议（如水杨酸/烟酰胺）；`medical_intervention: false`；X-Trace-Id 有值。

**场景 B：带上下文问答**
```bash
# 先做一次 analysis 拿到 analysis_id，然后：
curl -X POST http://localhost:8000/chat \
     -H "Content-Type: application/json" \
     -d '{"message": "我这个情况严重吗", "context": {"latest_analysis_id": 5}}'
```
期望：回答里能引用你的当前状态（"你右颊有一片中等密度..."）。

**场景 C：医疗紧急兜底**
```bash
curl -X POST http://localhost:8000/chat \
     -d '{"message": "我脸上流脓了怎么办"}'
```
期望：立即返回 `MEDICAL_INTERVENTION_MESSAGE` 全文；`medical_intervention: true`；`provider: "server"`。响应快（不调 LLM）。

**场景 D：多轮追问**
```bash
curl -X POST http://localhost:8000/chat \
     -d '{
       "message": "那两颊呢",
       "history": [
         {"role": "user", "content": "T 区油怎么办"},
         {"role": "assistant", "content": "..."}
       ]
     }'
```
期望：回答理解"两颊"是相对 T 区的追问。

**4. Debug API 检查**
- `GET /ai/debug/logs?kind=chat_qa&limit=5` 看 chat 调用记录
- 医疗兜底的场景**不会**出现在 ai_call_logs（因为没调 LLM）—— 只在 chat_messages 表里
- `GET /chat/history` 看问答历史

**5. DBeaver 里跑一句看统计**
```sql
-- 医疗兜底触发多少次
SELECT medical_intervention, COUNT(*) FROM chat_messages GROUP BY medical_intervention;

-- 合规删句触发多少次
SELECT jsonb_array_length(compliance_flags) AS dropped_sentences, COUNT(*)
FROM chat_messages WHERE compliance_flags IS NOT NULL
GROUP BY dropped_sentences;

-- 各 provider 分布
SELECT provider, COUNT(*) FROM chat_messages GROUP BY provider;
```

**6. 已知遗留**
- 医疗关键词是字面匹配，"化 脓"（加空格）能绕过——生产改 Aho-Corasick
- 中文断句用简单正则，遇到"..."、"—"等复杂标点可能切错——不阻塞 MVP
- 精确删句在极端情况下（每句都命中）会返回兜底提示，可能让用户感到"AI 拒答"

---

## Step 3 主线完成 ✅

- **3a** 限流 + dev 豁免
- **3b** POST /analyses + 双表 + 图片压缩
- **3b+** trace + 每次 provider 落库 + debug API
- **3b++** reasoning 分离 + parse_strategy
- **3c** schema_guard + 合规 + 模板兜底
- **3d-pre** 痘颗 → 痘斑建模换轨（v2.0.0）
- **3d** POST /chat + 医疗兜底 + 精确删句

**下一步方向**（按用户优先级选）：
- Task #4：vision 模块（MediaPipe 对齐 + 眼部打码 + 标注图渲染）
- Task #6：vision.tracker（跨日 patch 匹配）
- Task #7：趋势/日记/用药 + 小程序对接
- Task #8：合规收尾（免责声明 + checkNeedDoctor 前端提示）

---

### Step #6 — vision.tracker（跨日 patch lineage 追踪 + 趋势 API）

#### 我做了什么

**新增文件**：
- `models/patch_lineage.py`：PatchLineage（主线）+ PatchLineageSnapshot（每次分析的快照）
- `db/migrations/versions/0008_lineages.py`
- `services/vision/tracker.py`：匹配算法 + 生命周期状态迁移
- `schemas/lineage.py` + `schemas/trend.py`
- `api/lineages.py`：`GET /lineages` / `GET /lineages/{id}` / `GET /lineages/by-photo/{photo_id}`
- `api/trends.py`：`GET /trends/summary?days=N`

**改造文件**：
- `services/analysis_service.py`：analysis 落库后自动调用 tracker（try/except 包住，tracker 挂不影响 /analyses 200）
- `models/__init__.py`：注册两张新表
- `main.py`：挂载 lineages + trends router

#### 关键设计决策

**1. 一个 region 可有多条 lineage（Q1=B）**
- 右颊今天 2 个 patch → 一个匹配昨天已有 lineage，另一个新建
- 每条 lineage 是"一片持续存在的病灶群"
- 状态 active / dormant（1-14 天没出现）/ healed（>14 天没出现，不再自动接续）

**2. 只做 patch lineage，point 不追踪（Q2=A）**
- point 是"轻度可枚举"的锦上添花，产品价值主要在 patch
- MVP 阶段减少一半工作量
- 未来把 point 当 sparse+1颗的特殊 patch 统一处理即可

**3. 简单匹配算法（Q3=A）**
- 同 region 内 bbox 中心欧氏距离最小的作为候选
- 距离 <= 0.25（归一化后约占面部宽度 25%）→ 匹配
- 否则新建 lineage
- 每条 lineage 一次分析最多匹配一次
- 匹配元信息落 `match_info` JSONB（distance / threshold / reason）供排障

**4. Tracker 挂在 analysis_service 内联跑，不异步**
- MVP 阶段一次分析已经 5-10s，再多 100ms 追踪无所谓
- 失败被 try/except 兜住 → analysis 依然成功返回

**5. 冗余字段设计**
- Snapshot 冗余存 bbox/coverage/type/count/severity
- 避免每次读 lineage 都要 join analyses 表抽 JSONB

**6. 趋势 API 合并两条数据源**
- Analyses → 皮肤指数曲线 + severity 趋势 + 每日总痘数
- Lineages → 活跃/新增/消退区域数 + 分区域摘要
- Highlights 用规则生成人话洞察

#### 你需要操作什么

**1. 跑迁移**
```bash
alembic upgrade head
# Running upgrade 0007_chat_messages -> 0008_lineages
```

**2. 重启 uvicorn**

**3. 验证追踪能力（同照片两次 force=true 分析模拟跨日）**

```bash
curl -X POST http://localhost:8000/analyses -d '{"photo_id": <id>, "force": true}'
curl -X POST http://localhost:8000/analyses -d '{"photo_id": <id>, "force": true}'
curl http://localhost:8000/lineages
# 每个 patch 应该有 2 个 snapshot
```

**4. Debug API**

```bash
curl http://localhost:8000/lineages                        # 列所有
curl "http://localhost:8000/lineages?status=active"        # 筛选
curl "http://localhost:8000/lineages?region=right_cheek"
curl http://localhost:8000/lineages/1                      # 详情 + 时间线
curl http://localhost:8000/lineages/by-photo/<photo_id>
curl "http://localhost:8000/trends/summary?days=30"
```

**5. DBeaver 检查数据**

```sql
SELECT id, region, status, first_seen_at, last_seen_at, snapshot_count
FROM patch_lineages ORDER BY id;

SELECT lineage_id, region, coverage, dominant_type,
       estimated_count, severity, match_info, created_at
FROM patch_lineage_snapshots ORDER BY lineage_id, created_at;

SELECT region, status, COUNT(*) FROM patch_lineages
GROUP BY region, status;
```

**6. 已知遗留 / 未做**
- 每条 lineage 一次分析只能匹配一次；如果两个 patch 都很靠近旧 lineage，只有一个能匹配上 —— 未来上匈牙利分配
- healed 判定用 last_seen_at 时间近似；实际上"用户没拍照" vs "拍了但这个 lineage 没出现"没区分
- 只考虑近 14 天候选；长期用户"两个月前老痘印又发炎"的边缘 case 不 care
- Point 追踪未做（Q2=A）

#### MVP 主线进度更新

到此**后端 API 层面** 5 大 MVP 功能：
- ✅ 拍照记录
- ✅ AI 分析（含跨日追踪 = 护城河）
- ✅ 趋势追踪（`GET /trends/summary`）
- ❌ 痘痘日记（还没做）
- ✅ AI 问答

**剩余后端**：只有痘痘日记未做
**剩余前端**：全部（微信小程序未开始）
**剩余合规**：Task #8 收尾







---

### Step #6 hardening — tracker / trends 稳定性收口

#### 我做了什么

- 修复同一次分析里两个相近新 patch 误共用一条 lineage 的问题。
- 修复 analyses / lineages 的 by-photo 静态路由被动态 ID 路由拦截的问题。
- 空 patch 分析也会推进 dormant / healed 生命周期。
- tracker 异常时显式 rollback，避免污染后续数据库会话。
- tracker、lineage、trend 全链路加入 `view_type`，正面、左侧、右侧不再互相误匹配。
- 趋势区域按“视角 + 面部区域”分组并输出中文视角标签。
- 清理 Ruff 问题并建立首批回归测试。

#### 关键设计决策

- 三个视角使用独立 lineage 空间；同名 region 只有在同视角内才允许匹配。
- 旧照片和旧 lineage 统一标记为 `legacy`，不破坏已有数据。
- tracker 仍是分析后的附属能力；失败记录日志，但分析结果本身保留。

#### 你需要操作什么

（已完成。Ruff 全绿，相关测试已纳入完整测试集。）

---

### Step #7a — 三视角 check-in 基础流程

#### 我做了什么

- 新增 `check_ins` 模型、schema 和 API：创建、列表、详情、完成。
- `standard` 打卡完成前必须包含 `front / left / right`；`quick` 暂不强制照片，为日记入口预留。
- 照片上传支持 `check_in_id + view_type`，同一草稿内同视角重拍会软删除旧照片。
- 照片新增 `quality_status / quality_meta / processed_storage_key`，为下一步质量检测、对齐图预留。
- 新增迁移 `0009_check_ins` 并已在本地 PostgreSQL 成功升级。
- 新增 check-in 与路由测试；当前共 13 个测试通过。

#### 关键设计决策

- “一次记录”作为一等实体，避免把三张照片当成三个互不相关的日记录。
- 标准记录固定三视角，保证后续跨日趋势比较的是同角度照片。
- 兼容旧版单照片上传：不传 check-in 参数时仍按原流程工作。
- 当前只建立质量状态接口，不假装已完成姿态、光照和清晰度检测。

#### 你需要操作什么

- 准备 3–5 组仅用于本地开发的正面、左侧、右侧照片；最好包含一次角度或光线明显不合格的样本。
- 不需要手工迁移数据库；本地库当前已是 `0009_check_ins (head)`。
- 下一开发步：实现拍照质量门槛与标准化对齐，再接痘痘日记字段。
---

## 2026-07-13 — 文档与自主开发记录规则整理 — ✅ 已完成

### 本次完成

- 将 `docs/temp_step.md` 中的初始项目路线图合并到本文件开头。
- 将 `docs/dev_notes.md` 中遗漏的 Step 1 初始化命令、项目目录说明、健康检查验证和 Step 2 上传/签名 URL 验证流程补回对应章节。
- 将 `CLAUDE.md` 改为以本文件作为唯一开发进度来源，并规定每个可验证里程碑完成后立即记录。

### 验证情况

- 已检查 `CLAUDE.md`、本文件开头及 Step 1/Step 2 章节。
- 本次只修改文档规则和开发日志，没有运行代码测试。

### 当前阻塞或遗留

- 无。
- `docs/dev_notes.md` 和 `docs/temp_step.md` 保留为历史/补充文档，不再作为最新进度来源。

### 下一步

- 下一次自主开发开始前读取 `project_background.md`、本文件和 `CLAUDE.md`。
- 完成每个独立可验证里程碑后，立即在本文件追加记录。
---

## 2026-07-13 — Step 1/2/3a 文档完整性补充 — ✅ 已完成

### 本次完成

- 依照 `docs/dev_notes.md` 补全 Step 1 的项目结构、PostgreSQL 初始化和健康检查上下文。
- 补全 Step 2 的 ORM 模型、存储抽象、配置、迁移、签名规则、Pillow 校验和上传验证流程。
- 补全 Step 3a 的文件清单、原子限流机制、dev 豁免、真实限流测试和操作步骤。

### 验证情况

- 已逐项对照 `docs/dev_notes.md` 的 Step 1、Step 2、Step 3a 章节。
- 已检查补充内容的章节顺序和 Markdown 结构。
- 本次只修改日志文档，没有运行代码测试。

### 当前阻塞或遗留

- 无。

### 下一步

- 后续开发继续只在本文件追加每个可验证里程碑的完整记录。
---

## 2026-07-14 — Step #7b 拍照质量门槛与几何标准化 — ✅ 已完成

### 本次完成

- 新增 `app/services/vision/quality.py`：使用本地 MediaPipe Face Landmarker 检查分辨率、清晰度、光照、完整人脸、多人脸、头部倾斜及 front/left/right 视角。
- `POST /photos` 在标准 check-in 上传时执行质量门槛；失败返回 422、错误码、中文重拍提示和可排障指标，失败照片不进入存储与数据库。
- 新增 `app/services/vision/normalization.py`：合格照片保留原图，同时生成 `1024×1280` JPEG 几何标准化副本；不美白、不调色、不锐化、不修改皮肤内容。
- `photos.processed_storage_key` 正式启用；AI 分析优先读取标准化副本，旧照片仍回退到原图。
- EXIF 方向在上传尺寸读取和 LLM 图片准备阶段统一纠正。
- 新增 `scripts/download_face_landmarker.ps1`，固定官方模型 URL 和 SHA256；`backend/model_assets/` 已加入 Git 忽略。
- 应用退出时关闭缓存的 Face Landmarker，释放本地模型资源。

### 验证情况

- 私有样本校准：`set01/front.jpg`、`left.jpg`、`right.jpg` 分别按 front/left/right 全部通过。
- `set02` 与 `set03` 共 6 张下半脸、裁切或不完整构图样本全部被拒绝；原因覆盖 `image_blurry`、`face_cut_off`、`face_not_detected`。
- 已目视检查三张标准化输出：额头、两颊和下巴保留，左右侧没有镜像，输出尺寸均为 `1024×1280`。
- Ruff：全绿。
- Pytest：20 passed，1 条既有 Starlette/httpx2 弃用警告。
- 模型下载脚本已通过 PowerShell 语法解析；本地模型 SHA256 为 `64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF`。

### 当前阻塞或遗留

- MediaPipe 官方说明输入图片在设备本地处理、不会发送到 Google，但 Tasks API 会发送性能和使用指标。当前受限环境中的遥测连接失败；生产上线前需在隐私政策中披露，或将预处理进程部署到禁止外连的网络环境。官方说明：https://github.com/google-ai-edge/mediapipe#privacy-notice
- 当前完成的是后端拍后校验；微信小程序相机中的实时参考框和即时姿态提示尚未实现。
- 眼部遮盖尚未实现；需要在不遮挡眼周皮肤观察区域的前提下单独设计。

### 下一步

- 设计并实现痘痘日记字段，使 quick/standard check-in 都能记录睡眠、压力、饮食、经期和护肤变化。
- 随后按 check-in 而不是单张照片聚合三视角分析和趋势，避免同日多图重复计数。
- 用户当前无需操作；若在新环境重新拉取项目，运行 `backend/scripts/download_face_landmarker.ps1`。

---

## 2026-07-14 — Step #7c 痘痘日记字段与接口 — ✅ 已完成

### 本次完成

- `check_ins` 新增 `diary_data JSONB` 和 `diary_updated_at`，日记与 quick/standard check-in 一对一关联。
- 新增结构化日记 schema，覆盖睡眠时长与质量、压力等级、经期阶段、饮食标签、护肤变化、新护肤品、用户主动填写的外用产品及备注。
- 数值范围、枚举、字符串长度、额外字段均由 Pydantic 严格校验；标签和产品名称会去重，产品名称会去除首尾空白。
- `POST /check-ins` 支持可选 `diary`；新增 `PUT /check-ins/{id}/diary` 完整替换接口，传空对象可清空日记。
- 已完成的 check-in 仍允许修正日记，但不会改变照片、完成状态或完成时间。
- `CheckInOut`、列表和详情接口统一返回 `diary` 与 `diary_updated_at`。
- 新增迁移 `0010_check_in_diary`，包含 JSONB 对象类型数据库约束，并已在本地 PostgreSQL 从 `0009_check_ins` 升级至 head。
- README 和项目状态已同步更新。

### 验证情况

- 日记与 OpenAPI 针对性测试：10 passed。
- 完整回归：24 passed；仅保留 1 条既有 Starlette/httpx2 弃用警告。
- Ruff 全量静态检查通过；本次涉及的 Python 文件已通过 Ruff format。
- Alembic：升级前为 `0009_check_ins`，升级后为 `0010_check_in_diary (head)`。
- 数据库反射确认 `diary_data JSONB`、`diary_updated_at` 和 `ck_check_ins_diary_data_object` 均已创建。
- 真实 FastAPI + PostgreSQL 往返通过：创建 quick check-in 并写日记、完整替换日记、完成 check-in、完成后修正日记；临时记录已清理。

### 当前阻塞或遗留

- 本子步骤无阻塞。
- 当前仅完成日记采集与持久化，尚未把三视角分析和日记按 check-in 聚合，也尚未生成生活因素关联提示。

### 下一步

- 按 check-in 聚合 front/left/right 三视角分析，定义单次记录的皮肤指数、严重度、数量和就医提示合并规则。
- 将趋势 API 从按单张照片统计收口为按 check-in 统计，避免同一天三张照片被重复计数。
- 聚合稳定后开始微信小程序相机参考框、日记表单和趋势页面。

---

## 2026-07-14 — Step #7d 三视角分析聚合与趋势收口 — ✅ 已完成

### 本次完成

- 新增 `app/services/check_in_aggregation.py`，批量读取 check-in 有效照片的最新成功分析，避免 force 重跑记录重复参与统计。
- 新增 `GET /check-ins/{id}/analysis-summary`，返回 `empty / partial / ready`、缺失照片视角、缺失分析视角、分视角明细及聚合指标。
- 聚合规则固定为：整体严重度取最高值、皮肤指数取平均值、`needs_doctor` 做 OR；每个视角先按 region 累加 patch 数量，再对重叠视角的同一 region 取最大值。
- 聚合响应同时返回日记数据，为后续生活因素关联提供同一 check-in 上下文。
- `GET /trends/summary` 改为只使用已完成且聚合为 `ready` 的 check-in；同一天只选一条并优先 standard，避免三张照片或多次记录形成重复曲线点。
- 趋势响应新增 `source / check_in_id / total_check_ins / incomplete_check_ins / superseded_check_ins / total_legacy_records`，前端可以区分聚合记录、旧数据和不完整记录。
- 保留旧版无 check-in 照片：记录日期优先取 `taken_at`，否则取照片创建时间；同一照片多次分析只取最新成功结果，同一天旧照片只保留最新一张。
- 本步骤采用读取时聚合，没有新增数据库表或迁移；数据库 head 仍为 `0010_check_in_diary`。
- README 和项目状态已同步更新。

### 验证情况

- 新增三视角区域去重、严重度/指数/就医提示合并、缺失分析视角、旧结构计数回退和同日 standard 优先测试。
- 聚合、趋势与 OpenAPI 针对性测试：17 passed。
- 完整回归：28 passed；仅保留 1 条既有 Starlette/httpx2 弃用警告。
- Ruff 全量静态检查通过；本次涉及的 8 个 Python 文件已通过 Ruff format 检查。
- 真实 FastAPI + PostgreSQL 往返通过：临时写入一个完整三视角 check-in 和三条分析，聚合结果为严重度 5、皮肤指数 70、区域去重总数 15、`needs_doctor=true`；`days=1` 趋势只生成一个 check-in 点并计入 3 条底层视角分析。
- 上述临时 check-in、3 张照片和 3 条分析均已精确清理。
- 现有旧数据验证：同一旧照片的两次分析在趋势中只保留最新一条，`total_analyses` 从重复的 2 收口为 1。

### 当前阻塞或遗留

- 本子步骤无阻塞。
- `jaw / temple` 当前 region 标签没有左右侧语义；跨视角取最大值能稳定避免重复，但可能低估左右两侧同时存在的独立数量。需要更精确时应先升级视觉 schema，而不是在聚合层猜测。
- 当前聚合为读取时计算，适合 MVP 数据规模；数据量明显增长后再评估物化汇总表或缓存。
- 微信小程序尚未开始，用户还不能从前端完成拍摄、日记、分析与趋势闭环。

### 下一步

- 创建微信原生小程序工程骨架和 API client，先跑通开发环境连接。
- 实现首页、standard/quick check-in 流程、三视角相机参考框、日记表单和聚合结果页。
- 接入趋势页面，并对 `partial / incomplete / superseded / legacy` 状态提供用户可理解的提示。

---

## 2026-07-15 — Step #6 correctness：Check-in 感知的生命周期收口 — ✅ 已完成

### 本次完成

- 将 lineage 从“按服务器时间自动老化”改为“由同视角有效照片的观察证据推进”。
- 新增 `patch_lineage_observations`，逐条记录 `present / missing`、观察日期、check-in、照片、分析、是否推进状态及原因。
- `patch_lineages` 新增首次出现日、最后出现日、最后观察日、最后出现 check-in、连续缺失次数和状态原因；snapshot 新增 `check_in_id / observed_on`。
- `photos` 新增 tracker 分析标记和时间；同一照片即使强制重分析，也只允许推进一次。
- 完成状态机：`present → active`；第一次有效 `missing → dormant`；至少连续两次有效 missing 且距最后 present 满 14 天才 `healed`。
- 没上传、缺少该视角、check-in 尚未完成或分析尚未成功时不生成 missing，也不改变 lineage。
- 移除固定 14 天匹配窗口：中间没有观察时，相隔超过 14 天仍可按 region + bbox 继续尚未 healed 的原链。
- 草稿照片先分析时延迟追踪；check-in 完成时原子处理已有分析。check-in 完成后才分析的照片会在分析成功后立即追踪。
- 新增 `GET /lineages/by-check-in/{check_in_id}`；lineage 详情返回观察证据时间线，列表和趋势改用观察日期排序与统计。
- 新增迁移 `0011_check_in_lineages`。历史 snapshot 回填为 present；旧墙上时间推导的 dormant/healed 不继承，统一按最后一张历史照片恢复为 active；已有成功分析照片做幂等标记，历史草稿 check-in 保留完成时首次追踪能力。

### 关键设计决策

- “用户没拍”是没有观察，不等于病灶消失；只有同一视角、质量通过且分析成功的照片才能提供 missing 证据。
- front / left / right 的 lineage 空间继续隔离，某次 check-in 缺少 right 时不会影响 right lineage。
- 同一观察日不会重复累计 missing；历史日期的迟到分析保留审计记录，但不倒推当前状态。
- 尚未 healed 的同位置病灶可以跨长时间无照片间隔接续；一旦由重复缺失证据 healed，后续相似病灶新建 lineage。
- check-in 完成与已有分析的生命周期写入放在同一事务；失败会回滚完成状态，允许客户端重试。

### 验证情况

- Alembic 已从 `0010_check_in_diary` 升级到 `0011_check_in_lineages (head)`，并完成一次 downgrade → upgrade 往返。
- 数据库反射确认 observation 表、日期字段、照片幂等字段、外键、索引和 `lineage_id + photo_id` 唯一约束均存在。
- 真实 PostgreSQL 链路通过：6 月 1 日 right present 为 active；6 月 10 日只有 front 照片时 right 仍 active；随后 right 首次 missing 为 dormant；6 月 20 日第二次 missing 后为 healed。
- 上述链路生成且仅生成 `present / missing / missing` 三条证据；同一照片重分析返回 `photo_already_tracked`，观察数不增加。
- 真实 FastAPI 验证 `GET /lineages/{id}` 与 `GET /lineages/by-check-in/{id}` 均返回正确状态和时间线；临时 check-in、照片、分析、snapshot、observation 和 lineage 已精确清理。
- 完整回归：33 passed；仅保留 1 条既有 Starlette/httpx2 弃用警告。
- Ruff 全量静态检查通过，Git diff whitespace 检查通过。

### 当前阻塞或遗留

- 当前仍是 region + bbox 中心距离的贪心匹配；病灶密集、合并或分裂时可能发生身份交换，后续可升级为全局分配与更稳定的视觉特征。
- 同日多次 check-in 会保留审计记录，但只有向前的观察日累计 missing；产品层仍应引导每天完成一个主 check-in。
- 微信小程序尚未展示生命周期链，也没有周期提醒、局部区域对照 UI。

### 下一步

- 创建微信原生小程序骨架，先接入 check-in、三视角拍摄、日记、分析聚合和趋势页面。
- 在结果页加入按 check-in 查询的区域生命周期入口，并用用户可理解的文案区分“仍可见、一次未见、连续未见”。
- 用户当前无需操作；其他环境部署时运行 `alembic upgrade head`。

---

## 2026-07-16 — Step #8a App 后端基础化：账号、隔离、协议与幂等 — ✅ 已完成

### 本次完成

- 按 `docs/platform_strategy.md` 将客户端主线从微信小程序切换为独立 App；现有 check-in、分析、趋势和生命周期领域模型保持复用。
- 新增 `user_identities`：`users.id` 继续作为平台无关数据主体，原 `users.wx_openid` 回填为 `provider=wechat` 的可选身份来源后从用户主表移除。
- 内测第一登录方式采用邮箱 + 密码；新增注册、登录、Refresh Token 轮换、当前会话登出和 `GET /me`。
- 密码使用 PBKDF2-HMAC-SHA256、随机盐和 600,000 次迭代；Access/Refresh Token 使用高熵随机值，数据库只保存 SHA-256 哈希。
- 新增 `auth_sessions`，Access Token 默认 15 分钟、Refresh Token 默认 30 天；刷新会同时轮换两种 Token，旧 Token 立即失效，登出可即时撤销会话。
- 新增 `user_consents` 及 `GET/PUT /api/v1/me/consents`，版本化记录用户协议、隐私政策、健康免责声明和 AI 数据处理说明；未接受当前版本时业务接口返回 403。
- 新增 `DELETE /api/v1/me`：再次验证密码后删除用户，依靠外键级联清理业务数据，并清理本地存储中的原图和标准化照片。
- 所有业务 API 统一迁移到 `/api/v1`；照片、check-in、分析、问答、趋势和 lineage 全部改为从 Bearer Token 读取当前用户并校验资源归属，跨用户 ID 统一返回 404。
- 移除固定 `SEED_USER_ID=1` 服务。AI 调试路由只在 `APP_ENV=dev` 挂载；CORS 改为显式白名单，原生 App 默认无需 CORS。
- check-in 和照片新增用户级 `client_request_id UUID` 与部分唯一索引；顺序重试和并发重试都会返回第一条记录。重复完成 check-in 也改为直接返回当前结果。
- 新增迁移 `0012_app_foundation`，包含身份、会话、协议、幂等字段与索引；迁移同时同步历史显式 `users.id=1` 导致的 PostgreSQL 自增序列偏移。
- 修复空日记的旧问题：`CheckIn.diary_data` 使用 `JSONB(none_as_null=True)`，确保 Python `None` 写为 SQL NULL，而不是违反对象约束的 JSON `null`。
- `.env.example`、README、项目背景和平台策略已同步 App 认证、`/api/v1`、协议版本及当前限制。

### 关键设计决策

- 第一阶段只做邮箱密码，避免在 20～50 人内测前引入短信供应商；`user_identities` 保留未来增加手机号、微信或 Apple 身份的空间。
- 使用数据库支持的 opaque session，而不是自行实现 JWT；因此会话可以立即撤销，适合涉及皮肤照片和健康相关信息的产品。
- 登录成功不等于允许处理皮肤数据；协议接口可在未接受状态下访问，其余业务统一通过协议门槛依赖。
- App 弱网幂等使用客户端生成 UUID，而不是依赖请求到达时间；唯一性限定在用户范围内。
- 本步骤不引入新第三方依赖，不改变 AI 分析、趋势聚合或生命周期算法。

### 验证情况

- Alembic `0011_check_in_lineages → 0012_app_foundation` 升级成功，并完成一次 `downgrade 0011 → upgrade head` 往返；当前数据库为 `0012_app_foundation (head)`。
- 数据库反射确认 `user_identities / auth_sessions / user_consents`、用户级幂等 UUID 字段和两个部分唯一索引均存在；`users.wx_openid` 已移除。
- 真实 FastAPI + PostgreSQL 双用户链路通过：
  - 注册后未接受协议时创建 check-in 返回 403，接受四项当前版本协议后成功；
  - 相同 UUID 两次创建 check-in、两次上传照片均返回同一资源；
  - 用户 B 访问用户 A 的 check-in 和照片 URL 均返回 404；
  - Refresh Token 轮换后旧 Access/Refresh Token 都失效，登出后新 Access Token 失效；
  - 账号注销后身份、check-in、照片数据库记录及实际照片文件全部删除。
- 上述测试账号、会话、协议、check-in、照片和文件均已清理，数据库只保留原开发用户数据。
- 完整回归：42 passed；仅保留 1 条既有 Starlette/httpx2 弃用警告。
- Ruff 全量静态检查通过；Git diff whitespace 检查通过。

### 当前阻塞或遗留

- 内测邮箱尚未做真实性验证，也没有找回密码；公开注册前需要邮件服务或改为手机号验证码。
- 登录接口尚未增加 IP/账号级防爆破和邀请白名单；`AUTH_REGISTRATION_ENABLED` 可在不开放注册时关闭。
- 当前仍使用本地文件存储和同步 AI 分析；公开测试前应接 COS/S3，弱网体验不足时再引入异步分析任务。
- App 技术栈尚未最终选择，客户端工程尚未创建。

### 下一步

- 在 Flutter、React Native/Expo 中确定一种跨平台方案，创建 App 工程骨架和安全 Token 存储。
- 先联调注册/登录、首次协议和 Token 刷新，再跑通 check-in → 三视角拍照 → 分析 → 日记 → 趋势/生命周期。
- 其他环境拉取代码后需要运行 `alembic upgrade head`；现有未版本化业务 URL 已迁移为 `/api/v1`。

---

## 2026-07-16 — MVP 客户端平台策略 — ✅ 已完成

### 本次完成

- 评估 MVP 阶段使用微信小程序还是 App。
- 确定直接以 App 作为主产品进行 MVP 内测和首次上线准备。
- 确定小程序作为后续获客和低门槛入口，而不是先做小程序再迁移 App。
- 将完整分析记录到 `docs/platform_strategy.md`。

### 关键决策

- 先做 App MVP，范围聚焦注册、三视角拍照、AI 分析、日记和趋势闭环。
- 先进行 20～50 人小范围内测，验证 7～14 天行为，再公开上架。
- 后端用户 ID、照片、check-in、日记、分析和趋势数据保持客户端无关，避免未来平台迁移。

### 当前阻塞或遗留

- App 技术栈尚未确定。
- 真实用户体系、App 前端和上线备案仍未实现。

### 下一步

- 设计 App MVP 信息架构和首条用户主流程。
- 评估 Flutter、React Native 或 Expo，并创建客户端工程骨架。

---

## 2026-07-20 — App 前端设计与实现工作流 — ✅ 已完成

### 本次完成

- 在 `design/prompts/UI/前端设计与实现工作流_2026-07-20.md` 记录 App 从技术选型、视觉方向、Figma 设计系统、关键页面、用户验证到客户端实现和真机内测的完整顺序。
- 明确以 Figma 为设计真源，优先验证登录/协议、三视角拍照、聚合结果和趋势四类关键页面，再分段实现业务闭环。
- 记录现有 Figma、图像生成及平台 MCP 的职责边界，并加入合规、照片隐私、无障碍和完成定义。
- 实时核对 OpenAI curated Skills 清单和 Git 仓库；`frontend-skill` 当前不存在于可安装目录，因此未用搜索缓存或第三方副本替代安装。

### 验证情况

- 已检查目标文档路径位于现有 `design/prompts/UI/` 目录。
- 已核对工作流覆盖当前后端 `/api/v1`、协议门槛、三视角 check-in、分析聚合、趋势与生命周期能力。
- `frontend-skill` 通过官方安装脚本的 download 与 git 两种模式验证，均返回官方仓库中不存在该 Skill 路径；实时 curated 列表也未列出该名称。
- 本次仅新增 Markdown 文档并追加开发日志，不涉及代码、数据库迁移或依赖变更，因此未运行后端测试。

### 当前阻塞或遗留

- App 技术栈尚未确定，Figma 设计文件和客户端工程尚未创建。
- `frontend-skill` 暂时无法从 OpenAI 官方 curated 仓库安装；后续需等待官方恢复或另行确认可信来源。

### 下一步

- 比较 Flutter 与 React Native/Expo 并确定客户端技术栈。
- 基于市场配色调研提出 2～3 个视觉方向，在用户确认后建立 Figma 最小设计系统和四个关键页面。
- 若用户希望采用非官方审美 Skill，应先审查来源和完整内容，再单独决定是否安装。

---

## 2026-07-20 — Step #9a 补充：Expo 客户端骨架与账号闭环 — 🚧 进行中

### 本次完成

- 校准中断会话后的真实进度：客户端技术栈已经确定为 React Native + Expo SDK 57，Expo 工程骨架已经创建，不再处于 Flutter / React Native 待选型阶段。
- 确认当前未提交客户端实现覆盖登录、注册、Access/Refresh Token 会话恢复与轮换、Refresh Token 安全存储、首次四项协议确认、受保护路由、基础组件和占位首页。
- 更新 project_background.md、backend/README.md、docs/platform_strategy.md 和前端设计工作流，使当前阶段与下一步和真实代码一致。
- 为 docs/init_prompt.md、docs/idea.md、docs/dev_notes.md、docs/temp_step.md 和 CV 调研文档增加历史归档或状态说明；保留原文，不再让早期微信小程序方案被误认为当前决策。

### 验证情况

- 客户端 TypeScript 类型检查通过。
- ESLint 无缓存检查通过；git diff --check 通过。
- 默认 npm run lint 在当前环境因无法创建 .expo/cache/eslint 而中止，未发现对应源码 lint 错误。
- 全局检索当前状态文档，未再发现“技术栈待定”“客户端尚未创建”或要求创建微信小程序工程等过期现行表述。
- docs/idea.md 和 docs/temp_step.md 的历史正文已与当前 HEAD 原文逐字符归一化比对，确认完整保留。
- 本次只修改 Markdown 文档，未改业务代码、数据库或依赖，因此未重新运行后端测试。

### 当前阻塞或遗留

- 账号与协议闭环尚未在真实设备或模拟器上完成前后端端到端联调，不能标记为已完成。
- check-in、三视角拍照、质量反馈、AI 分析、日记、趋势和生命周期页面尚未接入。

### 下一步

- 在真实设备或模拟器上联调注册、登录、首次协议、Token 刷新和登出。
- 联调通过后完成 Step #9a 的测试与日志收口。
- 随后进入 check-in → 三视角拍照 → 分析 → 日记 → 趋势/生命周期的首条完整用户路径。
---

## 2026-07-20 — UI 市场配色调研样本扩展 — ✅ 已完成

### 本次完成

- 将 `design/prompts/UI/市场配色调研_2026-07-17.md` 的日韩和中国样本均从 4 款扩展至 10 款，两个地区合计 20 款。
- 新增日韩样本：Olive Young、GangnamUnni、UNPA、Powder Room、NOIN、美事；新增中国样本：肌肤秘诀、肌肤管家、成分喵、小红书、美图秀秀、肌肤之境。
- 为每款新增样本补充主色、辅助色、Accent 色的 HEX、RGB、HSL 值、产品定位、视觉特征和公开官网或商店核实链接；相邻样本已明确标注。

### 验证情况

- 已逐项核对调研表，日韩与中国均为 10 款，且新增行均含颜色数值和至少一条公开来源链接。
- 使用公开 App Store 图标或品牌/商店物料完成取色；实体色统一按 `α=1.00` 记录。
- 本次仅更新 Markdown 调研档案与进度日志，不涉及代码、数据库迁移或依赖变更，未运行后端测试。

### 当前阻塞或遗留

- 无。

### 下一步

- 与用户共同对日韩和中国样本进行色相、明度、饱和度、色彩组合与视觉语气分析，再形成候选配色方向；本阶段暂不直接定案。
---

## 2026-07-20 — Figma 市场配色研究板创建 — ⏸ 阻塞

### 本次完成

- 已在 Figma 创建 `Skin Care Agent · 市场配色研究板` 设计文件，并初始化本地颜色变量集合 `Market Color Research`。
- 已建立研究板容器及背景、中性色、市场色彩簇与候选方向色变量，为后续色卡和候选页面预览提供可编辑基础。

### 验证情况

- Figma 成功返回新文件 key `u9LCCOXGFvJl37jBdLXj6W` 与文件链接。
- 写入第一个标题区时，Figma MCP 明确返回 Starter 计划调用额度已达上限；该失败操作为原子失败，未写入标题区内容。

### 当前阻塞或遗留

- Figma Starter 计划的 MCP 调用额度已用尽；需要升级计划或等待额度恢复，才能继续写入日韩/中国色卡、色彩簇和候选试验区。

### 下一步

- 用户恢复 Figma MCP 可用额度后，继续在现有文件中逐段完成研究板并进行截图核验。
- 若不恢复额度，可改为在仓库中生成静态 SVG/PNG 配色研究板供讨论，但不具备 Figma 的原生可编辑性。
---

## 2026-07-20 — Step #9a 验证补充：账号与协议闭环 — 🚧 进行中

### 本次完成

- 按 mobile/AGENTS.md 核对 Expo SDK 57 官方 SecureStore、Protected Routes 和测试文档，三个官方页面均可访问。
- 审计本机运行环境：PostgreSQL 16 正常运行，数据库迁移为 0012_app_foundation；本机没有 Android SDK、adb、Android Emulator 或 Android Studio，Windows 环境也无法提供 iOS Simulator。
- 完成 Expo Web 生产导出，静态路由包含 index、login、register、consents 和 home。
- 使用 FastAPI TestClient 连接真实 PostgreSQL 跑通注册、未同意协议时业务接口 403、四项协议接受、Access/Refresh Token 同时轮换、旧 Token 失效、新 Token 可用、登出、重新登录、协议状态保留和账号注销。
- 测试账号已经通过 DELETE /api/v1/me 注销；注销后再次登录返回 401，没有遗留测试用户。

### 验证情况

- 后端完整回归：42 passed，保留 1 条既有 Starlette/httpx2 弃用警告。
- 客户端 TypeScript 类型检查通过。
- 客户端 ESLint 无缓存检查通过。
- Expo Web production export 通过，生成 7 个静态路由和约 1.2 MB Web bundle。
- 真实 PostgreSQL 契约 smoke 全部通过：register=201、consent gate=403、refresh=200、旧 Access/Refresh=401、logout=204、账号清理=204。
- Edge/Chrome Headless 在当前执行器中无法可靠等待 GUI 子进程，未获得浏览器 DOM 运行时证据；相关 4173/4174 静态服务已停止，本轮启动的两个无窗口 Edge 进程已精确终止。

### 当前阻塞或遗留

- Step #9a 尚未在 Android 或 iOS 真实设备/模拟器中操作验证，因此不能标记为已完成。
- 当前项目未安装 Jest、jest-expo、React Native Testing Library 或 react-test-renderer；遵循“不擅自安装依赖”，本轮未补 UI 自动化测试依赖。
- 本机缺少 Android 开发环境；iOS 模拟器验证需要 macOS，iOS 真机验证需要可用设备和签名环境。

### 下一步

- 准备 Android 模拟器或连接安装 Expo Go / development build 的 Android 真机，联调注册、登录、协议、Token 恢复与登出。
- 在 macOS/iPhone 环境完成同一套 iOS 验证。
- 双端运行时验证通过后，将 Step #9a 更新为已完成，再进入 check-in 与三视角拍照上传实现。

---

## 2026-07-20 — Step #9a 修正/补充：本机启动与真实 HTTP 联调 — ⏸ 阻塞

### 本次完成

- 按 Android 模拟器路线核对本机环境，并安装、验证 Microsoft OpenJDK 17.0.19 LTS。
- 确认客户端现有依赖和后端虚拟环境可用，数据库迁移保持在 `0012_app_foundation (head)`。
- 真实启动 Uvicorn 后端与 Expo Metro；后端监听 `8000`，Metro 监听 `8081`。
- 通过真实 HTTP 临时账号跑通注册、四项协议、Token 轮换、登出、重新登录和账号注销；测试账号已删除。
- 未修改业务源码；联调使用的临时 PowerShell smoke 脚本已精确删除。

### 验证情况

- 客户端 `npm run typecheck` 通过。
- 客户端 `npm exec eslint . -- --no-cache` 通过。
- `GET /health` 返回 `status=ok`，`GET /health/db` 返回数据库可达，`GET /docs` 返回 HTTP 200。
- Metro `GET http://127.0.0.1:8081/status` 返回 HTTP 200 和 `packager-status:running`。
- 真实 HTTP 闭环结果：register=201、consents GET/PUT=4 项、refresh=200、旧 Access=401、logout=204、登出后 Access=401、relogin=200、delete account=204、注销后 Access=401。
- Android 模拟器运行时仍未验证，因此 Step #9a 不能标记为完成。

### 当前阻塞或遗留

- Android Studio 自动安装被 Windows 管理员策略阻止；Chocolatey 下载在 684,720,128 字节处停滞后已终止残留进程，Android Studio、Android SDK、adb 和 AVD 仍未安装。
- Android Studio 部分安装包保留在用户 Chocolatey 临时目录，可由用户选择清理或改用浏览器重新下载官方完整安装器。
- Expo Metro 需要项目级写入 `.expo` 运行缓存；本次已通过受控权限成功启动，但仍缺少模拟器连接和页面操作证据。

### 下一步

- 用户手动从 Android Studio 官方页面下载安装器，以 Standard 模式安装 Android SDK Platform 36、Platform-Tools、Build-Tools 和 Android Emulator。
- 用户在 Device Manager 创建并启动 API 36 Pixel AVD，随后在新 PowerShell 中验证 `adb devices`。
- 模拟器就绪后运行 `npx expo start` 并按 `a`，完成注册、协议、会话恢复和登出的端到端页面验证，再收口 Step #9a。

---

## 2026-07-27 — 项目真实进度与移动端主线校准 — 🚧 进行中

### 本次完成

- 以当前 `main` 分支代码、最近提交和唯一进度日志为依据重新校准项目状态；本次只校准进度，不修改业务代码。
- 后端现状保持不变：账号与协议、多用户隔离、check-in、三视角照片、质量门槛、AI 分析、日记、趋势和 patch lineage 等 MVP 服务端能力已经实现；最近一次有记录的完整回归为 42 个测试通过，数据库迁移为 `0012_app_foundation`。
- 移动端 Step #9a 已实现 Expo SDK 57 工程骨架、注册、登录、Access/Refresh Token 会话恢复与轮换、Refresh Token 安全存储、首次四项协议、受保护路由、基础组件和占位首页；真实 HTTP 账号闭环此前已验证。
- 确认 Step #9b 已存在一个可独立验证的前置子步骤：
  - `mobile/src/lib/check-in-flow.ts` 已定义 front / left / right 三视角顺序、本地日期、请求 UUID、下一待拍视角和后端质量错误文案；
  - `mobile/src/lib/check-in-api.ts` 已封装标准 check-in 创建、带幂等字段的照片 multipart 上传和 check-in 完成请求；
  - `mobile/tests/check-in-flow.test.mjs` 与 `mobile/tests/check-in-api.test.mjs` 已覆盖上述纯逻辑和请求契约。
- 明确上述 Step #9b 内容仅为领域逻辑与 API 适配层，不代表三视角拍照功能完成；当前没有 check-in 页面、相机权限与取景组件、三视角拍摄状态机、上传进度/失败重试、质量不通过后的重拍交互，也没有分析、日记、趋势和生命周期客户端页面。
- 将当前唯一开发主线收敛为：先恢复可运行的移动端验证环境并收口 Step #9a，再完成 Step #9b 的“创建 check-in → 三视角拍照 → 上传与质量反馈 → 完成 check-in”首条真机闭环；Figma 研究板、视觉扩展和非主线功能暂不阻塞该主线。

### 验证情况

- `git status --short` 为空，当前工作树在校准前无未提交修改；当前分支为 `main`，HEAD 为 `7603965`。
- 静态检索确认移动端当前仅有 `index / login / register / consents / home` 五类业务路由，尚无 check-in 或相机页面；`expo-camera` 已在依赖声明中。
- 本次尝试执行 `npm run test:unit`，当前 Node 运行时不支持 `--experimental-strip-types` 和 `--test-isolation=none`，测试未运行。
- 本次尝试执行 `npm run typecheck`，当前环境无法找到本地 `tsc`；尝试执行无缓存 ESLint 时，本机 npm 环境缺少预期目录，均未获得新的通过证据。
- 因当前依赖/Node 环境与 2026-07-20 验证环境不一致，本次只确认代码范围，不把 Step #9a 或 Step #9b 标记为已完成；2026-07-20 已记录的历史验证结果继续保留。

### 当前阻塞或遗留

- 当前移动端 Node/依赖执行环境不可用，需要先确认项目要求的 Node 版本并恢复现有依赖，不能擅自安装或升级。
- Android Studio、Android SDK、adb 和 AVD 的可用状态尚未重新确认；Step #9a 仍缺 Android/iOS 真机或模拟器页面操作证据。
- Step #9b 只有纯逻辑、API 封装与单元测试源码，尚未进入用户可操作的拍照闭环。
- AI 分析、日记、趋势和生命周期的移动端接入均未开始。

### 下一步

- 第一步：检查当前 Node、npm、`mobile/node_modules`、Android SDK/adb 和可用真机状态，形成不安装依赖的环境恢复方案；需要安装或升级时先由用户确认。
- 第二步：环境恢复后重新执行移动端 unit test、TypeScript 和 ESLint，并在 Android 真机或模拟器上完成注册、协议、会话恢复和登出验证，收口 Step #9a。
- 第三步：在现有 `check-in-flow` 与 `check-in-api` 基础上实现 check-in 页面和三视角相机闭环；该闭环通过真机验证后，再接 AI 分析结果与日记。

---

## 2026-07-27 — 新电脑环境构建文档 — ✅ 已完成

### 本次完成

- 新增 `docs/environment_setup.md`，作为新电脑从零配置本项目的主环境文档。
- 文档覆盖 Windows 本地开发所需的 Git、Python 3.11+、uv、PostgreSQL 16、Node.js 22.13.x、Expo SDK 57、JDK 17、Android Studio、Android SDK 36、AVD、后端 `.env`、移动端 `.env`、数据库迁移、人脸关键点模型下载、后端启动、客户端启动、真机/模拟器调试和上云前环境准备方向。
- 明确当前项目后端不能按 Python 3.10 配置，需使用 `backend/pyproject.toml` 要求的 Python 3.11+；移动端需匹配 Expo SDK 57 的 Node 22.13.x。

### 验证情况

- 已读取 `backend/README.md`、`backend/pyproject.toml`、`backend/.env.example`、`mobile/package.json`、`mobile/.env.example`、`mobile/app.json` 和 `mobile/AGENTS.md`，并按实际项目依赖编写。
- 已核对 Expo SDK 57 官方版本表，确认其对应 React Native 0.86、React 19.2.3、Android SDK 36 和最低 Node.js 22.13.x。
- 本次只新增 Markdown 文档并追加开发日志，不涉及代码、数据库迁移或依赖安装，因此未运行后端或客户端测试。

### 当前阻塞或遗留

- 无。

### 下一步

- 用户按 `docs/environment_setup.md` 在新电脑完成环境配置。
- 环境可用后重新执行后端 Ruff/pytest、移动端 typecheck/unit test，并在 Android 模拟器或真机完成账号与协议闭环验证。

---

## 2026-07-27 — 新电脑环境构建文档补充安装教程 — ✅ 已完成

### 本次完成

- 根据用户反馈补充 `docs/environment_setup.md`，将原先偏“安装后验证”的内容扩展为可直接照做的安装教程。
- 为 Git、Python 3.11+、uv、Node.js 22、VS Code、Docker Desktop、PostgreSQL 16、Microsoft OpenJDK 17、Android Studio、Android SDK 36、AVD 和 Android 环境变量补充下载地址、安装选项、安装步骤和常见 PATH 注意事项。
- 保留原有后端、移动端、数据库迁移、模型下载、启动和上云准备内容。

### 验证情况

- 已核对官方来源：Git for Windows、Python Windows downloads、Astral uv 安装文档、Node.js 下载页、PostgreSQL Windows installers、Microsoft OpenJDK 下载/安装文档、Android Studio 安装文档、Expo SDK 57 版本表。
- 本次只修改 Markdown 文档和追加开发日志，不涉及代码、数据库迁移或依赖安装，因此未运行后端或客户端测试。

### 当前阻塞或遗留

- 无。

### 下一步

- 用户按 `docs/environment_setup.md` 从系统软件安装开始配置新电脑。
- 如安装过程中某一步报错，优先带上命令输出或截图继续定位。

---

## 2026-07-27 — 新电脑环境构建文档补充命令安装方式 — ✅ 已完成

### 本次完成

- 根据用户反馈补充 `docs/environment_setup.md`，对可用命令安装的系统工具增加 PowerShell/winget 指令。
- 新增 Git、Python 3.11/3.12、uv、Node.js LTS、VS Code、Docker Desktop、Microsoft OpenJDK 17、Android Studio 的命令安装方式。
- 对 PostgreSQL 16 明确说明：更建议图形安装器，因为首次配置需要设置 `postgres` 密码、端口和组件；同时保留 winget 尝试命令和 Docker 数据库命令路线。

### 验证情况

- 本次只修改 Markdown 文档和追加开发日志，不执行安装命令、不安装依赖、不改业务代码。
- 尚未在新电脑实际执行这些安装命令，命令有效性需在用户目标机器上验证。

### 当前阻塞或遗留

- 无。

### 下一步

- 用户优先按文档中的命令安装；若 winget 安装失败，再切换到对应官网下载页面。

---

## 2026-07-27 — 新电脑环境构建文档命令化重整 — ✅ 已完成

### 本次完成

- 按用户要求重整 `docs/environment_setup.md`，删除复杂的网页登录下载方式和下载地址描述。
- 文档改为命令优先结构，只保留 PowerShell、winget、Docker、npm、uv、alembic、Expo 等可直接执行的配置指令。
- Android Studio 保留安装后的 SDK Manager、API 36、AVD 配置步骤，因为这些步骤需要在 Android Studio 内完成，无法完全替换为项目内命令。
- PostgreSQL 保留 Docker 命令方案为推荐方案，同时保留 winget 安装 PostgreSQL 的备选命令。

### 验证情况

- 本次只修改 Markdown 文档和追加开发日志，不执行安装命令、不安装依赖、不改业务代码。
- 尚未在新电脑实际执行这些安装命令，命令有效性需在用户目标机器上验证。

### 当前阻塞或遗留

- 无。

### 下一步

- 用户按命令化后的 `docs/environment_setup.md` 从 `winget --version` 开始配置新电脑。

---

## 2026-07-28 — 移动端 ESLint 依赖解析基线修复 — ✅ 已完成

### 本次完成

- 创建并切换到功能分支 `feat/mobile-check-in-flow`，后续移动端开发不直接修改 `main`。
- 定位 ESLint 的 83 个错误并非源码问题，而是当前锁文件将 `eslint-import-resolver-typescript` 安装在 `eslint-config-expo` 内部，`eslint-plugin-import` 按包名无法从项目根加载该 resolver。
- 修改 `mobile/eslint.config.js`，保留 Expo SDK 57 的原始 flat config，只将其中的 TypeScript resolver 映射到 `eslint-config-expo` 自带实例的绝对路径。
- 未新增业务依赖，最终未修改 `mobile/package.json` 和 `mobile/package-lock.json`。

### 验证情况

- 先在原始锁文件执行 `npm ci`，随后稳定复现 ESLint 83 个 resolver/别名误报，确认测试红灯与根因一致。
- 修复后 `npm exec eslint . -- --no-cache` 通过。
- `npm run test:unit` 通过，共 10 项测试。
- `npm run typecheck` 通过。
- `git diff --check` 通过。

### 当前阻塞或遗留

- `npm ci` 在 npm 11 下提示现有锁文件可能存在无效或受损条目，但本次安装完成且三项移动端质量检查均通过；后续需要单独评估是否整理锁文件，不能混入当前功能改动。
- npm 审计报告现有依赖树包含 11 个 moderate、9 个 high 告警；本次未擅自执行 `npm audit fix`。

### 下一步

- 配置 Android Studio、Android SDK 36、Platform-Tools、Emulator 和 API 36 AVD。
- Android 运行环境可用后，先完成 Step #9a 的账号与协议闭环验证，再进入三视角 check-in 页面开发。

---

## 2026-07-28 — Android 联调环境核查 — ⏸ 阻塞

### 本次完成

- 核查了当前 Windows 11、JDK、Android SDK、虚拟化、磁盘和安装器状态。
- 确认本机已有 Android SDK Platform `android-36.1`、Build-Tools `36.0.0`、Platform-Tools `37.0.0` 和 Android Emulator `36.6.11.0`。
- 确认系统固件虚拟化已开启，C 盘剩余约 135.8 GB、D 盘剩余约 254.6 GB，满足后续安装空间要求。
- 未修改系统功能，未安装 Android Studio、系统镜像或其他依赖。

### 验证情况

- SDK 路径为 `D:\Users\yumeifeng\AppData\Local\Android\Sdk`，其中 `adb.exe` 和 `emulator.exe` 可直接运行。
- Android Studio、Command-line Tools、API 36 system image 和 AVD 均不存在。
- `ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `JAVA_HOME` 当前均未设置。
- `VirtualMachinePlatform`、`HypervisorPlatform` 和 `Microsoft-Hyper-V-All` 当前均为 Disabled。
- Windows App Installer 已安装，但当前 `winget.exe` 启动返回访问被拒绝，不能依赖 winget 自动安装 Android Studio。

### 当前阻塞或遗留

- 启用 Windows 虚拟化功能需要系统级修改并可能要求重启。
- Android Studio 和 API 36 system image 尚未安装；需要用户明确许可后才能继续系统配置。

### 下一步

- 用户允许后启用 Windows Hypervisor Platform 或项目实际需要的虚拟化功能，并按系统提示重启。
- 通过 Android Studio 官方安装器完成 IDE、Command-line Tools 和 API 36 system image 安装。
- 创建 API 36 Pixel AVD，设置 Android SDK 环境变量并验证 `adb devices`。

---

## 2026-07-28 — Android 联调环境配置补充：Pixel 8 AVD 与虚拟化 — ⏸ 阻塞

### 本次完成

- 用户已通过 Android Device Manager 创建 `Pixel_8` AVD。
- 确认 AVD 使用 Android 16 / API 36、Google Play、`x86_64` 系统镜像，设备模板为 Pixel 8，内存配置为 2048 MB。
- 启用 Windows `HypervisorPlatform` 可选功能，执行时使用 `NoRestart`，未自动重启电脑。
- 在用户级环境变量中设置 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `JAVA_HOME`，并将 SDK 的 `platform-tools`、`emulator` 目录加入用户 PATH。

### 验证情况

- `emulator -list-avds` 返回 `Pixel_8`。
- `emulator -accel-check` 在启用功能前已返回 `WHPX(10.0.26200) is installed and usable`。
- API 36 Google Play 系统镜像路径存在：`system-images\android-36\google_apis_playstore\x86_64`。
- `adb version` 返回 Platform-Tools `37.0.0`，`emulator -list-avds` 在当前 PowerShell 中可直接执行。
- Windows 功能状态已从 Disabled 变为 Enabled，但系统返回 `RestartNeeded=True`，尚未完成重启后验证。

### 当前阻塞或遗留

- 等待用户手动重启 Windows，使 Hypervisor Platform 配置正式生效。
- Android Studio 可执行文件不在两个常见默认路径，但 API 36 镜像和 AVD 已由 Device Manager 成功创建，不影响当前重启后的模拟器验证。

### 下一步

- 用户重启电脑后重新进入项目会话。
- 验证 `emulator -accel-check`、启动 `Pixel_8`，并确认 `adb devices` 显示 `emulator-xxxx device`。
- 随后启动后端和 Expo，在 Android 模拟器中完成 Step #9a 账号与协议闭环。

---

## 2026-07-28 — Android API 36 模拟器环境 — ✅ 已完成

### 本次完成

- Windows 重启后确认 Hypervisor Platform 已正式生效。
- 启动 `Pixel_8` AVD，并等待 Android 系统完成启动。
- 建立 `adb` 连接，Android 模拟器已具备后续 Expo 页面联调条件。

### 验证情况

- `Get-WindowsOptionalFeature -FeatureName HypervisorPlatform` 返回 Enabled。
- `emulator -accel-check` 返回 `WHPX(10.0.26200) is installed and usable`。
- `adb devices -l` 显示 `emulator-5554 device`。
- `sys.boot_completed=1`，系统版本为 Android 16、API 36。
- `ANDROID_HOME`、`ANDROID_SDK_ROOT`、`JAVA_HOME` 以及用户 PATH 已在重启后保留。

### 当前阻塞或遗留

- 无。

### 下一步

- 启动 PostgreSQL、FastAPI 和 Expo Metro。
- 在 Pixel 8 API 36 模拟器中验证注册、首次协议、会话恢复、Token 轮换和登出，收口 Step #9a。

---

## 2026-07-28 — Step #9a Android 账号与协议运行闭环 — ✅ 已完成

### 本次完成

- 在 Pixel 8 API 36 模拟器中安装并运行官方 Expo Go 57.0.2，连接本机 Metro 和 FastAPI。
- 通过 Android 实际界面完成注册、四项协议确认、受保护首页访问、应用冷启动后的 refresh token 会话恢复、登出、再次登录和再次登出。
- 为模拟器创建忽略提交的 `mobile/.env`，将 API 地址配置为 `http://10.0.2.2:8000/api/v1`；未修改移动端业务源码。

### 验证情况

- 后端请求链路验证通过：注册返回 201，协议读取和更新返回 200，会话刷新返回 200，两次登出返回 204，再次登录返回 200。
- 冷启动后直接进入受保护首页，证明持久化 refresh token 与会话恢复生效；再次登录后未重复展示协议页。
- Android 首页已目视检查，页面内容无重叠；右上角开发按钮为 Expo Go 调试控件。
- 移动端 `npm run test:unit` 通过，共 10 项测试；`npm run typecheck`、`npm exec eslint . -- --no-cache` 和 `git diff --check` 均通过。
- 后端完整回归 42 passed，保留 1 条既有 Starlette/httpx2 弃用警告。

### 当前阻塞或遗留

- 运行验证使用的临时账号 `qa.step9a.20260728.1706@openai.com` 仍保留在本地开发数据库；自动清理命令被本机执行策略拦截，未绕过策略执行。账号当前已登出，不影响后续开发。
- 本步骤完成的是 Android 模拟器联调；最终真机网络、相机和权限行为仍需在 Step #9b-3 验证。

### 下一步

- 开始 Step #9b-1：实现首页今日打卡入口、受保护的 check-in 路由和 Android 相机权限状态。

---

## 2026-07-28 — Ruff 0.16 默认规则兼容修正 — ✅ 已完成

### 本次完成

- 定位新环境全量 Ruff 出现 359 项既有代码报错的根因：项目使用 `ruff>=0.6`，Ruff 0.16.0 扩大了默认启用规则集，而项目未显式声明原有检查基线。
- 修改 `backend/pyproject.toml`，将项目原有默认规则显式固定为 `E4`、`E7`、`E9` 和 `F`，避免工具默认值变化被误判为业务代码回归。
- 未批量格式化或自动修复既有后端代码，未引入无关改动。

### 验证情况

- 修正前用 `--select E4,E7,E9,F` 探测通过，确认既有检查基线本身无报错。
- 修正后使用 Ruff 0.16.0 执行 `ruff check --no-cache .`，全量检查通过。
- 后端完整回归 42 passed，保留 1 条既有 Starlette/httpx2 弃用警告；`git diff --check` 通过。

### 当前阻塞或遗留

- `ruff>=0.6` 仍允许升级，但规则基线已经显式固定；后续若要采用 Ruff 0.16 的扩展默认规则，应作为独立质量治理任务逐步处理。

### 下一步

- 继续 Step #9b-1 的移动端 check-in 入口、路由保护和相机权限开发。

---

## 2026-07-28 — Step #9b-1 打卡入口、受保护路由与相机权限 — ✅ 已完成

### 本次完成

- 修改 `mobile/src/app/home.tsx`，将“今日 Check-in”从占位能力改为可操作入口。
- 新增 `mobile/src/app/check-in.tsx`，实现相机权限加载、可请求、需前往系统设置和已授权四种状态；授权后展示前置相机、三视角进度、正面参考框与拍摄说明。
- 修改 `mobile/src/app/_layout.tsx`，将 `check-in` 页面纳入“已登录且已确认必要协议”的受保护路由组。
- 新增 `mobile/src/lib/camera-permission.ts` 和对应单元测试，集中维护权限状态映射；页面失焦时卸载 `CameraView`，避免多个相机预览同时存在。

### 验证情况

- 先新增失败测试，确认权限状态模块不存在时测试按预期失败；实现后移动端单元测试 14 passed。
- `npm run typecheck` 和 `npm exec eslint . -- --no-cache` 均通过；Expo typed routes 已重新生成并识别 `/check-in`。
- Pixel 8 API 36 模拟器实际验证通过：从首页进入权限说明页，触发 Android 系统相机权限弹窗，授权后成功显示前置相机预览、参考框、`1 / 3 · 正面` 进度与说明，页面无内容重叠。
- 登出后直接打开 `/check-in` 深链，被受保护路由自动重定向至登录页。

### 当前阻塞或遗留

- 本次运行验证新建了本地测试账号 `qa.camera.20260728.1724@openai.com`，当前已登出；账号仅存在于本地开发数据库。
- 永久拒绝后跳转系统设置的分支已由单元测试覆盖，尚未在模拟器中人为连续拒绝权限进行运行验证。

### 下一步

- 开始 Step #9b-2：创建或恢复当天 standard check-in，接入正面、左侧、右侧拍摄与上传，支持幂等请求、失败重试和中断后恢复。

---

## 2026-07-28 — Step #9b-2 三视角拍摄、上传、恢复与重试 — 🚧 进行中

### 本次完成

- 扩展 `mobile/src/lib/check-in-api.ts`，新增最近 check-in 列表和单个 check-in 刷新请求。
- 扩展 `mobile/src/lib/check-in-flow.ts`，实现当天 standard check-in 选择、已拍视角提取和服务端进度恢复；同一天存在已完成项时优先返回已完成项，避免重复创建。
- 扩展 `mobile/src/app/check-in.tsx`，实现当天 draft 创建/恢复、相机就绪控制、拍照、multipart 上传、服务器照片刷新和 front → left → right 自动推进。
- 上传失败时保留本地照片 URI 与固定 `client_request_id`，支持同一文件幂等重试或放弃后重新拍摄。
- 定位并修复 Expo SDK 57 文件上传兼容问题：SDK 57 的全局 `fetch` 使用 `expo/fetch`，旧式 `{ uri, name, type }` 文件对象不会被编码为 multipart；改为使用 `expo-file-system` 的标准 `File` 对象。
- `expo-file-system 57.0.1` 原本已由 Expo 安装并存在于锁文件，本次仅将其显式声明为移动端直接依赖，未执行依赖安装命令。

### 验证情况

- 先新增恢复和查询契约失败测试，缺少导出时按预期失败；实现后移动端单元测试 19 passed。
- `npm run typecheck`、`npm exec eslint . -- --no-cache` 和 `npm ls expo-file-system --depth=0` 均通过。
- Pixel 8 API 36 模拟器首次进入时执行 `GET /check-ins` 和 `POST /check-ins`，成功创建当天 standard draft；重启 Metro 和 Expo Go 后只执行 `GET /check-ins` 并恢复同一 draft，没有重复创建。
- 修正文件上传前，拍照后请求在客户端失败且后端未收到 `/photos`；改用 SDK 57 `File` 后，后端连续收到 `POST /api/v1/photos` 并返回 422，证明相机文件 multipart、认证和 API 地址链路已接通。
- 页面在质量失败后显示“重试上传”和“重新拍摄”；重试会再次上传保留文件，重新拍摄会清除待重试状态并恢复正面快门。

### 当前阻塞或遗留

- Android 模拟器虚拟相机只输出彩色测试场景，后端人脸质量门槛会正确拒绝，无法在当前模拟器验证照片通过后的左侧/右侧自动推进和三张成功落库。
- 正向上传、三视角推进和完成 check-in 需要在 Step #9b-3 使用真实 Android 相机验证；验证前本子步骤保持“进行中”。

### 下一步

- 开始 Step #9b-3：解析后端质量错误并展示针对性重拍提示，三张照片通过后完成 check-in，提供完成页，并在真实 Android 设备验证正向闭环。

---

## 2026-07-28 — Step #9b-3 质量反馈、完成页与真机正向闭环 — ⏸ 阻塞

### 本次完成

- 扩展 `mobile/src/lib/check-in-flow.ts`，解析后端质量 422 的 `errors` 列表，去重并映射为模糊、光线、人脸裁切、距离和角度等具体中文提示。
- 扩展 `mobile/src/app/check-in.tsx`：质量失败后不再允许无意义地重复上传同一照片，而是清除失败照片并保留当前视角供重拍；网络失败仍保留本地文件与“重试上传”。
- 第三张服务器照片存在后自动调用 `POST /check-ins/{id}/complete`；完成请求失败时保留三张照片并提供独立重试。
- 新增当天完成状态页面，显示正面、左侧、右侧均已保存；重新进入当天 Check-in 时会优先恢复服务器已完成项，不再创建或打开新的拍摄流程。

### 验证情况

- 先新增质量详情解析失败测试，缺少导出时按预期失败；实现后移动端单元测试 21 passed。
- 移动端 `npm run typecheck`、`npm exec eslint . -- --no-cache` 和 `git diff --check` 均通过。
- Pixel 8 API 36 模拟器实际拍摄后，页面正确显示后端返回的三项具体提示：光线极端、明暗裁切和未检测到完整人脸；不再显示通用 422 文案，页面内容与快门无重叠。
- 后端 Ruff 全量检查通过；完整 pytest 回归 42 passed，保留 1 条既有 Starlette/httpx2 弃用警告。

### 当前阻塞或遗留

- `adb devices` 当前只有 Pixel 8 模拟器；虚拟相机没有真人面部，所有照片都会被后端质量门槛正确拒绝。
- 尚未获得真实 Android 前置相机的三张合规照片，因此 front → left → right 正向推进、三张成功落库、自动 complete 和完成页仍待真机运行验证；不得将 Step #9b 整体标记为已完成。
- 本地账号 `qa.camera.20260728.1724@openai.com` 留有一个当天 standard draft，但没有成功落库的照片。

### 下一步

- 用户连接一台启用 USB 调试的 Android 真机，并确认 `adb devices -l` 显示该设备为 `device`。
- 真机联调时将忽略提交的 `mobile/.env` 临时改为 `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1`，执行 `adb reverse tcp:8000 tcp:8000` 和 `adb reverse tcp:8081 tcp:8081`，重启 Metro 后打开 Expo Go。
- 使用真实前置相机依次完成正面、左侧、右侧照片，验证质量反馈后的重拍、自动完成、完成页和重新进入后的已完成恢复；通过后分别追加 #9b-2 与 #9b-3 完成记录。

---

## 2026-07-28 — Step #9b-3 补充：模拟器接入电脑摄像头 — 🚧 进行中

### 本次完成

- 将 Pixel 8 AVD 的前置摄像头映射为主机 `HP FHD Camera`（`webcam0`），替换原有的模拟场景输入。
- 修复 Expo Router 启动时无法解析 `@expo/metro-runtime` 的打包错误；通过 Expo 兼容版本安装将 `@expo/metro-runtime` 声明为移动端直接依赖。
- 重新连通 Uvicorn、Metro、Expo Go 与 Pixel 8 模拟器，进入当天 Check-in 相机页面。

### 验证情况

- AVD 配置为 `hw.camera.front=webcam0`，`emulator -webcam-list` 能识别 `HP FHD Camera`。
- `@expo/metro-runtime` 可从移动端项目根目录解析；Expo Go 成功加载项目，不再出现 Metro 模块解析错误。
- 后端 `/health` 返回 200，Metro 状态正常，`adb reverse` 的 8000、8081 映射存在。
- Android 相机服务显示 Expo Go 为活动客户端，摄像头设备状态为 `ACTIVE`；Check-in 页面已显示电脑摄像头实时画面。
- 移动端 `npm run typecheck`、`npm run lint` 和 `npm run test:unit` 均通过，单元测试为 21 passed。

### 当前阻塞或遗留

- 尚未使用电脑摄像头依次拍摄并上传正面、左侧和右侧三张合规照片，因此自动推进、自动完成、完成页及重新进入恢复仍待验证。
- `npx expo install --check` 提示 `react-native-screens@4.25.2` 与 Expo 57 建议的 `~4.26.0` 不一致；当前启动与相机预览未受影响，尚未获准升级该依赖。

### 下一步

- 在当前 Check-in 页面使用电脑摄像头依次完成正面、左侧和右侧拍摄，验证质量反馈、上传、自动完成和完成状态恢复。
- 正向闭环通过后分别追加 Step #9b-2 与 Step #9b-3 的完成记录；最终仍保留真实 Android 设备差异验证。

---

## 2026-07-28 — Step #9b-3 补充：照片质量失败诊断日志 — ✅ 已完成

### 本次完成

- 在 `POST /photos` 的质量拒绝分支新增 INFO 级诊断日志，输出 `check_in_id`、`view_type`、错误码和 `quality_result.metrics`。
- 日志只包含数值质量指标，不记录照片内容、认证 Token 或用户身份信息。
- 扩展 `backend/tests/test_photos.py`，覆盖质量失败日志中的视角、错误码、清晰度方差和人脸数量。

### 验证情况

- 先运行定向测试并确认其因缺少 `photo_quality_failed` 日志而失败；实现后同一定向测试通过。
- 后端 `uv run ruff check --no-cache .` 通过。
- 后端完整 `uv run pytest -q` 回归为 42 passed，保留 1 条既有 Starlette/httpx2 弃用警告。

### 当前阻塞或遗留

- 无。

### 下一步

- 在模拟器中重新拍摄一张照片，从 Uvicorn 终端读取 `photo_quality_failed` 的 `errors` 和 `metrics`，据此判断主要限制来自清晰度、光照、人脸占比还是模型未检出。

---

## 2026-07-28 — 照片质量失败诊断日志级别修正 — ✅ 已完成

### 本次完成

- 修正上一条“照片质量失败诊断日志”记录：最终日志级别由 INFO 调整为 WARNING，避免 Uvicorn 已初始化日志系统时业务模块 INFO 被过滤。
- 测试新增日志级别断言，确保 `photo_quality_failed` 以 WARNING 输出。

### 验证情况

- 先确认新增级别断言在 INFO 实现下按预期失败；改为 WARNING 后定向测试通过。
- 后端 Ruff 全量检查通过；完整 pytest 回归为 42 passed，保留 1 条既有 Starlette/httpx2 弃用警告。

### 当前阻塞或遗留

- 无。

### 下一步

- 在模拟器中重新拍摄并把 Uvicorn 终端中的 `photo_quality_failed` 完整一行提供给后续诊断。

---

## 2026-07-28 — Step #9b-3 补充：电脑摄像头黑帧诊断 — ⏸ 阻塞

### 本次完成

- 通过新增的 `photo_quality_failed` 日志取得模拟器实际上传照片的完整质量指标。
- 核对 Windows 摄像头设备、隐私权限、AVD 映射和当前摄像头占用进程。

### 验证情况

- 上传图片尺寸为 1080×2400，`laplacian_variance=115.48` 高于清晰度阈值 100，不属于模糊拒绝。
- 图片 `mean_luma=0.18`、`p95_luma=0`、`dark_fraction=0.9987`，证明模拟器上传的画面有 99.87% 为黑色；MediaPipe 因此得到 `face_count=0`。
- Windows 显示 `HP FHD Camera` 设备状态正常，用户级与系统级 webcam 权限均为 Allow，Pixel 8 AVD 前置摄像头为 `webcam0`。
- Windows 摄像头使用记录中只有 Android Emulator 的 `qemu-system-x86_64.exe` 处于活动状态，未发现其他应用争抢摄像头。

### 当前阻塞或遗留

- 主机摄像头向模拟器输出黑帧，可能来自 HP 摄像头物理隐私遮挡，或模拟器摄像头流初始化异常。
- 在恢复正常主机摄像头画面前，无法使用该模拟器验证三视角正向闭环。

### 下一步

- 用户检查 HP 电脑的摄像头物理隐私挡板或键盘摄像头隐私键。
- 让模拟器释放摄像头后使用 Windows“相机”应用验证主机画面；若主机画面正常，则关闭相机应用并对 Pixel 8 AVD 执行 Cold Boot 后重试。

---

## 2026-07-28 — Step #9b-3 补充：质量失败原图本地保存 — ✅ 已完成

### 本次完成

- 新增 `PHOTO_QUALITY_SAVE_REJECTED_IN_DEV` 配置，默认关闭，并且只有 `APP_ENV=dev` 时允许保存质量失败原图。
- 在质量检查返回 422 前，将后端实际收到的原始字节写入 `backend/storage_debug/rejected/`，并在 `photo_quality_failed` 日志中输出 `rejected_path`。
- 保存失败只记录异常，不改变原有质量响应；生产环境即使误设开关也不会保存。
- 将 `backend/storage_debug/` 加入 Git 忽略；当前本地 `.env` 已临时启用该诊断开关。

### 验证情况

- 先新增开发环境保存测试并确认其按预期失败；实现后开发环境保存与生产环境禁止保存两组测试均通过。
- 后端 Ruff 全量检查通过；完整 pytest 回归为 44 passed，保留 1 条既有 Starlette/httpx2 弃用警告。
- 独立配置检查返回 `app_env=dev save_rejected=True`，运行中后端健康检查返回正常。

### 当前阻塞或遗留

- 尚未在功能启用后重新上传照片，因此调试目录要到下一次质量失败时才会生成文件。
- 调试文件包含真实人脸图像，仅用于本地问题定位，排查完成后应关闭开关并删除目录。

### 下一步

- 用户在模拟器中重新拍摄一次；根据 Uvicorn 日志中的 `rejected_path` 打开原始图片，确认黑帧发生在上传前还是后端处理阶段。

---

## 2026-07-28 — Step #9b-3 补充：黑帧产生环节定位 — ⏸ 阻塞

### 本次完成

- 打开 `backend/storage_debug/rejected/` 中保存的失败原图，确认后端收到的请求文件本身为全黑图片。
- 对照主机 Windows“相机”应用和 Android 模拟器内的 Expo Camera 预览，二者均能显示主机摄像头实时画面。
- 将问题范围从后端解码、网络传输和人脸模型缩小到 Android 模拟器静态照片输出流或 Expo Camera 拍后处理。

### 验证情况

- 调试保存发生在后端质量拒绝之前，写入内容为请求中的原始 `data` 字节，未经过归一化或重新编码。
- 失败文件尺寸为 1080×2400，与模拟器竖屏预览尺寸一致；当前 `takePictureAsync` 使用 `skipProcessing=false`，Expo 会执行旋转并缩放到预览尺寸。
- Windows 摄像头能正常拍照，模拟器实时预览正常，但 Expo 返回的 JPEG 全黑，说明预览流正常不代表独立的 JPEG 静态捕获流正常。

### 当前阻塞或遗留

- 尚未区分 Android Emulator 的 JPEG 静态捕获流异常，还是 Expo Camera 的旋转/缩放处理异常。

### 下一步

- 先使用模拟器内置 Android“相机”应用切换到前置摄像头并拍照，检查系统相机保存的照片是否全黑。
- 若系统相机照片正常，则将 Expo `takePictureAsync` 临时改为 `skipProcessing=true`；仍异常时再查询 `getAvailablePictureSizesAsync()` 并固定受支持的 4:3 或 16:9 图片尺寸。

---

## 2026-07-29 — Android 模拟器前端启动指令补充 — ✅ 已完成

### 本次完成

- 更新 `docs/environment_setup.md` 的 Android 模拟器启动章节，补充后端、模拟器和 Metro 的启动前提。
- 分别记录 Metro 尚未运行时的一次性启动命令，以及 Cold Boot 后复用现有 Metro 时的恢复命令。
- 明确 `adb reverse` 只建立端口映射，不会启动 Expo Go；补充 Metro 终端按 `a` 和通过 Expo URL Intent 打开项目的两种方式。
- 同步更新“本地完整启动顺序”中的客户端命令。

### 验证情况

- 文档命令与当前 Pixel 8 API 36 模拟器实际联调流程核对一致。
- 实际执行 `adb reverse` 和 Expo URL Intent 后，Expo Go 的项目 Activity 成功进入前台。

### 当前阻塞或遗留

- 无。

### 下一步

- 后续模拟器 Cold Boot 后按文档重新建立 8000、8081 映射并打开 Expo 项目。

---

## 2026-07-29 — Android 模拟器前置摄像头映射修正 — ✅ 已完成

### 本次完成

- 确认 Pixel 8 AVD 的 `hw.camera.front=none` 是 Expo Camera 无法启动的直接原因。
- 将前置摄像头改为 `webcam0`，后置摄像头改为 `emulated`，并对模拟器执行无快照冷启动。
- 重新建立 8000、8081 端口映射并打开 Expo 项目。

### 验证情况

- Android `media.camera` 已枚举前后摄像头，Expo Go 正在使用前置 Camera ID 10。
- 模拟器屏幕截图确认前置摄像头已输出 `HP FHD Camera` 的真实画面，不再显示“相机预览启动失败”。

### 当前阻塞或遗留

- 尚未重新验证 Expo 静态拍照结果是否仍为全黑，以及后端照片质量校验是否能够通过。

### 下一步

- 在当前前置摄像头画面中完整框入正脸并重新拍照，检查保存的拒绝原图和后端质量日志。

---

## 2026-07-29 — Step #9b-3 补充：Expo 模拟器静态照片黑帧根因对照 — ⏸ 阻塞

### 本次完成

- 在相同 Pixel 8 AVD、相同 `Webcam0` 前置摄像头下，对比 Android 系统相机与 Expo Camera 的静态拍照结果。
- Android 系统相机保存的 JPEG 能正常显示真实人像，确认主机摄像头、AVD 映射和 Android 静态拍照能力正常。
- Expo Camera 保存并上传的 JPEG 仍为黑帧，仅包含模拟器时间戳；后端保存的请求原图与该结果一致。
- 实验 `skipProcessing=true` 并在 Expo Go 中手动 Reload 后复测，黑帧仍可稳定复现；该无效实验已回退。

### 验证情况

- Android 系统相机测试照片为 130937 字节，肉眼检查可见正常人像。
- Expo 重载后的失败照片仍为 1080×2400 黑帧，肉眼检查只见黄色时间戳。
- 回退实验后执行前端 `npm run typecheck`、`npm run lint` 和 `npm run test:unit`，全部通过，单元测试为 21 passed。

### 当前阻塞或遗留

- Android Emulator 外接 Webcam 的 JPEG 静态输出路径与当前 Expo CameraX 路径不兼容；实时预览正常，但无法用该路径获得可用于质量检测的人像照片。
- 需要真机验证 Expo Camera 正常拍照，或在开发环境增加 Android 系统相机/相册选择作为模拟器联调入口。

### 下一步

- 经用户允许后安装 `expo-image-picker`，增加仅用于开发联调的系统相机/相册照片入口，继续验证上传、三视角和 Check-in 完成流程。

---

## 2026-07-29 — Step #9b-3 补充：模拟器系统相机联调入口 — ✅ 已完成

### 本次完成

- 安装 Expo SDK 57 兼容的 `expo-image-picker ~57.0.6`。
- 新增 `mobile/src/lib/camera-capture.ts`，将拍照来源分流封装为独立逻辑。
- 开发环境的模拟器使用 Android 系统相机并请求前置镜头；真机和非开发环境继续使用现有 Expo Camera 内嵌拍照。
- 系统相机取消拍摄时不生成待上传记录；成功返回后继续复用现有 `view_type`、`taken_at`、`client_request_id` 和照片上传流程。
- 新增 `mobile/tests/camera-capture.test.mjs`，覆盖模拟器分流、真机分流、取消拍摄和环境判定。

### 验证情况

- 新测试先因分流模块不存在而失败，完成实现后 4 项定向测试通过。
- 前端 `npm run typecheck`、`npm run lint` 和 `npm run test:unit` 全部通过，单元测试为 25 passed。
- Pixel 8 模拟器从 Check-in 成功打开 Android `CaptureActivity`，系统相机以前置 `Webcam0` 拍照并返回 Expo Go。
- 后端收到的拒绝原图为 160839 字节的正常人像 JPEG，不再是黑帧；质量检查返回清晰度、距离和视角提示，确认原有模型校验链路已处理真实图像。

### 当前阻塞或遗留

- 尚未用符合引导要求的正面、左侧和右侧照片走完一次完整 Check-in。
- `npx expo install --check` 仍报告既有的 `react-native-screens 4.25.2` 与 Expo 推荐的 `~4.26.0` 不一致，本子步骤未做无关依赖升级。
- npm 审计报告 11 个 moderate、9 个 high 风险项，未执行自动修复。

### 下一步

- 在模拟器系统相机中按当前视角要求靠近镜头并稳定拍摄，依次验证正面、左侧、右侧上传和 Check-in 自动完成。
- 完成模拟器闭环后，再在 Android 真机验证原有 Expo Camera 拍照路径。

---

## 2026-07-29 — Step #9b-4 三视角 Check-in 验收启动 — ⏸ 阻塞

### 本次完成

- 核对 Pixel 8 模拟器、Uvicorn、Metro 和 Expo Go 联调环境，确认 App 已进入当天 Check-in 的正面拍摄步骤。
- 确认 8000、8081 的 `adb reverse` 映射存在，后端健康检查和 Metro 状态正常。
- 本步骤只验收既有三视角链路；质量失败时仅修正错误提示或拍摄交互，不放宽后端质量阈值。

### 验证情况

- `adb devices -l` 显示 `emulator-5554` 状态为 `device`。
- `GET /health` 返回 `status=ok`，Metro 返回 `packager-status:running`。
- App 当前显示 `1 / 3 · 正面`，上次质量提示为“面部距离镜头太远，请靠近后重新拍摄”。
- 三张照片保存、第三张后的自动完成和 App 重启恢复尚未验证。

### 当前阻塞或遗留

- 等待用户在电脑摄像头前配合完成正面、左侧和右侧三次实际拍摄。

### 下一步

- 用户先在模拟器当前页面点击正面快门，在系统相机中让完整正脸靠近镜头、保持稳定并确认照片。
- 拍摄返回后读取页面反馈和后端质量指标；通过后继续左侧、右侧，并验证自动完成与重启恢复。

---

## 2026-07-30 — Step #9b-4 补充：三视角实拍验收环境阻塞 — ⏸ 阻塞

### 本次完成

- 明确当前 Windows 模拟前置摄像头的成像清晰度无法稳定通过既有照片质量门槛。
- 保持后端质量阈值不变，将三视角实拍、自动完成和 App 重启恢复留作真机条件具备后的独立验收项。
- 经用户确认，开发主线先切换到 Step #9c 分析数据层和结果 UI。

### 验证情况

- 既有联调已证明系统相机照片能够上传并进入后端质量检查，但无法取得三张符合清晰度等要求的照片。
- 当前没有可用于调试的 Android 真机，因此未验证完整正向实拍闭环。

### 当前阻塞或遗留

- 等待具备满足质量门槛的 Android 真机后补验 Step #9b-4。

### 下一步

- 不绕过质量检查，先以真实 API 契约、单元测试和仅限开发态的本地数据完成 Step #9c-1 与 Step #9c-2。

---

## 2026-07-30 — Step #9c-1 三视角分析数据层 — ✅ 已完成

### 本次完成

- 新增 `mobile/src/lib/analysis-api.ts`，实现默认 `force=false` 的 `POST /analyses` 和 `GET /check-ins/{id}/analysis-summary`，并完整声明照片分析与聚合结果类型。
- 新增 `mobile/src/lib/analysis-flow.ts`，按 front、left、right 建立视角状态，能从已有聚合结果恢复成功项，顺序分析缺失项，并在单个视角失败后继续处理其他视角。
- 重试逻辑只调用 pending/failed 视角，不重复分析已成功照片。
- 新增 `mobile/tests/analysis-api.test.mjs` 与 `mobile/tests/analysis-flow.test.mjs`。
- 为 Node 原生 TypeScript 单测与 Expo 类型检查共用 `.ts` 导入路径，在 `mobile/tsconfig.json` 启用 `allowImportingTsExtensions`。

### 验证情况

- 新测试先因分析模块不存在而失败；实现后 6 项分析定向测试通过。
- 首次完整类型检查发现 TS5097；确认命令行启用 `allowImportingTsExtensions` 后全量通过，再将该最小配置写入 `tsconfig.json`。
- `npm run typecheck`、`npm run lint` 和 `npm run test:unit` 全部通过，单元测试为 31 passed。

### 当前阻塞或遗留

- 尚未在真实三视角照片上调用视觉模型；真实缓存命中、部分模型失败和聚合结果需在真机照片条件具备后补验。

### 下一步

- 开始 Step #9c-2：新增分析动态路由、进度与聚合结果页面，并用仅限开发态的本地 fixture 验证 ready、partial、failed 和 `needs_doctor` 展示。

---

## 2026-07-30 — Step #9c-2 分析进度与聚合结果页面 — ✅ 已完成

### 本次完成

- 新增 `mobile/src/app/analysis/[checkInId].tsx`，真实路径先恢复 Check-in 和聚合状态；已有 ready 汇总时直接展示缓存结果，否则仅分析缺失视角并实时显示进度。
- 页面展示皮肤指数、非诊断性的外观程度、估算总数和正面/左侧/右侧结果；`needs_doctor=true` 时只提示咨询皮肤科专业人员，并明确不提供诊断或药品建议。
- Check-in 自动完成后跳转分析页；重新进入已完成 Check-in 时可手动查看分析结果。
- 新增仅限 `__DEV__` 且必须带合法 `demo` 参数的 ready、partial、failed、doctor fixtures；生产构建不会启用 fixture，也不会写入后端或绕过照片质量门槛。
- 新增 `analysis-presenter.ts` 与对应测试，集中处理视角名称、分析状态、外观程度和分析失败文案。
- 根据代码审查补充同一 App 进程内、同一照片的进行中请求共享；严格只重试 pending/failed，不重发 analyzing/success。
- 页面加入 generation guard，旧路由参数、旧 fixture 或旧加载请求不能覆盖新页面；三视角分析完成但汇总 GET 失败时提供独立“重新加载汇总结果”，不会再次调用照片分析。
- `CheckInDiary` 前端类型已与后端字段及枚举对齐。

### 验证情况

- 全部新增行为均按 TDD 先观察失败，再完成最小实现；分析相关测试覆盖缓存请求、进行中请求共享、失败释放、单视角失败继续、缺失重试、analyzing 防重、进度回调、generation 失效和汇总恢复动作。
- `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，单元测试为 46 passed。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。
- Pixel 8 模拟器实际渲染并检查 ready、failed、doctor 页面；failed 显示 2/3，点击开发态恢复后进入完整结果。
- 视觉检查发现绿色皮肤指数卡片标签对比度不足，拆分深色卡片标签样式后重新验证，文字已清晰可读。

### 当前阻塞或遗留

- 尚未用真实三视角照片验证视觉模型调用、真实缓存命中、真实部分失败和聚合结果。
- 前端进行中请求共享只能覆盖同一 App 进程；App 进程被杀或跨设备并发时，后端仍需要 photo_id 级数据库互斥或持久化分析任务，才能从服务端避免重复 LLM 调用和配额消耗。

### 下一步

- 在具备合格真机照片后完成 Step #9c-3 真实全链路联调。
- 生产加固时新增后端跨进程分析幂等，再验证 App 杀进程恢复和跨设备并发。

---

## 2026-07-30 — Step #9c-3 完整联调自动化部分 — ⏸ 阻塞

### 本次完成

- 完成移动端 TypeScript、Lint、46 项单元测试和相关 diff 检查。
- 在模拟器通过开发态 fixture 验证完整结果、部分失败、失败恢复和克制就医提示。
- 验证开发态失败恢复只补齐缺失视角状态，不改变已成功视角。

### 验证情况

- 自动化检查全部通过。
- 模拟器 UI 可正常从首页开发入口进入动态分析路由，并在不同 fixture 状态间切换。
- 未执行真实三视角拍照、真实 `POST /analyses` 和真实聚合结果联调，因此 Step #9c-3 不能标记为已完成。

### 当前阻塞或遗留

- Windows 模拟前置摄像头清晰度无法稳定通过质量门槛，且当前没有可用于调试的 Android 真机。
- 真实重复点击、系统相机取消、网络失败和部分模型失败仍需在完整照片链路中补验。

### 下一步

- 获得 Android 真机后依次完成登录、正面/左侧/右侧拍照、Check-in 自动完成、三视角分析和聚合结果展示。
- 联调时重点验证取消拍摄、重复点击、退出恢复、网络失败、单视角失败重试和缓存直接展示。

---

## 2026-07-30 — Step #10a 痘痘日记前端闭环 — ✅ 已完成

### 本次完成

- 新增 `mobile/src/lib/diary-api.ts`，接入真实 `PUT /check-ins/{id}/diary` 完整替换接口，支持传空对象清空日记。
- 新增 `mobile/src/lib/diary-form.ts`，实现已有日记恢复、空白字段清理、产品名称拆分去重、范围与长度校验、非法路由拦截和保存防重。
- 新增动态路由 `mobile/src/app/diary/[checkInId].tsx`，支持睡眠、压力、生理周期、饮食、护肤变化、产品和备注的可选填写；加载或保存失败均可重试，保存后可继续编辑。
- 将日记页加入登录与协议保护路由；真实分析结果页新增“记录今天的情况/编辑今日记录”入口。
- 修正模拟器验收中发现的退出按钮接线错误：已完成 Check-in 返回分析结果，草稿 Check-in 返回首页，按钮文案与目标路由保持一致。
- 新增 `mobile/tests/diary-api.test.mjs` 与 `mobile/tests/diary-form.test.mjs`。

### 验证情况

- 全部新增数据行为按 TDD 先观察失败，再完成最小实现；日记定向测试覆盖替换与清空请求、旧值恢复、输入规范化、边界校验、重复提交保护和退出路由。
- `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，单元测试为 57 passed。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。
- Pixel 8 模拟器使用现有登录态打开真实 Check-in 日记页，首次保存后数据库写入睡眠质量、压力、饮食标签和护肤变化；重新进入后对应选项自动恢复，再次修改并保存后数据库完成覆盖更新。
- 模拟器确认底部退出按钮在草稿 Check-in 中显示“返回首页”；完整分析结果到日记页的入口已完成代码接线，受 Step #9b-4 真机条件限制，尚未从真实分析结果手动点击验收。

### 当前阻塞或遗留

- 日记功能本身无阻塞。
- 从真实三视角分析结果点击进入日记页，仍需在具备合格真机照片并完成 Step #9b-4、#9c-3 后补做整条路径验收。

### 下一步

- 开始趋势功能的数据层和基础页面，优先复用后端现有趋势接口形成真实前后端闭环。
- 获得 Android 真机后，将日记入口纳入登录、三视角拍照、分析、日记的完整正向验收。

---

## 2026-07-30 — Step #10a 修正：日记保存竞态保护 — ✅ 已完成

### 本次完成

- 根据完成前代码审查修复保存期间仍可编辑和退出的问题：请求进行时禁用全部输入、选择项和退出按钮。
- 新增表单修订号、组件活动状态和 Check-in 编号三重响应校验；请求发出后的新输入、组件卸载后的响应或其他 Check-in 的过期响应均不能覆盖当前表单。
- 保存失败仍释放请求防重锁，用户留在当前页面并可重试。
- 将前端 `sleep_quality`、`stress_level` 类型收窄为 `1 | 2 | 3 | 4 | 5`，与后端契约一致。
- 补充精确合法边界测试：睡眠时长 0/24、评分 1/5、10 个且每个 80 字符的产品名、500 字符备注。

### 验证情况

- 新增修订保护测试先因函数不存在而失败；跨 Check-in 响应测试先得到错误的 `true`，实现作用域校验后通过。
- `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，单元测试为 61 passed，Lint 无警告。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。
- Pixel 8 模拟器使用真实 Check-in 再次完成编辑和保存，数据库与重载后的界面均恢复 `skincare_changed=true` 及原有日记字段。

### 当前阻塞或遗留

- 无。

### 下一步

- 完成复审后进入趋势功能的数据层和基础页面。

---

## 2026-07-30 — Step #10a 补充：保存期间原生导航保护 — ✅ 已完成

### 本次完成

- 补充保存期间的导航级保护：通过 `beforeRemove` 拦截 Android 系统返回和其他移除当前路由的导航动作。
- 保存期间动态关闭 iOS 原生返回手势；保存结束后自动恢复。
- 新增日记导航保护策略测试，确保非保存状态允许退出，保存状态同时阻止路由移除并关闭手势。

### 验证情况

- 新测试先因 `diaryNavigationProtection` 不存在而失败，实现后通过。
- `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，单元测试为 62 passed，Lint 无警告。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。

### 当前阻塞或遗留

- 无。

### 下一步

- 完成最终复审后进入趋势功能的数据层和基础页面。

---

## 2026-07-30 — Step #10a 修正：原生栈退出拦截方式 — ✅ 已完成

### 本次完成

- 复审确认 native stack 不应依赖手工 `beforeRemove.preventDefault()`；已改为 SDK 57 公开兼容入口 `expo-router/react-navigation` 的 `usePreventRemove`。
- 保留保存期间关闭 iOS 返回手势的配置，Android 系统返回和其他路由移除由 `usePreventRemove` 统一拦截。
- 未新增任何依赖。

### 验证情况

- 日记定向测试、`npm run typecheck` 和 `npm run lint` 均通过，Lint 无警告。

### 当前阻塞或遗留

- 无。

### 下一步

- 完成最终全量验证和复审后进入趋势功能。

---

## 2026-07-30 — Step #10a 最终验收补充 — ✅ 已完成

### 本次完成

- 完成日记前端闭环最终代码复审，确认此前保存竞态、过期响应、原生返回拦截和类型边界问题均已解决。
- 保持当前功能分支和工作区，不执行提交、推送或合并。

### 验证情况

- 最终复审结论为无 Critical、无 Important，Ready to merge。
- 移动端 `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，单元测试为 62 passed，Lint 无警告。
- 后端完整 `pytest` 为 44 passed，保留 1 条既有 Starlette/httpx2 弃用警告。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。
- 模拟器真实 Check-in 已完成首次保存、重新进入恢复、再次编辑覆盖和审查修正后的再次保存，数据库值与界面一致。

### 当前阻塞或遗留

- 日记功能无阻塞。
- 真正的“分析结果点击进入日记”仍随 Step #9b-4、#9c-3 等待合格 Android 真机做整条正向路径验收。

### 下一步

- 开始趋势数据层和基础页面，继续以真实后端接口优先完成基础功能闭环。

---

## 2026-07-30 — Step #10b 变化趋势前端基础闭环 — ✅ 已完成

### 本次完成

- 新增趋势数据层和受保护页面，接入真实 `GET /trends/summary?days=7|30|90`，默认展示 30 天并支持 7/30/90 天切换、加载失败重试和旧范围响应失效保护。
- 展示最新皮肤指数、有效记录、活跃/新增/已好转数量、每日记录、本期摘要及三视角重点区域概览；真实无数据和分析不完整状态均提供明确提示。
- 首页新增变化趋势入口；开发环境新增不写入后端的完整趋势预览，生产环境不能启用该夹具。
- 修正区域名称与后端 `mouth_area`、`jaw`、`temple` 枚举的映射，并保证有数据时正面、左侧、右侧各至少展示一个重点区域。
- 新增 `trend-api.ts`、`trend-flow.ts`、`trend-presenter.ts`、`trend-fixtures.ts` 及对应单元测试，未新增依赖。

### 验证情况

- `npm run typecheck`、`npm run lint`、`npm run test:unit` 全部通过，移动端单元测试为 73 passed，Lint 无警告。
- 后端完整 `pytest` 为 44 passed，保留 1 条既有 Starlette/httpx2 弃用警告。
- Pixel 8 模拟器已验证真实账号空状态、首页入口、开发完整数据、7/30/90 天切换，以及正面/左侧/右侧区域同时展示。
- `git diff --check -- backend/dev_notes.md mobile` 通过，仅有仓库既有的 LF/CRLF 转换提示。
- 最终代码复审无 Critical、无 Important，结论为 Ready。

### 当前阻塞或遗留

- 真实完整趋势数据仍依赖合格 Android 真机完成三视角拍照和分析；当前已用真实空响应与开发完整夹具分别验证空态和填充态。
- iOS VoiceOver 的动态错误提示语义尚未单独验收，不影响当前 Android 功能闭环。

### 下一步

- 获得 Android 真机后，完成登录、三视角拍照、Check-in 完成、三视角分析、聚合结果、日记和真实趋势数据的整条正向验收。
- 在基础闭环真实验收后，再进入区域生命周期详情和视觉细节打磨。

---

## 2026-08-03 — 竞品调研补充：消费级护肤追踪 App — ✅ 已完成

### 本次完成

- 更新 `docs/competitor_research.md` 的核对日期、结论摘要和中国市场参照。
- 更新 Acnie 旧条目，并新增 SkinX 祛痘清肤、护肤追踪器 - 美容日记、普弘肤质定制和 LumiLog 护肤日记。
- 按核心用户与任务重叠程度划分一级直接竞品、二级直接竞品和相邻竞品，并补充与本项目的差异、启示和待实测风险。
- 调整后续竞品体验清单，使验证顺序与竞争强度一致。

### 验证情况

- 已核对五款产品当前公开的 App Store 页面，并用 Acnie 产品官网交叉核对其功能范围。
- 已检查五个竞品条目、分类标题、旧 Acnie 拼写和旧开发者信息残留；结果符合本次更新范围。
- `git diff --check -- docs/competitor_research.md` 通过，仅有工作区既有的 LF/CRLF 转换提示。
- 本次仅修改 Markdown 调研内容，无代码测试项。

### 当前阻塞或遗留

- 当前结论主要来自公开页面，尚未逐款安装验证拍摄引导、趋势真实性、付费墙和数据传输边界。

### 下一步

- 优先实际体验 Acnie 与 SkinX，再验证护肤追踪器的离线主张和普弘肤质定制的事件复盘流程。
- 完成实测后，按目标用户、拍摄质量、日记维度、商业模式和隐私边界建立统一对比表。

---

## 2026-08-05 — 产品决策 D-043：变化事件与个人产品反应记忆 — ✅ 已完成

### 本次完成

- 在 design/product/app_product_co_creation_log.md 确认新的核心方向：MVP 入口由“每天坚持打卡”调整为“发现自己在意的皮肤变化时记录”。
- 将个人产品柜、实际使用组合、后续好转／无变化／加重／不适记录，以及相似历史复盘确认为核心数据闭环。
- 明确目标输出采用个人历史证据归纳：可以展示过去更常伴随好转或不适的记录，但不直接告诉用户当前应该使用什么产品。
- 同步修正 D-002 与 D-007 的历史状态，并记录对 D-008、D-010、D-017、D-021 和 I-005 的后续影响。

### 验证情况

- 检查全部产品决策编号，无重复编号。
- 检查 D-043 标题及两处历史决策引用，编号一致。
- git diff --check -- design/product/app_product_co_creation_log.md 通过，仅有仓库既有的 LF/CRLF 转换提示。
- 本次仅修改产品设计文档和进度日志，无代码测试项。

### 当前阻塞或遗留

- 无外部阻塞。
- 产品柜首版字段、后续反应追问节奏、相似历史匹配方式、规律展示门槛，以及事件记录与周期性标准拍摄的关系仍待设计。

### 下一步

- 由用户复核 D-043 是否准确表达产品初衷与边界。
- 复核通过后，优先设计“当时状态—实际使用—后来怎样”的最小事件数据闭环，再决定对现有移动端 Check-in 流程的影响。

---

## 2026-08-06 — 核心产品设计文档结构重构 — ✅ 已完成

### 本次完成

- 将 design/product/app_product_co_creation_log.md 从按讨论时间线累积的共创记录，重构为面向当前决策的核心产品设计规范。
- 明确“区域变化事件与个人产品反应记忆”为第一核心，并将证据底座、长期价值、条件性价值和体验表达划分为不同优先级。
- 按产品核心、价值层级、核心闭环、功能模块、信息架构、数据语义、内容语言、视觉系统、MVP、验证指标和决策状态重新组织全文。
- 将既有 D-048 至 D-058 的有效结论吸收进对应功能模块，并把每日打卡、默认三视角、皮肤评分、开放式 AI 问答等旧方向统一归入已废止或被取代的决策。
- 补充 AI 不可用时的记录降级路径，以及相似历史按区域可比性和时间组织、不得按产品效果排序的边界。

### 验证情况

- 已逐节复核重构后的 761 行文档，检查核心定位、价值层级、产品闭环、功能模块、MVP 和现行决策之间的一致性。
- 已扫描 TBD、TODO、待定、待确认等占位内容，未发现未处理占位项。
- 已检查每日打卡、默认三视角、皮肤评分、固定每日提醒等旧逻辑，仅保留在明确的排除范围、废止决策或现有实现偏差说明中。
- git diff --check -- design/product/app_product_co_creation_log.md backend/dev_notes.md 通过，仅有仓库既有的 LF/CRLF 转换提示。
- 本次仅修改产品设计文档和进度日志，无代码测试项。

### 当前阻塞或遗留

- 无外部阻塞。
- project_background.md、平台策略、产品路线图和现有移动端页面尚未同步新主线；核心文档第十三、十四节已明确待验证问题与实现偏差。

### 下一步

- 由用户复核新的产品定位、价值层级、功能边界与 MVP 范围。
- 复核通过后，先同步项目背景、平台策略与路线图，再设计数据模型、信息架构和核心页面流，最后形成实施计划。

---

## 2026-08-07 — 新产品主线用户操作流程图 — ✅ 已完成

### 本次完成

- 基于 `design/product/skin_care_app_product_spec.md` 当前单一事实源，将新产品主线整理为适合产品评审与 vibe coding 的“1 张全局图 + 3 张关键子流程图”。
- 新增全局用户操作流程，覆盖首次进入、观察首页三类记录入口、不对称生活背景入口、核心证据闭环、历程、个人产品反应记忆和数据控制。
- 新增“记录现在的变化”子流程，覆盖按需授权、拍摄与上传、三档照片质量处理、AI 降级、区域确认和事件归属。
- 新增“产品使用与后续观察”子流程，覆盖产品库、临时产品、组合使用、事件关联、观察提醒、后续记录和七天阶段摘要门槛。
- 新增“历程、相似历史与个人产品反应记忆”子流程，覆盖照片遮盖、相似历史硬门槛、渐进式证据状态、源记录删除与派生结果重算。
- 关键文件位于 `design/product/user_flows/`，每张图同时提供可编辑 SVG 和 PNG 预览。

### 验证情况

- 使用 PowerShell XML 解析检查 4 个 SVG，全部通过结构有效性验证。
- 使用本机 Chrome headless 将 4 个 SVG 渲染为 PNG，未安装新依赖。
- 逐张完成视觉检查；文字、节点和最终分支均完整显示，无底部裁切。
- 对照核心产品文档检查了 AI 不可用、照片不可比、事件归属不确定、产品缺失、组合证据、七天阶段摘要、三段独立事件、照片默认遮盖和删除重算等关键规则。
- 本次仅新增产品流程图与进度记录，无代码测试项。

### 当前阻塞或遗留

- 无。

### 下一步

- 产品评审时优先检查四张图中的事件归属、产品使用关联、证据门槛和长期记忆是否符合预期。
- 流程确认后，以流程节点为基础继续拆分目标页面、页面状态、接口与现有移动端改造顺序。

---

## 2026-08-08 — 新产品主线后端实施规划 — ✅ 已完成

### 本次完成

- 基于 `design/product/skin_care_app_product_spec.md` 与现有后端代码，新增 `docs/superpowers/plans/2026-08-07-backend-product-redesign.md`。
- 划分 API 契约、鉴权授权、原始证据、区域事件、固定 AI、产品库与产品柜、实际使用、后续事实、提醒、生活背景、派生记忆、历程趋势、数据控制和旧接口迁移等主要模块。
- 明确 0013-0019 数据库迁移、13 个 TDD 实施任务、开发顺序和分阶段验收标准。
- 冻结 51 个接口条目的请求/响应、错误码、Bearer 鉴权、能力授权、幂等键、游标分页和核心状态机。

### 验证情况

- 最终计划共 1178 行、13 个实施任务、51 个接口条目；52 个 Markdown 代码围栏成对。
- 占位符扫描为 0；产品 MVP、鉴权、幂等、分页和状态机共 19 项关键覆盖检查全部命中。
- `git diff --check -- docs/superpowers/plans/2026-08-07-backend-product-redesign.md` 通过。
- 本次仅生成后端实施规划并更新进度日志，未修改后端代码，因此无代码测试项。

### 当前阻塞或遗留

- 无。
- 计划尚未开始实施；旧 Check-in、默认三视角、皮肤评分、旧趋势和 AI 问答仍存在于当前代码。

### 下一步

- 从 Task 1 开始实现统一错误、游标分页、移动端写请求幂等和照片/AI capability consent。
- 每完成一个 Task 立即执行对应迁移与测试，并追加本日志。

---

## 2026-08-08 — 第一次记录即时价值设计收敛 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_product_spec.md`，将第一次记录的即时任务明确为“把这次变化说清楚、留清楚”，不再仅把单次记录描述为等待长期价值的上传结果。
- 将首次流程收敛为一张当前引导照片、一次关注位置确认和一张“这次变化卡”；卡片按“我注意到的、照片留下的事实、目前知道的、目前还不知道的”组织。
- 明确第一次卡片独立成立，不以产品、生活背景、提醒或后续记录作为完成条件；AI 不可用时降级为不含虚构观察的事实卡片。
- 明确不导入拍摄条件不可控的旧照片，也不自动扫描相册缩短冷启动；只有按照当前引导形成且达到比较条件的记录才进入连续比较。
- 同步更新核心闭环、冷启动、核心入口、区域变化事件、拍摄边界、记录反馈、MVP 范围、数据不足行为、激活指标和当前有效决策。

### 验证情况

- 完整检查修改后的 899 行产品文档；6 项关键设计表述全部命中。
- 占位符扫描为 0，行尾空白为 0，Markdown 代码围栏数量为 0 且结构检查通过。
- 本次仅修改产品设计文档和进度日志，无代码测试项。

### 当前阻塞或遗留

- 无。
- 第一次记录即时价值已经收敛；少量记录阶段如何继续兑现价值尚待后续产品讨论，本次未扩展其他候选修改。

### 下一步

- 由用户复核第一次记录的当前梳理价值是否准确。
- 复核通过后，再单独讨论少量记录阶段的价值设计；未确认前不扩展其他产品问题。

---

## 2026-08-08 — 区域新增痘痘的事件归属规则 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_product_spec.md`，吸收本次对痤疮临床随访和研究记录方式的调研结论。
- 明确首版按区域维护一段持续观察：同一区域新增痘痘或其他可见变化默认成为当前事件的新时间点，不自动拆分，也不追踪单颗痘痘身份。
- 保留低频二级入口“作为另一段变化记录”；只有用户主动认为属于另一段变化时才拆分，不要求每次拍摄都判断事件归属。
- 明确 30 天暂停只是产品收纳和后续归属规则，不具有医学时间含义，也不代表痊愈、结束或失败。
- 在产品文档中补充 NICE、FDA 的整体／区域随访依据，以及单颗纵向追踪只适合专门研究而不适合作为消费级 MVP 用户任务的取舍说明。
- 同步更新事件成立与归属、区域变化事件模块、核心数据语义、用户侧命名、验证指标和当前有效决策。

### 验证情况

- 完整检查修改后的 914 行产品文档；6 项区域持续观察关键表述全部命中。
- 占位符扫描为 0，行尾空白为 0；同一区域、单颗追踪、用户主动拆分和 30 天暂停相关引用已逐项检查。
- 本次仅修改产品设计文档和进度日志，无代码测试项。

### 当前阻塞或遗留

- 无。
- 现有后端实施计划尚未按新的“区域持续观察＋默认合并时间点”语义复核，开始相关数据模型和 API 实现前需要同步。

### 下一步

- 后续规划区域事件数据模型时，将事件与事件时间点分层，并以默认续接、用户主动拆分作为归属规则。
- 在实现前复核现有后端计划中的事件唯一约束、匹配逻辑和接口文案，避免继续沿用单颗或自动拆分语义。

---

## 2026-08-08 — 照片缺失或不可比时的连续趋势方案 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_product_spec.md`，明确首页仍以拍摄作为默认动作，照片负责提供可见证据并由系统分析，但照片不是记录成立的必要条件。
- 明确三种输入情况使用同一套记录结构：照片可比较时由系统整理，照片无法补全比较信息时由用户补足，当天没有照片时由用户直接记录当前皮肤状态。
- 新增统一趋势点语义；照片分析、用户补充和无照片自述进入同一事件时间点与同一条个人趋势，不新增并列的手动记录功能或第二条趋势。
- 将当前皮肤状态、个人感受和实际外用产品使用组织在同一时间点；产品使用只参与时间关联整理，不被表达为导致变化的原因。
- 保留照片证据边界：照片比较结论仍要求可比较照片；个人趋势可以使用用户状态记录，趋势摘要必须说明由照片、用户记录或两者共同支持。
- 同步修改产品定位、证据底座、主闭环、冷启动、核心入口、拍摄降级、AI 固定能力、首页行为、核心数据语义、MVP 范围、数据不足行为和当前有效决策。

### 验证情况

- 完整检查修改后的 943 行产品文档；6 项统一趋势关键表述全部命中且各出现 1 次。
- 4 项旧规则残留检查均为 0，包括“照片不可比不纳入连续比较”和“只有可比较照片才进入连续变化判断”。
- 占位符扫描为 0，行尾空白为 0，Markdown 代码围栏数量为 0；`git diff --check -- design/product/skin_care_app_product_spec.md` 通过。
- 本次只修改产品设计文档与进度日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- 无产品设计阻塞。
- 统一趋势点尚未进入后端数据模型、API 和移动端实现；现有后端实施计划仍需在开发前补充无照片状态记录、信息来源和混合依据摘要语义。

### 下一步

- 继续讨论并收敛其余产品核心问题；若转入开发，先同步后端实施计划中的事件时间点结构、证据来源和趋势摘要门槛，再开始实现。

---

## 2026-08-08 — 三组核心产品张力收敛 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_product_spec.md`，将“证据可信与低记录负担”收敛为“记录方式允许降级，结论不能伪装”；照片可比性只限制照片比较结论，不再决定记录能否进入个人趋势。
- 将“不做因果判断与产品使用分析”收敛为个人时间关联分析：允许统计多段独立事件中产品使用后的趋势方向，并按当前倾向、支持依据、相似之处、不同之处和未知因素组织产品反应记忆；禁止表达疗效、适合度或再次使用建议。
- 将“温和克制与实际帮助”收敛为条件性整体趋势判断：证据允许时明确输出整体缓和、更明显、基本稳定或变化混合；证据不足时明确说明不足，不再用事实堆叠回避判断。
- 强化 AI 的产品角色：AI 负责观察、比较、归纳和解释，但不作为独立入口或首页卖点，也不拥有高于用户自我观察的默认裁决权。
- 将已确认的首页主标题“看见变化，也看懂变化。”与副标题“基于真实照片与使用记录，呈现可追溯的个人皮肤变化趋势。”写入核心承诺、首页职责和当前有效决策。
- 同步修改产品方案取舍原则、趋势与产品反应记忆、证据门槛、AI 固定能力、输出安全、允许与禁止表达、MVP、验证指标及当前有效决策。

### 验证情况

- 完整检查修改后的 976 行产品文档；9 项三组张力关键表述全部命中。
- 5 项旧规则残留检查均为 0，包括“AI 只是证据整理能力”“不得概括整体变化”和“条件不足就不纳入连续判断”。
- 占位符扫描为 0，行尾空白为 0，Markdown 代码围栏数量为 0；`git diff --check -- design/product/skin_care_app_product_spec.md` 通过。
- 本次只修改产品设计文档与进度日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- 无产品设计阻塞。
- 现有后端实施计划与移动端仍未覆盖条件性整体趋势、产品时间关联的结构化输出，以及照片可比性与趋势有效性的分层规则。

### 下一步

- 由用户复核三组张力的最终落档表述。
- 若确认产品设计可以进入开发，先同步后端实施计划和移动端页面流，再按新的统一趋势点、整体趋势判断和产品时间关联语义实施。

---

## 2026-08-08 — 第二组张力建议边界复核 — 🚧 进行中

### 本次完成

- 重新明确用户目标：系统不应只展示证据，而应在触及医疗边界前尽可能形成结论并提供有效建议。
- 初步复核中国医疗器械法规与国际软件医疗器械监管框架；监管判断主要取决于产品预期用途和实际功能，不会因增加免责声明而自动变为普通消费级工具。
- 初步划分消费级产品可继续深入的方向：个人趋势结论、产品使用后的个人时间关联、相似与差异分析、未知因素、下一步记录建议和专业咨询准备。
- 明确需要进一步确认的高风险方向：根据个人照片和记录直接建议开始、继续、停止、更换、组合或调整药品使用。
- 本次未修改产品设计正文，等待产品监管路线确认后再收敛第二组张力。

### 验证情况

- 已核对中国《医疗器械监督管理条例》对包含计算机软件的医疗器械及疾病诊断、预防、监护、治疗或缓解目的的定义。
- 已交叉核对 FDA 与 IMDRF 关于医疗目的软件、患者特异性输出及临床管理信息的公开框架。
- 本次为产品与监管边界研究，无代码测试项。

### 当前阻塞或遗留

- 等待用户确认 MVP 是保持普通消费级皮肤管理工具，还是愿意承担医疗器械软件路线的注册、临床评价和质量体系成本。
- 具体上市地区尚未确认；不同司法辖区的最终分类需要当地专业合规意见，当前研究不能替代正式法律意见或监管分类确认。

### 下一步

- 根据用户选择的产品路线，分别明确“可以直接建议、只能提供决策支持、必须阻断”的输出清单，再更新产品设计文档。

---

## 2026-08-08 — 第二组张力消费级路线确认 — 🚧 进行中

### 本次完成

- 用户确认 MVP 不按医疗器械软件路线注册，也不提供需要医疗资质支撑的具体诊疗或用药指令。
- 第二组张力的目标范围收敛为两层：AI 可以给出明确的个人结论，并提供不替用户选择治疗方案的决策支持建议。
- 初步确定推荐方向为“证据引导型决策支持”：解释当前结论、指出最相关的个人历史、比较相似与差异、说明未知因素，并建议下一步如何观察、核实、回顾或准备专业咨询。
- 初步排除以证据包装的隐性产品选择，例如“更适合你”“优先考虑”“建议再次使用”；即使不出现直接用药指令，此类表达仍会让产品实质承担产品选择责任。
- 本次未修改产品设计正文，等待用户确认最终能力边界。

### 验证情况

- 已将用户选择与前一条“第二组张力建议边界复核”记录对照，消费级路线和不走医疗器械注册的前提已明确。
- 本次为产品边界收敛，无代码测试项。

### 当前阻塞或遗留

- 等待用户确认：AI 可以明确给结论，并建议如何观察、核实、回顾或咨询，但不能替用户选择、开始、继续、停止、更换或组合具体产品和药品。

### 下一步

- 用户确认后，将个人结论、证据解释、决策支持建议和禁止医疗指令四层输出规则写入产品设计文档，并替换当前过于笼统的边界表述。

---

## 2026-08-08 — 第二组张力消费级决策支持定稿 — ✅ 已完成

### 本次完成

- 根据用户确认的不走医疗器械软件路线，更新 `design/product/skin_care_app_product_spec.md`，将第二组张力正式收敛为消费级“证据引导型决策支持”。
- 新增核心差异化：产品不只保存和罗列个人历史，而是将其转化为明确结论、依据解释、参考价值判断和下一步非治疗型行动建议。
- 固定四段式输出：“个人结论—为什么这样判断—这次有多大参考价值—下一步可以做什么”。
- 将允许的下一步建议限定为继续观察、补全关键信息、回顾相关历史，以及整理记录以准备向医生或药师咨询；每条建议必须能追溯到个人证据或明确缺失信息。
- 明确排除隐性产品选择：禁止“更值得考虑”“优先尝试”“更适合你”等表达，也不允许把证据数量或重复倾向转化为开始、继续、停止、更换、组合、剂量、频次或疗程指令。
- 正常个人结论和决策支持不再重复展示大段免责文案；只有输出进入诊断、治疗、具体用药决策或医疗风险时才阻断越界分析。
- 同步修改产品定位、核心承诺、方案取舍原则、产品反应记忆、AI 固定能力、输出安全、事件与产品详情结构、核心数据语义、允许与禁止表达、MVP、数据不足行为、验证指标和当前有效决策。

### 验证情况

- 完整检查修改后的 1020 行产品文档；10 项决策支持关键表述全部命中且各出现 1 次。
- “证据引导型决策支持”章节和“决策支持建议”数据语义均唯一存在；3 项旧规则残留检查为 0。
- 占位符扫描为 0，行尾空白为 0，Markdown 代码围栏数量为 0；`git diff --check -- design/product/skin_care_app_product_spec.md` 通过。
- 本次只修改产品设计文档与进度日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- 无产品设计阻塞。
- 现有后端实施计划和移动端页面流尚未覆盖四段式决策支持输出、建议来源追溯与隐性产品推荐拦截。

### 下一步

- 由用户复核第二组张力的最终产品边界和竞争性表达。
- 若确认进入开发，先同步后端实施计划中的派生结果结构、合规扫描规则与接口返回，再更新事件详情和产品详情页面流。

---

## 2026-08-08 — AcneTrack 竞品调研 — ✅ 已完成

### 本次完成

- 更新 `docs/competitor_research.md`，将法国 AcneTrack 列为海外一级直接竞品，并把文档最后核对日期更新为 2026-08-08。
- 基于官网、App Store、Google Play、隐私政策和服务条款，补充其主体与市场状态、问卷和扫描闭环、跨日趋势、单个痘点演化、产品/食物扫描、AI 教练、订阅模式、医疗声明和数据处理方式。
- 将厂商自报数据、公开可证实能力和仍需实测的能力分开记录；补充 3D 扫描实际数据流、CE/ISO 宣称适用范围不明、付费墙位置及法律文件口径差异等风险。
- 根据该竞品修正定位结论：中立与非卖自有产品是信任底线，但不足以独立区隔；差异化进一步聚焦为证据可追溯、不确定性表达、照片与用户记录分层，以及关联而非因果。
- 在后续竞品体验清单中新增 AcneTrack 专项实测，覆盖扫描质量门槛、重复扫描稳定性、诱因证据链、Evolution、Pimple Scan、数据删除和付费墙。

### 验证情况

- 已逐项核对 AcneTrack 官网、美国 App Store、Google Play、2026-03-13 版隐私政策和 2025-03-31 版服务条款。
- `rg` 检查确认文档核对日期、AcneTrack 一级竞品章节、隐私分析、定位修正和专项体验任务均已落位。
- `git diff --check -- docs/competitor_research.md` 通过；仅有 Git 的 LF/CRLF 行尾转换提示，无空白错误。
- 本次只修改竞品调研与进度日志，无代码测试项。

### 当前阻塞或遗留

- 无文档阻塞。
- 尚未安装和实际体验 AcneTrack；首次扫描质量门槛、跨日对齐、分数稳定性、诱因依据、真实免费额度和账号删除结果仍待真机验证。

### 下一步

- 在可使用的 iOS 或 Android 真机上按竞品体验清单完整录屏，并用同图重复、不同角度和不同光线三组样本测试输出稳定性。
- 若返回产品开发主线，先同步新版后端实施计划中的统一趋势、四段式决策支持和隐性产品推荐拦截，再开始实现。

---

## 2026-08-08 — AcneTrack 竞品调研修正与模板定位 — ✅ 已完成

### 本次完成

- 补充修正 2026-08-08 的“AcneTrack 竞品调研”：AcneTrack 并非只在美国和英国上架，中国大陆 App Store 已有可下载页面、人民币内购和少量评分。
- 明确其当前商店语言仍标为英语，版本说明只确认法语、德语、西班牙语和韩语完整翻译，尚无中文本地化；据此将判断收敛为“短期中国市场威胁有限”，而不是“未进入中国市场”。
- 在 `docs/competitor_research.md` 中新增“作为参考模板的价值”，明确重点参考首次问卷、扫描、首份报告、日常任务、连续打卡、Evolution、前后对比和订阅付费墙组成的激活、留存与商业闭环。
- 明确参考边界：吸收任务顺序、反馈节奏和信息组织，不照搬强因果诱因判断、医疗级营销、未来皮肤效果暗示和不透明的数据规则。
- 补充本项目的本地竞争空间：中文语境、本土产品库、国内合规适配，以及可追溯证据和不确定性表达。

### 验证情况

- 已核对中国大陆 App Store 官方页面，确认应用页面、人民币内购、商店语言和版本多语言说明均存在。
- `rg` 检查确认“中国大陆 App Store”“参考模板”“短期中国市场威胁有限”“尚无中文本地化”和“不照搬”等关键结论均已写入竞品文档。
- `git diff --check -- docs/competitor_research.md` 通过；仅有 Git 的 LF/CRLF 行尾转换提示，无空白错误。
- 本次仅修改竞品调研和进度日志，无代码测试项。

### 当前阻塞或遗留

- 无文档阻塞。
- 商店页面不能证明实际 App 内所有语言资源和中国网络环境下的 AI 能力均可用，仍需真机体验。

### 下一步

- 真机体验时优先验证中国区账号下载、注册与订阅流程，以及实际界面语言、AI 服务可达性和本土产品识别能力。
- 将 AcneTrack 的激活、留存和付费节点拆成对照表，再与本项目的第一条记录闭环逐项比较取舍。

---

## 2026-08-12 — 最新产品设计后端实施规划修订 — ✅ 已完成

### 本次完成

- 以 2026-08-08 最新产品设计为唯一产品基线，重写后端实施计划，替换旧的 Check-in、默认三视角、皮肤评分和开放式问答中心方案。
- 将后端划分为记录编排、统一趋势点、区域变化事件、照片与关注位置、AI 事实合并、产品与真实使用、生活背景与提醒、趋势/相似历史/产品记忆、数据控制等主要模块。
- 完整规划数据库表与约束、59 条 API、请求/响应契约、错误码、Bearer 鉴权、幂等、seek cursor 分页、ETag 并发控制和各领域状态机。
- 将开发拆为 15 个按依赖排序的可验证任务，覆盖迁移、服务、接口、测试、旧数据降级回填和上线验收。
- 复核并补齐相似历史的四段式决策支持，以及每次最多一个结构化追问的产品约束。
- 新规划文件为 `docs/superpowers/plans/2026-08-12-backend-product-redesign.md`；旧的 `docs/superpowers/plans/2026-08-07-backend-product-redesign.md` 已移除，避免继续按过期产品方向实施。

### 验证情况

- 逐项检查无照片记录、统一 Observation、关注位置、用户事实优先、primary/parallel 事件、7 天个人趋势门槛、照片比较独立门槛、真实使用关联、相似历史、产品记忆、生活背景、提醒、照片不可变、Provider 隐私、数据导出删除、旧数据降级、鉴权、幂等和分页，未发现覆盖缺项。
- 结构校验结果：1267 行、15 个实施任务、59 个接口条目、50 个代码围栏且成对、占位符 0。
- `git diff --check -- docs/superpowers/plans/2026-08-12-backend-product-redesign.md` 通过，无空白错误。
- 本次仅修订实施规划与进度日志，未修改后端代码，因此无代码测试、数据库迁移或接口运行验证。

### 当前阻塞或遗留

- 无规划阻塞。
- 15 个任务均尚未进入代码实现；具体实现结果需在逐任务开发后验证。

### 下一步

- 从 Task 1 开始实现统一契约、Idempotency-Key、seek cursor、Provider 能力门和授权快照。
- 随后按计划依次执行数据库迁移、统一趋势点、事件归属、AI 合并、产品使用、派生摘要、数据控制和旧数据回填。

---

## 2026-08-18 — 当前分支合并准备检查 — ⏸ 阻塞

### 本次完成

- 检查 `feat/mobile-check-in-flow` 相对本地及远端 `main` 的提交关系；本地 `main` 与 `origin/main` 一致，当前分支仅领先 1 个已提交变更，可通过快进方式合并。
- 确认已有独立工作树 `D:\Mia\llm_learn_worktrees\backend-product-redesign`，分支为 `refactor/backend-product-redesign`，当前基于 `main` 且工作区干净。
- 识别当前普通工作区的未提交内容：本项目产品设计、流程图、后端规划和开发日志，以及仓库根目录下与本项目无关的 GPU 笔记改动；这些内容不能整体混合提交。

### 验证情况

- 后端全量测试：44 passed，1 条第三方弃用警告。
- 移动端单元测试：73 passed；`npm run typecheck` 和 `npm run lint` 均通过。
- `git diff --check` 未发现空白错误，仅有 LF/CRLF 行尾转换提示。
- 尚未执行提交、切换分支或合并操作。

### 当前阻塞或遗留

- 等待用户确认是否将本项目范围内的未提交产品设计、流程图、规划和日志整理提交到当前分支。
- 仓库根目录的 GPU 笔记改动必须排除并原样保留。

### 下一步

- 用户确认后，仅暂存 `projects/skin_care_agent` 范围内经复核的变更，分批提交并再次运行质量门。
- 将 `feat/mobile-check-in-flow` 快进合并到 `main`，合并后重跑测试，再让现有 `refactor/backend-product-redesign` 工作树同步最新 `main` 并开始 Task 1。

---

## 2026-08-18 — Skin Care 项目变更合并到 main — ✅ 已完成

### 本次完成

- 仅暂存并提交 `projects/skin_care_agent` 范围内的产品设计、用户流程图、竞品与环境说明、后端实施规划、启动说明和开发日志。
- 提交 `f0804a2`（`docs(skin-care): sync product design and backend plan`），未包含仓库根目录的 GPU 笔记改动。
- 将 `feat/mobile-check-in-flow` 通过 fast-forward 合并到本地 `main`；合并前已执行 `git pull --ff-only`，本地 `main` 当时与 `origin/main` 一致。

### 验证情况

- 合并后的后端全量测试通过：44 passed；保留 1 条 Starlette/httpx 第三方弃用警告。
- 合并后的移动端单元测试通过：73 passed。
- 合并后的 `npm run typecheck` 与 `npm run lint` 均通过。
- 暂存区空白检查通过；GPU 目录的删除和新增文件仍保持未暂存、未修改状态。

### 当前阻塞或遗留

- 无本地合并阻塞。
- 本地 `main` 尚未推送；远端更新需用户另行授权。
- Starlette TestClient 的 httpx 弃用警告后续单独处理，不影响本次合并。

### 下一步

- 将现有 `refactor/backend-product-redesign` 工作树快进同步到最新本地 `main`。
- 在该隔离工作树中按 `docs/superpowers/plans/2026-08-12-backend-product-redesign.md` 从 Task 1 开始实施。

---

## 2026-08-18 — 后端重构工作树同步 — ✅ 已完成

### 本次完成

- 将 `refactor/backend-product-redesign` 工作树通过 fast-forward 同步到本地 `main` 的合并结果。
- 保留旧本地分支 `feat/mobile-check-in-flow`：普通安全删除因其本地提交尚未存在于对应远端分支而被 Git 拒绝，未使用强制删除。
- 新检测到的未跟踪目录 `projects/skin_care_agent/design/原型/` 以及仓库根目录 GPU 改动均未暂存、未修改。

### 验证情况

- `git rev-list --left-right --count main...refactor/backend-product-redesign` 返回 `0 0`，同步时两分支内容一致。
- 后端工作树同步过程为 fast-forward，无冲突。
- 合并后的完整质量门结果沿用上一条记录：后端 44 项、移动端 73 项通过，类型检查和 lint 通过。

### 当前阻塞或遗留

- 无后端实施工作树阻塞。
- 本地 `main` 尚未推送，旧本地功能分支尚未强制删除。

### 下一步

- 在 `D:\Mia\llm_learn_worktrees\backend-product-redesign` 开始后端规划 Task 1。

---

## 2026-08-19 — MVP 产品范围收敛与独立定义 — ✅ 已完成

### 本次完成

- 新增 `design/product/skin_care_app_mvp_spec.md`，明确当前 MVP 的核心判断、版本边界、单张照片与单一关注位置模型、核心闭环、信息架构、必要页面、证据门槛、AI 边界、隐私控制、验收条件和开发取舍顺序。
- 将首页收敛为一个皮肤变化主入口；“记录刚刚使用”改为主卡之外的独立快捷入口。
- 将正面、左侧、右侧三视角记录退出 MVP，只在数据模型层保留未来多照片扩展能力。
- 将包装照片识别、OCR 产品建档和图像特征相似历史排序移入后续版本。
- 同步修改 `design/product/skin_care_app_product_spec.md`，使长期产品文档与独立 MVP 文档保持一致，并添加 MVP 文档入口。

### 验证情况

- 检查 MVP 文档全部 585 行和 58 个标题，版本边界、首页层级、证据规则、发布阻断项与现有实现关系均已落位。
- 主产品文档中“做一次完整记录”、三视角首页入口、主卡内并列次级操作等 5 项旧规则残留均为 0。
- 两份文档明确把三视角、包装识别和图像特征相似度排序放在 MVP 之外。
- MVP 文档占位符为 0、长破折号为 0、行尾空白为 0；`git diff --check` 通过。
- 本次只修改产品文档和进度日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- 无文档结构阻塞。
- 新 MVP 文档等待用户审阅；现有 2026-08-12 后端实施计划仍覆盖较大的旧范围，需要在进入代码开发前按新 MVP 边界重新收敛。

### 下一步

- 由用户审阅 `design/product/skin_care_app_mvp_spec.md`，确认必须提供、明确不做和开发取舍顺序。
- 用户确认后，按新 MVP 文档修订后端实施计划与移动端页面流，再进入代码实现。

---

## 2026-08-19 — v0 原型提示词归档 — ✅ 已完成

### 本次完成

- 新增 `design/原型/v0_app_prompts.txt`，按会话原文保存第一次完整原型生成提示词和 MVP 审计后的首页改造提示词。
- 使用纯文本格式保存，便于逐字阅读，也避免新增未明确要求的 Markdown 文档。

### 验证情况

- 归档文件共 776 行；两段提示词标题、开头和最终验收句均各出现 1 次。
- 第一段提示词位于第 8 行，第二段提示词位于第 641 行；行尾空白为 0。
- 本次只新增提示词归档并更新进度日志，无代码测试项。

### 当前阻塞或遗留

- 无。

### 下一步

- 后续给 v0 的重要增量提示词继续追加到同一归档文件，并注明用途。

---

## 2026-08-19 — MVP 用户多区域关注模型 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_mvp_spec.md`，将一次记录从单一关注位置调整为用户主动选择一个或多个固定面部区域。
- 一张照片可以为多个已选区域分别生成事件时间点，各时间点共用原始照片、拍摄时间和拍摄条件，并按区域独立积累趋势。
- AI 只分析和展示用户确认的区域；未选择区域表示本次没有观察，不能解释为没有变化或状态稳定。
- 后续记录提供上次关注区域的快捷选项，用户确认后可以沿用、增加或移除；系统不追踪单颗痘痘，也不生成跨区域综合结论。
- 同步更新核心闭环、必要页面、照片可比性、AI 边界、降级规则、验收条件、发布阻断项和现有实现关系。

### 验证情况

- MVP 文档共 594 行、58 个标题；单一关注位置等旧规则残留为 0，多区域核心规则命中 16 行。
- 占位符和行尾空白均为 0。
- 检查记录模型、首次与后续流程、页面状态、证据门槛、AI 边界和验收规则，均使用同一套多区域语义。
- 本次只修改产品文档和开发日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- `design/product/skin_care_app_product_spec.md` 仍保留“一个主要关注位置”的旧规则，本次按用户要求未修改，后续需要同步。
- 2026-08-12 后端实施计划和移动端页面流尚未按新的多区域模型收敛。

### 下一步

- 用户确认 MVP 文档后，同步长期产品文档中的关注区域规则。
- 按多区域模型修订后端实施计划与移动端页面流，再进入代码实现。

---

## 2026-08-19 — MVP AI 可量化外观分析边界 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_mvp_spec.md`，将 AI 单次照片能力从笼统的中性事实整理扩展为按用户已选区域进行可量化外观观察。
- 明确数量估算的四种结果：未见明确点状变化、约数、数量区间和无法可靠计数；数量较多、连片或照片质量不足时不强行输出精确数字。
- 将空间分布拆为分布形态、覆盖范围和主要位置；分布形态覆盖单处、零散、单片集中、多片集中、广泛散布、连片、混合和无法判断八种状态。
- 固定可见外观词表，包含泛红、凸起、带白色顶点、平坦红色或褐色印记、脱屑、干燥和局部反光，不使用医学皮损分类。
- 明确跨时间照片比较可以覆盖估算数量、覆盖范围、分布形态、泛红范围、凸起与表面状态和平坦色印，不追踪单颗痘痘身份。
- 同步更新核心价值、版本边界、首次记录流程、这次变化卡、证据维度、验收条件、发布阻断项和现有实现关系。

### 验证情况

- MVP 文档共 680 行、64 个标题；八种分布形态全部存在。
- 与估算数量冲突的禁止规则为 0；医学皮损分类、医学严重度、全脸总数和皮肤评分仍保持禁止。
- 占位符和行尾空白均为 0。
- 本次只修改产品文档和开发日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- `design/product/skin_care_app_product_spec.md` 尚未同步多区域模型和可量化外观分析边界。
- 后端实施计划、AI 输出 schema、合规扫描和移动端变化卡尚未按新规则修订。

### 下一步

- 用户确认 MVP 文档后，同步长期产品文档。
- 再按 MVP 规则收敛后端实施计划和移动端页面流，明确 AI 字段、降级值与测试样例。

---

## 2026-08-19 — MVP 区域趋势与时间上下文定稿 — ✅ 已完成

### 本次完成

- 更新 `design/product/skin_care_app_mvp_spec.md`，将趋势收敛为同一区域可见状态随时间的变化，明确切换本次关注区域不会结束、重置或污染其他区域的历史。
- 将一个有效时间点定义为基线、两个有效时间点定义为前后变化、至少三个有效时间点且跨度不少于 7 天定义为阶段趋势。
- 明确事件详情使用按时间排列的区域状态时间线，不以综合皮肤分数作为纵轴，也不强制绘制连续折线；缺失日期保留空档，不做插值或状态推测。
- 将产品使用和生活背景从趋势方向计算中分离，只按真实发生时间作为时间点或观察区间的上下文展示。
- 将跨事件产品反应记忆、关联度计算和“形成个人规律”结论移出 MVP，保留实际使用记录和历史回看。
- 同步调整版本边界、核心模型、核心闭环、信息架构、必要页面、证据门槛、AI 边界、删除重算、验收条件、发布阻断项和实现约束。

### 验证情况

- MVP 文档共 713 行、65 个标题。
- 旧的“两个时间点形成阶段趋势”规则残留为 0；产品反应记忆仅保留在明确不做和后续进入条件中。
- 占位符、长破折号和行尾空白均为 0；关键章节人工复核通过。
- 本次只修改产品文档和开发日志，未修改代码，因此无代码测试项。

### 当前阻塞或遗留

- `design/product/skin_care_app_product_spec.md` 仍保留完整产品的产品反应记忆和旧趋势门槛；它是长期版本设计，本次按用户要求未同步。
- 后端实施计划、数据模型、AI 输出 schema 和移动端历程页面尚未按本次定稿规则修订。

### 下一步

- 以本次 MVP 趋势规则为准，收敛后端实施计划和移动端页面流。
- 实施前明确有效时间点校验、前后变化计算、阶段趋势生成和上下文查询的接口契约与测试样例。

---

## 2026-08-20 — MVP 文档权威链统一 — ✅ 已完成

### 本次完成

- 将 `design/product/skin_care_app_mvp_spec.md` 明确为当前开发与上架版本的唯一产品事实源，覆盖产品范围、流程、数据语义、AI 边界和验收标准。
- 将 `design/product/skin_care_app_product_spec.md` 明确为长期完整产品参考；与当前 MVP 冲突时，以 MVP 文档为准。
- 重写 `project_background.md` 的文档导航和当前状态，移除其定义具体产品规则的职责，并明确早期三视角、皮肤指数、旧趋势和 AI 问答不属于当前 MVP。
- 在 `CLAUDE.md` 中加入产品文档权威规则，要求处理当前 MVP 任务前先读取 MVP 文档，并规定实施计划不得新增或改写产品规则。
- 将 `docs/superpowers/plans/2026-08-12-backend-product-redesign.md` 标记为 `SUPERSEDED` 且禁止继续执行，等待产品歧义全部解决后重新生成实施计划。

### 验证情况

- 已逐项核验 MVP 唯一事实源、长期文档定位、项目背景导航、启动读取规则、冲突优先级和旧计划禁用标记，全部通过。
- 对本次修改的已跟踪文档执行 `git diff --check`，无空白错误；MVP 文档单独检查，未发现行尾空白。
- 本次只修正文档权威关系，没有修改代码，因此无代码测试项。

### 当前阻塞或遗留

- MVP 规格中的区域事件生命周期与记录归属、固定区域可见性、手动状态冲突、趋势生成、删除重算、生活背景、AI 失败恢复和上架基线仍需逐项定稿。
- 新版实施计划尚未生成；在上述产品规则定稿前，旧计划不得恢复执行。

### 下一步

- 明确区域事件的创建、暂停、恢复、结束和重新创建规则，并取消 AI 对事件归属的非确定性判断。
