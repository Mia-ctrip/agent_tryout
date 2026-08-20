# Skin Care Agent — Backend

AI 皮肤长期追踪 App 的 FastAPI 后端。它只描述外观状态，不诊断病种、不推荐药品、不指导用药。

## 当前能力

- App 独立账号：邮箱密码、可撤销 Access/Refresh Token、协议版本确认与账号注销。
- 多用户数据隔离；业务 API 统一使用 `/api/v1`，生产环境不挂载 AI 调试接口。
- 三视角 check-in：正面、左侧、右侧，支持同视角重拍。
- 痘痘日记：记录睡眠、压力、饮食、经期、护肤变化和用户主动填写的外用产品。
- 本地拍照质量门槛：清晰度、光照、完整人脸、头部倾斜和视角检查。
- 几何标准化：保留原图，另存 `1024×1280` 标准化副本；不美白、不调色、不修改皮肤。
- 多模态 LLM 状态分析：结构化结果、合规扫描、限流、fallback 和调用追踪。
- Check-in 感知的 Patch lineage 生命周期、三视角聚合与按日去重的趋势 API。
- AI 护肤问答与医疗风险服务端兜底。

## 当前项目阶段

后端 MVP 与 App 基础化已经完成，当前数据库 head 为 `0012_app_foundation`。客户端已选用 React Native + Expo SDK 57，工程骨架已经建立；登录、注册、Token 恢复与轮换、首次协议确认和受保护路由已有实现，正在等待真实设备或模拟器上的前后端联调。联调完成后将继续接入 check-in、三视角拍照、分析、日记和趋势主流程。

## 快速开始

### 1. 准备 Python 环境

需要 Python ≥ 3.11，推荐使用 uv。

```powershell
cd backend
uv venv
.venv\Scripts\activate
uv pip install -e ".[dev]"
```

### 2. 准备 PostgreSQL 16

```powershell
docker run -d --name skin-pg `
  -e POSTGRES_USER=skin -e POSTGRES_PASSWORD=skin -e POSTGRES_DB=skin_care `
  -p 5432:5432 postgres:16
```

也可以使用本机 PostgreSQL：

```sql
CREATE USER skin WITH PASSWORD 'skin';
CREATE DATABASE skin_care OWNER skin;
```

### 3. 配置环境变量

```powershell
copy .env.example .env
```

至少确认：

- `DATABASE_URL`
- `STORAGE_URL_SIGN_SECRET`
- `AI_PROVIDER_PRIMARY` 及所选 provider 的 API key

### 4. 下载本地人脸关键点模型

```powershell
powershell -ExecutionPolicy Bypass -File scripts\download_face_landmarker.ps1
```

模型保存在 `backend/model_assets/`，该目录已被 Git 忽略。人脸关键点在本机计算，输入照片不会由 MediaPipe 发送给 Google；MediaPipe Tasks 会发送性能和使用指标，生产上线前需要写入隐私说明或把预处理进程置于禁止外连的网络环境。

### 5. 应用数据库迁移

```powershell
alembic upgrade head
```

当前 head：`0012_app_foundation`。

### 6. 启动服务

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 7. 验证

| 检查 | URL | 期望 |
|---|---|---|
| 进程 | `GET /health` | `status=ok` |
| 数据库 | `GET /health/db` | `db=reachable` |
| 接口文档 | `http://localhost:8000/docs` | Swagger UI 打开 |

## 主要接口

除健康检查和本地签名文件外，业务接口统一以 `/api/v1` 为前缀。

| 模块 | 接口 |
|---|---|
| 账号 | `POST /api/v1/auth/register` · `POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout` |
| 当前用户 | `GET /api/v1/me` · `GET/PUT /api/v1/me/consents` · `DELETE /api/v1/me` |
| Check-in | `POST /api/v1/check-ins` · `GET /api/v1/check-ins` · `PUT /api/v1/check-ins/{id}/diary` · `GET /api/v1/check-ins/{id}/analysis-summary` · `POST /api/v1/check-ins/{id}/complete` |
| 照片 | `POST /api/v1/photos` · `GET /api/v1/photos/{id}/url` |
| AI 分析 | `POST /api/v1/analyses` · `GET /api/v1/analyses/by-photo/{photo_id}` |
| Patch 追踪 | `GET /api/v1/lineages` · `GET /api/v1/lineages/{id}` · `GET /api/v1/lineages/by-photo/{photo_id}` · `GET /api/v1/lineages/by-check-in/{check_in_id}` |
| 趋势 | `GET /api/v1/trends/summary` |
| 问答 | `POST /api/v1/chat` · `GET /api/v1/chat/history` |

### App 认证与首次协议

- 内测版只启用邮箱 + 密码，密码使用 PBKDF2-HMAC-SHA256 加盐保存；数据库不保存明文 Token。
- Access Token 默认 15 分钟，Refresh Token 默认 30 天且每次刷新都会轮换；登出立即撤销当前会话。
- 注册后可访问 `/me` 和协议接口；使用照片、check-in、分析、趋势、生命周期或问答前，必须接受当前版本的用户协议、隐私政策、健康免责声明和 AI 数据处理说明。
- 所有资源查询都会校验当前用户归属；其他用户的 ID 统一返回 404，避免泄露资源是否存在。
- `DELETE /api/v1/me` 需要再次验证密码，随后级联删除业务数据并清理原图和标准化照片。
- 当前没有邮件验证、找回密码和登录防爆破，不应直接开放为公开注册服务；这些属于公开内测前的后续安全项。

App 将 Access Token 放入 `Authorization: Bearer <token>`。Refresh Token 只用于 `/auth/refresh`，应保存在系统安全存储中。

`POST /api/v1/check-ins` 可选传入 `diary`；也可以用 `PUT /api/v1/check-ins/{id}/diary` 完整替换。空对象 `{}` 会清空日记，已完成的 check-in 仍允许修正日记。主要字段包括：

- `sleep_hours`（0–24）、`sleep_quality`（1–5）、`stress_level`（1–5）
- `menstrual_phase`：`pre_period / during_period / post_period / not_in_period`
- `diet_tags`：`spicy / sugary / dairy / fried / alcohol`
- `skincare_changed`、`new_skincare_products`、`topical_products`、`notes`

`topical_products` 只保存用户主动输入的记录，不代表系统推荐任何产品或药品。

### 三视角聚合口径

`GET /api/v1/check-ins/{id}/analysis-summary` 对每个有效视角只读取最新一条成功分析，并返回 `empty / partial / ready` 状态：

- 整体严重度取各视角最高值，避免稀释局部严重表现。
- 皮肤指数取已有视角平均值；就医提示按任一视角为真即为真。
- 痘痘数量先在单个视角内按区域累加，再对三个重叠视角的同一区域取最大值，避免正面与侧面直接重复相加。
- `missing_photo_views` 与 `missing_analysis_views` 分开返回，便于前端准确提示补拍或补分析。

`GET /api/v1/trends/summary` 只把已完成且聚合状态为 `ready` 的 check-in 放入曲线，同一天只保留一条并优先 standard；响应会给出 `incomplete_check_ins` 和 `superseded_check_ins`。旧版无 check-in 的照片仍兼容，但同一照片多次强制分析只取最新一次，同一天旧照片只保留最新一张。

App 创建 check-in 或上传照片时应携带稳定的 `client_request_id` UUID。相同用户重复提交同一 UUID 会返回原记录，避免弱网重试产生重复数据；重复完成同一 check-in 也会返回当前结果。

### Patch 生命周期口径

生命周期由“有效观察”推进，不再根据服务器时间自动老化：

- 只有已完成 check-in 中成功分析的同视角照片才产生观察；草稿、未上传和缺少该视角都不改变状态。
- 当前照片中匹配到病灶记为 `present` 并保持或恢复 `active`；首次有效 `missing` 只进入 `dormant`。
- 至少连续两次同视角有效 `missing`，且距最后一次 `present` 已满 14 个观察日，才进入 `healed`。
- 没有中间照片时，即使相隔超过 14 天，只要病灶位置仍能匹配且尚未由缺失证据判定 healed，就继续原 lineage。
- 同一照片只推进一次；旧版无 check-in 照片按 `taken_at`（缺失时按创建时间）兼容。

`GET /api/v1/lineages/{id}` 会返回 `present / missing` 观察时间线、状态原因和连续缺失次数；`GET /api/v1/lineages/by-check-in/{check_in_id}` 返回该次 check-in 明确观察到的全部 lineage。

## 常用开发命令

```powershell
# 静态检查
.venv\Scripts\ruff.exe check --no-cache .

# 测试
$env:PYTHONDONTWRITEBYTECODE='1'
.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider

# 迁移状态
.venv\Scripts\alembic.exe current
```

完整进度和设计决策见 [`dev_notes.md`](./dev_notes.md)。
