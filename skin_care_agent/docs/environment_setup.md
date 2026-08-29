# 本地开发环境

> 状态：ACTIVE
>
> 更新日期：2026-08-21
>
> 职责：提供当前仓库的最小运行和验证说明。产品范围见 `design/product/skin_care_app_mvp_spec.md`，实现进度见 `docs/current_status.md`。

所有命令默认从项目根目录执行。不要把示例中的开发密钥用于生产。

## 前置工具

- Windows PowerShell
- Git
- Python 3.11 或 3.12
- uv
- Node.js 22.13 或更高兼容版本
- PostgreSQL 16
- Android Studio、JDK 17 和 Android SDK 36，仅 Android 模拟器开发需要

依赖版本以 `backend/pyproject.toml`、`backend/uv.lock`、`mobile/package.json` 和 `mobile/package-lock.json` 为准，不要根据本文升级依赖。

## 后端

### 创建环境并安装依赖

```powershell
cd backend
uv venv
.venv\Scripts\activate
uv pip install -e .[dev]
```

### 配置

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
```

至少检查：

```text
DATABASE_URL=postgresql+psycopg://skin:skin@localhost:5432/skin_care
STORAGE_BACKEND=local
STORAGE_LOCAL_DIR=./storage_local
STORAGE_URL_SIGN_SECRET=dev-only-change-me
AI_PROVIDER_PRIMARY=mock
```

真实密钥只写入未跟踪的 `.env`。普通本地开发可以使用 mock；Slice 1 的真实 AI 验收必须显式配置 provider，不能用 mock 代替。

GLM-4.6V 单 Provider 验收配置：

```text
AI_PROVIDER_PRIMARY=glm
AI_PROVIDER_FALLBACKS=
GLM_API_KEY=只写在本地 .env 的真实密钥
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODEL=glm-4.6v
```

`AI_PROVIDER_FALLBACKS=` 必须留空；说明文字写在上一行注释中，不要把示例 provider 写进值。显式选择 `glm` 但缺少 Key 时，调用应失败并进入业务降级，不会静默返回 mock 结果。

### PostgreSQL

可以使用本机 PostgreSQL，也可以用 Docker 创建开发数据库：

```powershell
docker run -d --name skin-pg -e POSTGRES_USER=skin -e POSTGRES_PASSWORD=skin -e POSTGRES_DB=skin_care -p 5432:5432 postgres:16
```

应用迁移会改变本地数据库，只在明确需要时执行：

```powershell
cd backend
.venv\Scripts\alembic.exe upgrade head
```

当前代码迁移 head 为 `0013_full_face_observations`。

### PostgreSQL 集成测试

`TEST_DATABASE_URL` 必须指向可丢弃且已经迁移到 head 的 PostgreSQL 测试库，不能复用生产库：

```powershell
cd backend
$env:DATABASE_URL = $env:TEST_DATABASE_URL
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m pytest tests\integration\test_observations_persistence.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app tests
```

没有设置 `TEST_DATABASE_URL` 时，PostgreSQL 集成测试会明确标记为 skipped，不得把 skip 视为持久化验收通过。

### 标准产品目录闭环

`tests/fixtures/product_catalog/` 中的目录包、图片和说明书均为合成数据。目录导入依赖 PostgreSQL 的 `pg_trgm` 扩展；应用迁移会创建扩展，测试数据库用户必须有创建 schema 和迁移所需的权限。

使用可丢弃数据库运行完整闭环。脚本在该数据库创建随机 schema、使用临时本地存储目录，并在 `finally` 中清理：

```powershell
cd backend
$env:TEST_DATABASE_URL='postgresql+psycopg://<test-user>:<test-password>@localhost:5432/<disposable-db>'
python scripts/verify_standard_product_catalog_flow.py
```

不能把当前开发库、生产库或含真实目录内容的数据库用作这个命令的目标。

### 启动和检查

```powershell
cd backend
.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000
```

| 检查 | 地址 |
|---|---|
| 进程健康 | `http://localhost:8000/health` |
| 数据库健康 | `http://localhost:8000/health/db` |
| Swagger | `http://localhost:8000/docs` |

### 后端验证

```powershell
cd backend
.venv\Scripts\ruff.exe check --no-cache .
$env:PYTHONDONTWRITEBYTECODE='1'
.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

## 移动端

### 安装和配置

```powershell
cd mobile
npm install
Copy-Item -LiteralPath .env.example -Destination .env
```

API 地址按运行环境设置：

```text
# Web
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1

# Android 模拟器
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

真机使用电脑的局域网 IP，后端必须监听 `0.0.0.0`。

### 启动

```powershell
cd mobile
npm run start
```

Android 模拟器也可以执行：

```powershell
npm run android
```

### 移动端验证

```powershell
cd mobile
npm run lint
npm run typecheck
npm run test:unit
```

## 当前运行结果的含义

当前 backend 和 mobile 主要呈现旧版三视角产品。服务能够启动、旧测试通过或旧页面能够操作，只能证明 legacy 基线可用，不能证明新版 MVP 已完成。

开发新版流程前先读取：

1. `project_background.md`
2. `design/product/skin_care_app_mvp_spec.md`
3. `docs/current_status.md`
4. `docs/current_status.md` 指定的唯一 ACTIVE 实施计划

## 常见问题

- Android 模拟器不能用 `127.0.0.1` 访问宿主机，使用 `10.0.2.2`。
- 真机无法访问时，检查同一局域网、Windows 防火墙和后端监听地址。
- 数据库连接失败时，检查 PostgreSQL 进程、端口及 `DATABASE_URL`。
- Expo 命令异常时，先核对 Node 版本，再按 lockfile 重装依赖，不要升级 Expo。
- `AI_PROVIDER_PRIMARY=mock` 时才使用 mock；显式配置真实 provider 后不会静默回退到 mock。
- 不同 Git worktree 各自读取其 `backend/.env`；未跟踪的密钥文件不会随分支或 worktree 自动复制。
