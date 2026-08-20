# 开发笔记 — Skin Care Agent Backend

> **历史归档说明（2026-07-20）**：本文只记录早期后端开发过程，已停止维护，不是当前进度来源。唯一最新开发日志为 [`../backend/dev_notes.md`](../backend/dev_notes.md)；项目当前状态见 [`../project_background.md`](../project_background.md)。以下原文保留用于追溯历史。

记录每个 Step 的实现要点、设计决策、操作步骤。代码细节看源码，这里只记不容易从代码里直接看出来的东西。

---

## Step 1：基础脚手架 ✅

### 我做了什么

搭起最小可运行的 FastAPI + PostgreSQL 骨架。

- `pyproject.toml` — 依赖声明，分核心 / `[dev]` 两组
- `app/config.py` — pydantic-settings 读 `.env`，`@lru_cache` 单例
- `app/db/session.py` — SQLAlchemy `engine` + `SessionLocal` + `get_db()` 依赖
- `app/models/base.py` — `Base` / `IdMixin`（BigInteger 主键）/ `TimestampMixin`（含软删 `deleted_at`）
- `app/main.py` — FastAPI factory + CORS + lifespan
- `app/api/health.py` — `/health`（进程） + `/health/db`（`SELECT 1` 验 PG）
- `alembic.ini` + `app/db/migrations/env.py` — DB URL 从 settings 注入，避免硬编码
- `.env.example` — 全部环境变量模板
- `.gitignore` — 忽略 `.venv` / `.env` / `storage_local/`

### 关键设计决策

- **PG 不选 MySQL**：为后面 JSONB（日记 tags）/ 数组+GIN（合规审计）/ pgvector（相似图检索）留路。PG License 永久免费，自己装零成本。
- **`.env` 注入 alembic URL**：alembic.ini 里 `sqlalchemy.url=` 留空，由 `env.py` 从 settings 注入，避免在 git 里漏密钥。
- **软删而非硬删**：所有业务表带 `deleted_at`，配合"不支持用户删数据"的产品定位。
- **uv 管理虚拟环境**：`.venv` 落在项目内（`backend/.venv/`），删项目即删环境。

### 你需要操作什么（一次性，已完成）

```powershell
cd D:\agent\model\projects\skin_care_agent\backend
uv venv
.venv\Scripts\activate
uv pip install -e ".[dev]"
copy .env.example .env
# 编辑 .env：DATABASE_URL=postgresql+psycopg://skin:skin@localhost:5432/skin_care
# PG 侧：CREATE USER skin WITH PASSWORD 'skin'; CREATE DATABASE skin_care OWNER skin;
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

验证：
- http://localhost:8000/health → `{"status":"ok",...}`
- http://localhost:8000/health/db → `{"status":"ok","db":"reachable"}`

---

## Step 2：storage_service + 照片上传 ✅

### 我做了什么

**ORM 模型**
- `app/models/user.py` — `users` 表（id / wx_openid / nickname / 软删）。微信 openid 字段独立，登录接入前可空。
- `app/models/photo.py` — `photos` 表（user_id FK / storage_key 唯一 / mime / size / 宽高 / taken_at / 软删）
- `app/models/__init__.py` — 导入新模型，保证 `Base.metadata` 能感知

**存储抽象** `app/services/storage_service/`
- `base.py` — `StorageBackend` 抽象类 + `SignedURL` dataclass，定义 put / get / exists / delete / signed_url 五个方法
- `local.py` — `LocalStorage` 实现，文件落在 `backend/storage_local/` 下
- `signing.py` — HMAC-SHA256 签名 / 校验。URL 形如 `/files/{key}?exp=...&sig=...`
- `factory.py` — `get_storage()` 工厂，按 `STORAGE_BACKEND` 返回实现（`@lru_cache` 单例）

**Schema** `app/schemas/photo.py`
- `PhotoUploadResponse` / `PhotoOut`

**HTTP 路由**
- `app/api/photos.py` — `POST /photos`（multipart 上传） + `GET /photos/{id}/url`（重签 URL）
- `app/api/files.py` — `GET /files/{key:path}?exp&sig`（验签后返文件流）

**配置补充**（`config.py` + `.env.example`）
- `STORAGE_URL_SIGN_SECRET` — 签名密钥（生产必须改强随机串）
- `STORAGE_URL_TTL_SECONDS=900` — URL 默认 15 分钟过期
- `UPLOAD_MAX_BYTES=8MB`
- `UPLOAD_ALLOWED_MIMES=image/jpeg,image/png,image/webp`

**迁移**
- `app/db/migrations/versions/0001_init.py` — 手写（不用 autogenerate，更可控）

### 关键设计决策

- **存储要不要抽象**：要。MVP 用 local，未来上 COS / OSS，只换 factory.py 一行；业务代码、小程序、接口形态完全不动。
- **本地存储为什么也要"签名 URL"**：和云存储 Presigned URL 接口对齐 + 安全。直接暴露固定路径意味着"猜到路径就能看别人的脸"，签名 + 短期过期是行业默认做法。
- **签名内容**：`HMAC(secret, "{key}|{exp}")`。`key` 进签名能防别人复用别 key 的签名；`exp` 进签名 + 短 TTL 防 URL 外传长期有效。
- **TTL = 15 分钟**：行业默认值。太短刷新页面失效体感差，太长泄露窗口大。
- **种子 user_id=1**：MVP 未接微信前，所有上传自动挂到 `id=1` 的 dev 用户。等接入 `/auth/wx/login` 时无需改表，只换 `_ensure_seed_user` 为真实登录态。
- **Pillow 二次校验**：不信任 `Content-Type`，用 PIL `verify()` 真正打开看是不是合法图像，顺便拿出宽高。
- **路径结构 `photos/{uid}/YYYY/MM/DD/{uuid}.{ext}`**：按日分目录避免单目录文件爆炸；uuid 防猜测。
- **图像不在上传时跑算法**：上传接口只存盘 + 入库，算法（MediaPipe / LLM 分析）走 Step 3 异步流程，保持上传接口快。

### 你需要操作什么

**1. 同步 `.env`**（在 `STORAGE_LOCAL_BASE_URL` 行下面追加）：

```
STORAGE_URL_SIGN_SECRET=dev-only-change-me
STORAGE_URL_TTL_SECONDS=900
UPLOAD_MAX_BYTES=8388608
UPLOAD_ALLOWED_MIMES=image/jpeg,image/png,image/webp
```

**2. 跑迁移**：

```powershell
cd D:\agent\model\projects\skin_care_agent\backend
.venv\Scripts\activate
alembic upgrade head
```

预期：`Running upgrade  -> 0001_init`。

进 PG 验证：
```sql
\dt   -- 应看到 users / photos / alembic_version
```

**3. 重启服务**：

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**4. 上传测试**：

打开 http://localhost:8000/docs → `POST /photos` → Try it out → 选一张 jpg/png → Execute。

返回示例：
```json
{
  "photo_id": 1,
  "storage_key": "photos/1/2026/06/29/xxx.jpg",
  "width": 1080, "height": 1920,
  "url": "http://localhost:8000/files/photos/1/2026/06/29/xxx.jpg?exp=...&sig=...",
  "url_expires_at": "..."
}
```

把 `url` 贴浏览器 → 应看到刚上传的图片。

**5. 签名校验测试**：把 url 末尾 `sig=` 改一个字符 → 应返回 `403 invalid or expired signature`。

---

## Step 3：ai_service 业务接入（进行中）

> 原计划的"Mock 版"已被 `ai_gateway` 覆盖（含 MiniMax / DeepSeek / Qwen / GLM / 豆包 OpenAI-compat + 断路器 + 降级链 + `/ai/debug/invoke`）。
> Step 3 重新定义为"把 gateway 接入业务"，分 4 小步：
>
> - **3a**：限流表 + 中间件 + dev 豁免 ← 当前
> - **3b**：`POST /analyses` + base64 图片注入 + `analyses` 表持久化
> - **3c**：schema_guard 严格版 + 合规出参扫描
> - **3d**：`POST /chat` + `chat_messages` 表

### 3a：限流表 + 中间件 + dev 豁免

**做了什么**

- `app/models/ai_usage.py` — `AIUsageCounter` 表：`(user_id, kind, usage_date)` 唯一约束
- `app/db/migrations/versions/0002_ai_usage.py` — 迁移
- `app/services/ai_gateway/rate_limit.py` — 原子占额 + peek + require + QuotaExceeded 异常
- `app/api/ai_debug.py` — 新增两个 debug 端点
    - `GET /ai/debug/quota` — 查看当前 seed user 的当日配额消耗
    - `POST /ai/debug/quota/{kind}/consume` — 手动占额（测限流用）
- `config.py` + `.env.example` — 新增 `AI_RATELIMIT_ENFORCE_IN_DEV`

**关键设计**

- **单 SQL 完成占额**：`INSERT ... ON CONFLICT DO UPDATE ... WHERE count < :limit RETURNING count`
  - 存在且 `count < limit` → UPDATE +1 → 返回新值 → allowed=True
  - 存在但 `count >= limit` → WHERE 挡掉 → 无 RETURNING → allowed=False
  - 不存在 → INSERT count=1 → 返回 1 → allowed=True
  - **原子性**：单条 SQL 走事务，多并发请求不会超发。
- **dev 豁免**：`APP_ENV=dev` 且 `AI_RATELIMIT_ENFORCE_IN_DEV=false`（默认）时直接放行，不写库。
  - 调试联调时不会误占产线配额、也不会因为一天调 100 次被卡住。
  - 要在 dev 上专门测限流：`.env` 里改 `AI_RATELIMIT_ENFORCE_IN_DEV=true`。
- **和 gateway 解耦**：限流是"进入调用前的门神"，不塞进 gateway 内部。业务代码写法：
  ```python
  rl.require(db, user_id, "analyze")   # 抛 QuotaExceeded → HTTP 429
  resp = await get_gateway().invoke("vision_analyze", req)
  ```

**你需要操作什么**

1. `.env` 追加一行（可选，默认就是 false）：
   ```
   AI_RATELIMIT_ENFORCE_IN_DEV=false
   ```

2. 跑迁移：
   ```powershell
   cd D:\agent\model\projects\skin_care_agent\backend
   .venv\Scripts\activate
   alembic upgrade head
   ```
   预期：`Running upgrade 0001_init -> 0002_ai_usage`。

3. 重启服务：
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. 验证（http://localhost:8000/docs）：
    - `GET /ai/debug/quota` → 应看到两条记录（analyze / chat），因为 dev 豁免 used=0
    - `POST /ai/debug/quota/analyze/consume` → 返回 allowed=true（dev 豁免下 used 一直是 0）
    - **测真限流**：改 `.env` 里 `AI_RATELIMIT_ENFORCE_IN_DEV=true` + `AI_ANALYZE_DAILY_LIMIT=2`，重启，连续 POST 三次：前两次 200，第三次 429。测完记得改回来。

---

## Step 3b：POST /analyses（待开始）

待启动时再写。
