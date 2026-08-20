# Skin Care Agent — 新电脑环境构建指南

> 目标：从几乎全新的 Windows 电脑，把本项目配置到可以本地启动后端、启动 Expo 客户端，并为后续上云部署保留清晰的环境依赖清单。
>
> 当前项目后端要求 **Python ≥ 3.11**，不要装 Python 3.10；移动端使用 **Expo SDK 57**，对应 **Node.js 22.13.x**。

---

## 1. 项目目录

本文默认项目在：

```powershell
D:\Mia\llm_learn\projects\skin_care_agent
```

如果你的新电脑路径不同，把后续命令中的路径替换成实际路径。

核心目录：

```text
skin_care_agent/
├── backend/              # FastAPI 后端
├── mobile/               # React Native + Expo App
├── docs/                 # 项目文档
├── project_background.md # 当前项目背景与阶段
└── backend/dev_notes.md  # 唯一开发进度日志
```

如果你的新电脑路径不同，后续命令中的路径按实际位置替换。

---

## 2. 安装策略

优先使用 PowerShell 命令安装。安装命令执行完后，关闭当前 PowerShell，重新打开一个新的 PowerShell，再执行验证命令。

如果 `winget` 不可用，先验证系统是否有 App Installer：

```powershell
winget --version
```

如果这一步失败，需要先在 Microsoft Store 中安装或更新 App Installer；这属于 Windows 基础组件问题，不是项目问题。

---

## 3. 系统级工具安装

### 3.1 Git

安装：

```powershell
winget install --id Git.Git -e --source winget
```

验证：

```powershell
git --version
```

### 3.2 Python 3.11 或 3.12

推荐安装 Python 3.12：

```powershell
winget install --id Python.Python.3.12 -e --source winget
```

如果你想严格使用 Python 3.11：

```powershell
winget install --id Python.Python.3.11 -e --source winget
```

验证：

```powershell
python --version
```

期望显示 `Python 3.11.x` 或 `Python 3.12.x`。

如果 `python` 命令不存在，重新打开 PowerShell；仍不存在时检查 PATH。

### 3.3 uv

推荐安装：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

备选安装：

```powershell
winget install --id astral-sh.uv -e --source winget
```

验证：

```powershell
uv --version
```

### 3.4 安装 Node.js 22.13.x

项目使用 Expo SDK 57。Expo SDK 57 对应的最低 Node.js 版本是 22.13.x，因此不要使用旧的 Node 18/20 环境。

下载地址：

```text
https://nodejs.org/en/download
```

如果官网当前 LTS 已高于 22，但你希望严格匹配本项目，可以到 Node 22 下载归档：

```text
https://nodejs.org/en/download/archive/
```

安装步骤：

1. 下载 Windows Installer，通常选择 `Windows Installer (.msi)` + `x64`。
2. 双击 `.msi` 安装包。
3. 安装选项保持默认。
4. 如果看到 `Automatically install the necessary tools`，本项目通常不需要勾选；Android 构建依赖后面用 Android Studio/JDK 单独装。
5. 安装完成后重新打开 PowerShell。

验证：

```powershell
node --version
npm --version
```

Expo SDK 57 要求 Node.js 22.13.x 或更高的 22 系列兼容版本。若安装后显示 Node 20 或更低，需要卸载旧版本并安装 Node 22。

### 3.5 VS Code

安装：

```powershell
winget install --id Microsoft.VisualStudioCode -e --source winget
```

验证：

```powershell
code --version
```

打开项目：

```powershell
code D:\Mia\llm_learn\projects\skin_care_agent
```

### 3.6 Docker Desktop（可选）

如果你想用 Docker 跑 PostgreSQL：

```powershell
winget install --id Docker.DockerDesktop -e --source winget
```

安装完成后重启电脑，并打开 Docker Desktop，等待 Docker Engine 启动。

验证：

```powershell
docker --version
docker ps
```

如果你选择本机 PostgreSQL，可以不装 Docker。

---

## 4. Android 开发工具安装

### 4.1 Microsoft OpenJDK 17

安装：

```powershell
winget install --id Microsoft.OpenJDK.17 -e --source winget
```

验证：

```powershell
java -version
```

期望能看到 17，例如 `openjdk version "17..."`。

### 4.2 Android Studio

安装：

```powershell
winget install --id Google.AndroidStudio -e --source winget
```

安装完成后打开 Android Studio，进行一次初始化配置。

首次启动建议选择：

```text
Standard
```

确认安装这些组件：

```text
Android SDK
Android SDK Platform
Android Virtual Device
Android Emulator
```

如果首次向导没装全，手动补装：

```text
Android Studio → More Actions → SDK Manager
```

在 `SDK Platforms` 勾选：

```text
Android 16.0 / API 36
```

在 `SDK Tools` 勾选：

```text
Android SDK Platform-Tools
Android SDK Build-Tools
Android Emulator
```

然后点击 `Apply`。

### 4.3 配置 Android 环境变量

常见 Android SDK 路径：

```text
C:\Users\<你的用户名>\AppData\Local\Android\Sdk
```

在 Windows 环境变量中新增：

```text
ANDROID_HOME=C:\Users\<你的用户名>\AppData\Local\Android\Sdk
ANDROID_SDK_ROOT=C:\Users\<你的用户名>\AppData\Local\Android\Sdk
```

把下面两个目录加入 PATH：

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

改完后重新打开 PowerShell，验证：

```powershell
adb version
```

### 4.4 创建 Android 模拟器

在 Android Studio 中：

```text
More Actions → Virtual Device Manager → Create Device
```

建议：

```text
设备：Pixel 7 或 Pixel 8
System Image：API 36
```

创建完成后启动模拟器，验证：

```powershell
adb devices
```

能看到一台 `emulator-xxxx` 设备即可。

---

## 5. PostgreSQL 16

二选一：Docker 方式或本机安装方式。

### 5.1 推荐：Docker 启动 PostgreSQL

如果已安装 Docker Desktop，直接执行：

```powershell
docker run -d --name skin-pg `
  -e POSTGRES_USER=skin `
  -e POSTGRES_PASSWORD=skin `
  -e POSTGRES_DB=skin_care `
  -p 5432:5432 `
  postgres:16
```

验证：

```powershell
docker ps
```

以后重新启动同一个数据库容器：

```powershell
docker start skin-pg
```

### 5.2 备选：winget 安装 PostgreSQL

PostgreSQL 首次安装涉及 `postgres` 密码、端口和组件。命令安装不一定适合所有新电脑环境；如果安装后 `psql` 不可用，优先改用 Docker 方案。

安装：

```powershell
winget install --id PostgreSQL.PostgreSQL.16 -e --source winget
```

验证：

```powershell
psql --version
```

如果 `psql` 命令不存在，把 PostgreSQL 的 `bin` 目录加入 PATH。常见路径：

```text
C:\Program Files\PostgreSQL\16\bin
```

### 5.3 创建本机数据库用户和库

如果你用 Docker 方案，`skin` 用户和 `skin_care` 数据库已在 `docker run` 时创建，可跳过本小节。

如果你用本机 PostgreSQL，进入 `psql` 后执行：

```sql
CREATE USER skin WITH PASSWORD 'skin';
CREATE DATABASE skin_care OWNER skin;
```

验证连接：

```powershell
psql -U skin -d skin_care -h localhost -p 5432
```

提示输入密码时输入：

```text
skin
```

---

## 6. 获取项目代码

如果代码还没在新电脑上：

```powershell
cd D:\Mia\llm_learn\projects
git clone <你的仓库地址> skin_care_agent
cd skin_care_agent
```

如果已经复制过来，直接进入项目根目录：

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent
```

检查当前状态：

```powershell
git status --short
```

---

## 5. 后端环境配置

### 5.1 创建 Python 虚拟环境

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
uv venv
.venv\Scripts\activate
```

激活后，命令行前面通常会出现 `(.venv)`。

### 5.2 安装后端依赖

```powershell
uv pip install -e ".[dev]"
```

后端主要依赖来自 `backend/pyproject.toml`：

- FastAPI / Uvicorn
- SQLAlchemy / Alembic / psycopg
- Pydantic / pydantic-settings
- Pillow / OpenCV / MediaPipe / NumPy / SciPy
- httpx / tenacity
- pytest / ruff

### 5.3 配置后端 `.env`

```powershell
copy .env.example .env
```

至少确认这些项：

```text
APP_ENV=dev
APP_HOST=0.0.0.0
APP_PORT=8000
API_V1_PREFIX=/api/v1

DATABASE_URL=postgresql+psycopg://skin:skin@localhost:5432/skin_care

STORAGE_BACKEND=local
STORAGE_LOCAL_DIR=./storage_local
STORAGE_LOCAL_BASE_URL=http://localhost:8000/files
STORAGE_URL_SIGN_SECRET=dev-only-change-me

AI_PROVIDER_PRIMARY=mock
AI_PROVIDER_FALLBACKS=
```

新电脑首次配置时，建议先保持：

```text
AI_PROVIDER_PRIMARY=mock
```

这样可以先跑通项目主链路，不依赖外部大模型 API key。

如果要接真实模型，再填写对应 key，例如：

```text
MINIMAX_API_KEY=...
QWEN_API_KEY=...
GLM_API_KEY=...
DOUBAO_API_KEY=...
DEEPSEEK_API_KEY=...
```

不要把真实 `.env` 提交到 Git。

---

## 6. PostgreSQL 16 配置

二选一：Docker 方式或本机安装方式。

### 方案 A：Docker 启动 PostgreSQL

```powershell
docker run -d --name skin-pg `
  -e POSTGRES_USER=skin `
  -e POSTGRES_PASSWORD=skin `
  -e POSTGRES_DB=skin_care `
  -p 5432:5432 `
  postgres:16
```

验证容器：

```powershell
docker ps
```

### 方案 B：本机 PostgreSQL

下载地址：

```text
https://www.postgresql.org/download/windows/
```

安装步骤：

1. 打开 PostgreSQL Windows installers 页面。
2. 下载 PostgreSQL 16 的 Windows x86-64 installer。
3. 双击安装包。
4. 安装目录可以保持默认。
5. Components 建议至少保留：
   - PostgreSQL Server
   - pgAdmin 4
   - Command Line Tools
6. 设置数据库超级用户 `postgres` 的密码。这个密码自己保存好。
7. 端口保持默认：

```text
5432
```

8. Locale 可以保持默认。
9. 安装结束后，如果弹出 Stack Builder，可以先取消；本项目暂时不需要额外插件。

安装完成后，打开 `SQL Shell (psql)` 或 pgAdmin。

如果使用 `SQL Shell (psql)`，一般按提示输入：

```text
Server [localhost]: 直接回车
Database [postgres]: 直接回车
Port [5432]: 直接回车
Username [postgres]: 直接回车
Password for user postgres: 输入安装时设置的 postgres 密码
```

进入 `psql` 后，执行：

```sql
CREATE USER skin WITH PASSWORD 'skin';
CREATE DATABASE skin_care OWNER skin;
```

如果用户已经存在，可只确认数据库是否存在。不要重复创建导致报错后误以为数据库不可用。

验证数据库是否能连接：

```powershell
psql -U skin -d skin_care -h localhost -p 5432
```

提示输入密码时输入：

```text
skin
```

如果 `psql` 命令不存在，需要把 PostgreSQL 的 `bin` 目录加入 PATH。常见路径：

```text
C:\Program Files\PostgreSQL\16\bin
```

### 6.1 应用数据库迁移

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
.venv\Scripts\activate
alembic upgrade head
```

当前预期 head：

```text
0012_app_foundation
```

查看当前迁移版本：

```powershell
.venv\Scripts\alembic.exe current
```

---

## 7. 下载本地人脸关键点模型

后端照片质量检查和几何标准化依赖本地模型文件：

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
powershell -ExecutionPolicy Bypass -File scripts\download_face_landmarker.ps1
```

模型会保存到：

```text
backend/model_assets/
```

该目录已被 Git 忽略。换新电脑后需要重新下载。

---

## 8. 启动后端

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

浏览器验证：

| 检查项 | 地址 | 期望 |
|---|---|---|
| 进程健康 | `http://localhost:8000/health` | `status=ok` |
| 数据库健康 | `http://localhost:8000/health/db` | `db=reachable` |
| Swagger | `http://localhost:8000/docs` | 能打开接口文档 |

---

## 9. 移动端环境配置

### 9.1 安装客户端依赖

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\mobile
npm install
```

项目已提交 `package-lock.json`，新电脑优先按 lockfile 安装，不要随意升级 Expo、React Native 或 React。

### 9.2 配置移动端 `.env`

```powershell
copy .env.example .env
```

本机 Web 调试可用：

```text
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api/v1
```

Android 模拟器访问宿主机后端通常需要改成：

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

Android 真机需要改成电脑在同一局域网中的 IP，例如：

```text
EXPO_PUBLIC_API_URL=http://192.168.1.23:8000/api/v1
```

同时后端必须用下面方式监听：

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

否则真机无法访问。

### 9.3 客户端基础检查

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\mobile
npm run typecheck
npm run test:unit
```

如果 Node 版本过低，Expo SDK 57 相关命令可能失败。先确认：

```powershell
node --version
```

---

## 10. Android 开发环境

### 10.1 安装 JDK

推荐 Microsoft OpenJDK 17 LTS。

下载地址：

```text
https://learn.microsoft.com/java/openjdk/download
```

安装步骤：

1. 找到 `OpenJDK 17`。
2. Windows x64 电脑下载：

```text
microsoft-jdk-17.x.x-windows-x64.exe
```

3. 双击安装。
4. 安装选项保持默认即可。
5. 安装完成后重新打开 PowerShell。

验证：

```powershell
java -version
```

期望能看到 17，例如：

```text
openjdk version "17..."
```

### 10.2 安装 Android Studio

下载地址：

```text
https://developer.android.com/studio
```

安装前确认：

- Windows 是 64 位。
- BIOS/UEFI 中已开启虚拟化：Intel VT-x 或 AMD-V。
- 至少预留 16GB 磁盘空间；建议 32GB 以上。
- 内存建议 16GB 以上，32GB 更稳。

安装步骤：

1. 下载 Android Studio Windows `.exe` 安装包。
2. 双击安装。
3. Components 保持默认，确保包含：
   - Android Studio
   - Android Virtual Device
4. 安装完成后首次打开 Android Studio。
5. 选择 `Standard` 安装模式。
6. SDK Components 页面确认安装：
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device
   - Android Emulator
7. 等待下载完成。

用 Android Studio 安装以下组件：

- Android SDK Platform 36
- Android SDK Platform-Tools
- Android SDK Build-Tools
- Android Emulator
- 一个 API 36 Pixel AVD

如果首次向导没有装全，手动补装：

1. 打开 Android Studio。
2. 进入：

```text
More Actions → SDK Manager
```

3. 在 `SDK Platforms` 勾选：

```text
Android 16.0 / API 36
```

4. 在 `SDK Tools` 勾选：

```text
Android SDK Platform-Tools
Android SDK Build-Tools
Android Emulator
```

5. 点击 `Apply` 安装。

创建模拟器：

1. 打开：

```text
More Actions → Virtual Device Manager
```

2. 点击 `Create Device`。
3. 选择 Pixel 系列设备，例如 Pixel 7 / Pixel 8。
4. System Image 选择 API 36。
5. 下载 system image。
6. 完成创建后点击启动按钮。

安装后验证 `adb`：

```powershell
adb version
adb devices
```

如果 `adb` 命令不存在，需要把 Android SDK 的 `platform-tools` 加入 PATH。常见路径：

```text
C:\Users\<你的用户名>\AppData\Local\Android\Sdk\platform-tools
```

也建议设置环境变量：

```text
ANDROID_HOME=C:\Users\<你的用户名>\AppData\Local\Android\Sdk
ANDROID_SDK_ROOT=C:\Users\<你的用户名>\AppData\Local\Android\Sdk
```

然后把下面两个目录加入 PATH：

```text
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
```

改完环境变量后，重新打开 PowerShell。

### 10.3 启动 Android 模拟器运行 App

先启动后端，再启动 Expo：

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\mobile
npm run android
```

或者：

```powershell
npx expo start
```

然后在 Expo 终端中按：

```text
a
```

---

## 11. 真机调试

### Android 真机

1. 手机和电脑连接同一个 Wi-Fi。
2. 手机安装 Expo Go，或后续使用 development build。
3. `mobile/.env` 中把 API 地址改成电脑局域网 IP：

```text
EXPO_PUBLIC_API_URL=http://<电脑局域网IP>:8000/api/v1
```

4. 后端监听 `0.0.0.0`：

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

5. 如果手机打不开后端，检查 Windows 防火墙是否允许 8000 端口入站。

### iOS 真机

iOS 真机也需要和电脑处于同一局域网，并使用电脑局域网 IP。iOS 模拟器需要 macOS。

---

## 12. 本地完整启动顺序

### 12.1 启动数据库

Docker 方式：

```powershell
docker start skin-pg
```

本机 PostgreSQL 方式：确认 PostgreSQL 服务已经启动。

### 12.2 启动后端

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
.venv\Scripts\activate
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 12.3 启动客户端

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\mobile
npm run android
```

或启动 Metro 后手动选择平台：

```powershell
npx expo start
```

---

## 13. 本地验收清单

后端：

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\backend
.venv\Scripts\activate
.venv\Scripts\ruff.exe check --no-cache .
$env:PYTHONDONTWRITEBYTECODE='1'
.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

客户端：

```powershell
cd D:\Mia\llm_learn\projects\skin_care_agent\mobile
npm run typecheck
npm run test:unit
```

手动验收：

1. 打开 `http://localhost:8000/docs`。
2. App 可进入登录页。
3. 注册新账号。
4. 首次协议页出现。
5. 接受四项协议。
6. 进入受保护首页。
7. 退出登录。
8. 重新登录后会话正常。

当前项目最新主线还缺 Android/iOS 真机或模拟器页面操作证据；换新电脑后，优先补这个验证。

---

## 14. 常见问题

### 14.1 `python --version` 不是 3.11+

原因：PATH 指向了旧 Python。

处理：

- 安装 Python 3.11 或 3.12；
- 重新打开 PowerShell；
- 确认 `python --version`；
- 必要时用完整路径创建 uv 环境。

### 14.2 `alembic upgrade head` 连不上数据库

检查：

- PostgreSQL 是否启动；
- `DATABASE_URL` 用户名、密码、库名是否和实际一致；
- 5432 端口是否被其他 PostgreSQL 占用；
- Docker 容器是否正常运行。

### 14.3 Android 模拟器访问不了后端

模拟器里不能用 `127.0.0.1` 访问电脑宿主机。改成：

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1
```

并确认后端监听：

```powershell
--host 0.0.0.0
```

### 14.4 Android 真机访问不了后端

检查：

- 手机和电脑是否在同一个 Wi-Fi；
- `EXPO_PUBLIC_API_URL` 是否使用电脑局域网 IP；
- Windows 防火墙是否放行 8000 端口；
- 后端是否监听 `0.0.0.0`。

### 14.5 npm / Expo 命令异常

优先确认 Node：

```powershell
node --version
```

Expo SDK 57 需要 Node 22.13.x。不要用旧 Node 环境硬跑。

---

## 15. 上云前的环境准备方向

本项目目前本地 MVP 使用：

- 本地 PostgreSQL
- 本地文件系统 `backend/storage_local/`
- 同步 AI 调用
- `.env` 管理密钥

上云时建议拆成：

| 本地能力 | 云上替代 |
|---|---|
| 本地 PostgreSQL | 云 PostgreSQL / RDS |
| `storage_local/` | 腾讯 COS / S3 |
| `.env` 文件 | 云平台 Secret / 环境变量 |
| 本地 Uvicorn | 容器服务 / VM + systemd / PaaS |
| 本地日志 | 云日志服务 |
| 同步 AI 分析 | 后续可改异步任务队列 |

上云前至少要补齐：

1. 生产 `APP_ENV=prod` 配置。
2. 强随机 `STORAGE_URL_SIGN_SECRET`。
3. 真实数据库连接串和备份策略。
4. COS/S3 存储配置。
5. AI Provider key 的 Secret 管理。
6. HTTPS 域名。
7. 账号注册防爆破、邮件验证或邀请白名单。
8. 隐私政策中说明照片处理、MediaPipe 本地处理和必要遥测边界。
9. 数据删除与备份删除策略。
10. 后端测试、迁移、健康检查纳入部署流程。

---

## 16. 推荐配置顺序

如果你是完全新电脑，按这个顺序做：

1. 安装 Git。
2. 安装 Python 3.11+。
3. 安装 uv。
4. 安装 Node.js 22.13.x。
5. 安装 PostgreSQL 16 或 Docker Desktop。
6. 拉取项目代码。
7. 配置 `backend/.venv` 和 `backend/.env`。
8. 创建数据库并执行 `alembic upgrade head`。
9. 下载 `backend/model_assets/` 人脸关键点模型。
10. 启动后端并验证 `/health`、`/health/db`、`/docs`。
11. 配置 `mobile/.env`。
12. 执行 `npm install`、`npm run typecheck`、`npm run test:unit`。
13. 安装 JDK 17、Android Studio、Android SDK 36、AVD。
14. 用 Android 模拟器或真机完成 App 注册、协议、登录、登出验证。
