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

真实密钥只写入未跟踪的 `.env`。本地首次运行优先使用 mock provider。

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

当前代码迁移 head 为 `0012_app_foundation`。

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
- AI provider 未配置时使用 mock；真实 provider 联调不属于基础环境验收。
