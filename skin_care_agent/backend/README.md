# Skin Care Agent Backend

FastAPI 后端。当前代码主要是旧版产品的可运行基线，新版产品范围只以 `design/product/skin_care_app_mvp_spec.md` 为准，真实进度见 `docs/current_status.md`。

## 当前定位

可以复用的基础：

- 邮箱密码认证、Access/Refresh Token 和用户隔离；
- 协议与授权基础；
- PostgreSQL、SQLAlchemy 和 Alembic 迁移链；
- 本地文件存储与签名 URL；
- `client_request_id` 幂等模式；
- AI provider gateway、fallback、合规校验和调用追踪。

仍在代码中运行但属于 legacy 的业务：

- 三视角 Check-in；
- 照片质量门槛和旧几何标准化；
- 医学化照片分析、严重度和皮肤指数；
- Patch lineage、按日趋势和开放式聊天；
- 旧日记与账号级联删除。

这些接口不能作为新版 MVP 的产品依据。新版区域事件、区域时间点、无照片记录、逐区域异步分析、个人产品、实际使用、生活贴纸和证据趋势尚未形成完整后端闭环。

## 快速开始

需要 Python 3.11 以上、uv 和 PostgreSQL 16。

```powershell
cd backend
uv venv
.venv\Scripts\activate
uv pip install -e .[dev]
Copy-Item -LiteralPath .env.example -Destination .env
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000
```

迁移会改变本地数据库，只在明确需要时执行。当前代码迁移 head 为 `0012_app_foundation`。

| 检查 | 地址 |
|---|---|
| 进程健康 | `GET /health` |
| 数据库健康 | `GET /health/db` |
| Swagger | `http://localhost:8000/docs` |

## 当前路由边界

| 模块 | 路由 | MVP 处理原则 |
|---|---|---|
| 认证 | `/api/v1/auth/*` | 优先复用 |
| 当前用户和协议 | `/api/v1/me*` | 复用认证与授权基础；账号删除不进入当前 MVP |
| 文件 | `/files/*` | 优先复用签名读取能力 |
| 照片 | `/api/v1/photos*` | 评估后适配零张或一张照片的新记录 |
| Check-in | `/api/v1/check-ins*` | Legacy，新流程不能要求三视角 |
| 分析 | `/api/v1/analyses*` | Legacy Schema；可复用 gateway 基础 |
| Lineage | `/api/v1/lineages*` | Legacy，不进入新导航 |
| 趋势 | `/api/v1/trends*` | Legacy 皮肤指数趋势 |
| 聊天 | `/api/v1/chat*` | 超出 MVP |

旧路由暂不删除，以免破坏已有数据和迁移上下文。后续纵向切片应建立新契约并逐步断开旧入口。

## 验证

```powershell
cd backend
.venv\Scripts\ruff.exe check --no-cache .
$env:PYTHONDONTWRITEBYTECODE='1'
.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

现有测试覆盖旧业务基线。新增 MVP 能力必须补数据库、API、授权隔离、幂等和降级路径测试。

## 开发前必读

1. `project_background.md`
2. `design/product/skin_care_app_mvp_spec.md`
3. `docs/current_status.md`
4. 当前状态页指定的唯一 ACTIVE 实施计划
