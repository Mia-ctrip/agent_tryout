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

Slice 1 的生产候选视觉模型当前为 `glm-4.6v`。网关按 `AI_PROVIDER_PRIMARY` 和 `AI_PROVIDER_FALLBACKS` 的显式顺序路由；选择 GLM 但缺少 Key 时不会静默返回 Mock。GLM 视觉请求关闭思考模式、不发送仅文本模型使用的 JSON Mode 参数，输出由本地 JSON、七字段 Schema 和展示安全校验负责把关。

仍在代码中运行但属于 legacy 的业务：

- 三视角 Check-in；
- 照片质量门槛和旧几何标准化；
- 医学化照片分析、严重度和皮肤指数；
- Patch lineage、按日趋势和开放式聊天；
- 旧日记与账号级联删除。

这些接口不能作为新版 MVP 的产品依据。新版 Slice 1 已建立独立的全脸 Observation 契约；区域事件属于 MVP 后续未开放能力，个人产品、实际使用、生活贴纸和证据趋势仍未形成完整后端闭环。

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

迁移会改变本地数据库，只在明确需要时执行。当前代码迁移 head 为 `0013_full_face_observations`；是否已应用到某个环境必须以该环境的 Alembic current 为准。

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
| Observation | `POST /api/v1/observations` | Slice 1；零张或一张照片、UUID 幂等、先保存原始记录 |
| Observation | `GET /api/v1/observations` | Slice 1；按记录时间/ID 倒序读取当前用户历程，最多 50 条 |
| Observation | `GET /api/v1/observations/{observation_id}` | Slice 1；读取原图签名 URL、异步状态和公开结果 |
| Observation | `PUT /api/v1/observations/{observation_id}/note` | Slice 1；仅 `needs_input` 可补非空用户原文 |
| 照片 | `/api/v1/photos*` | Legacy 独立照片接口；新版记录不调用 |
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

## Slice 4A 标准产品目录本地闭环

标准目录只接受版本化离线包；测试目录中的 `tests/fixtures/product_catalog/` 全部是合成数据，不能作为真实药品、器械或说明书资料发布。包由 `manifest.json`、`products.csv`、`aliases.csv`、`documents.csv` 和引用的图片/原始文档组成；PostgreSQL 需要 `pg_trgm`，迁移会在首次目录迁移时创建该扩展。

导入前可执行 dry-run：

```powershell
cd backend
python scripts/import_standard_products.py tests/fixtures/product_catalog/v1 --dry-run
```

完整的目录闭环使用随机 PostgreSQL schema 和临时本地对象存储目录，必须显式提供可丢弃的测试连接，脚本结束后会清理二者：

```powershell
cd backend
$env:TEST_DATABASE_URL='postgresql+psycopg://<test-user>:<test-password>@localhost:5432/<disposable-db>'
python scripts/verify_standard_product_catalog_flow.py
```

该脚本不调用外部 API，也不会导入真实产品或医疗资料。

真实 GLM 契约测试默认跳过，只有明确允许消耗额度并提供测试照片时运行：

```powershell
$env:RUN_LIVE_GLM_TEST='1'
$env:LIVE_GLM_ENV_FILE=(Resolve-Path .env)
$env:LIVE_GLM_IMAGE_PATH='本地验收照片的绝对路径'
.venv\Scripts\python.exe -m pytest tests\integration\test_glm_live.py -q -s
```

## 开发前必读

1. `project_background.md`
2. `design/product/skin_care_app_mvp_spec.md`
3. `docs/current_status.md`
4. 当前状态页指定的唯一 ACTIVE 实施计划
