# Skin Care Agent｜腾讯 CloudBase Android 真机联调部署指南

## 文档目标

这份指南只解决一件事：

> 将目前本地运行的 Skin Care Agent 部署到腾讯云，并生成可直接安装到 Android 真机的 APK，完成一次接近真实运行环境的端到端联调。

本阶段不处理应用商店、备案、正式域名、隐私合规等问题。

最终目标架构：

```text
Android APK
    │
    │ HTTPS
    ▼
CloudBase Run 默认域名
    │
    ▼
FastAPI Backend
    │
    ├──────── PostgreSQL
    │
    └──────── Cloud Storage / COS
```

腾讯 CloudBase Run 负责容器运行、HTTPS 入口、实例调度和扩缩容；PostgreSQL 和文件存储由腾讯云托管。

因此本方案不需要：

```text
ECS
Nginx
Kubernetes
Docker Compose
自行配置负载均衡
自行申请测试域名
```

CloudBase Run 本身就是容器托管平台，每个服务创建后会获得用于测试的默认公网 HTTPS 域名。citeturn650776search3turn650776search6

---

# Part A｜把本地项目变成「可部署应用」

这一阶段不碰腾讯云。

目标是：

> 让 Backend 不依赖你的 Windows 电脑环境，只要拿到 Docker 镜像和环境变量，在任何 Linux 容器里都能启动。

目前仓库实际上已经具备很多云部署基础：

```text
FastAPI
Uvicorn
SQLAlchemy
PostgreSQL / psycopg
Alembic
环境变量配置
/health
```

后端依赖已经包含 `psycopg` 和 Alembic，所以数据库不需要重新设计。citeturn359904view0

当前数据库地址也是通过 `DATABASE_URL` 配置，而不是硬编码业务代码：

```text
postgresql+psycopg://...
``` citeturn359904view1


因此上云本质上只是把：

```text
localhost PostgreSQL
```

替换成：

```text
CloudBase PostgreSQL
```

---

## A.1 明确部署边界

CloudBase 上只运行：

```text
skin_care_agent/backend
```

不要运行：

```text
start-all.ps1
Expo Metro
Android Emulator
mobile/
```

移动端最终会被编译成 APK，本身不需要部署到腾讯云。

第一阶段建议也只部署一个 Backend Service。

除非以后真的存在一个独立运行、独立监听端口的 Gateway 进程，否则不要为了“微服务”人为拆 Service。

---

## A.2 为 Backend 增加 Dockerfile

位置：

```text
skin_care_agent/backend/Dockerfile
```

建议第一版：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libgl1 \
       libglib2.0-0 \
       libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

这里没有：

```text
--reload
```

因为云端运行的是正式进程，不是开发服务器。

你的 FastAPI 当前本身就是 `app.main:app`，而且配置默认监听 `0.0.0.0:8000`，适合直接容器化。citeturn359904view1turn359904view2

再增加：

```text
skin_care_agent/backend/.dockerignore
```

```text
.env
.venv
__pycache__
.pytest_cache
*.log
storage_local
tests
```

特别注意：

> **`.env` 不能打进 Docker 镜像。**

AI Key、数据库密码等以后全部通过 CloudBase 环境变量配置。

---

## A.3 本地先验证 Docker

在 backend 目录：

```bash
docker build -t skin-care-backend .
```

然后使用你现有的本地 `.env`：

```bash
docker run --rm \
  --env-file .env \
  -p 8000:8000 \
  skin-care-backend
```

检查：

```text
http://localhost:8000/health
```

确认返回成功。

这一步的验收标准不是“所有业务测试通过”，而是：

```text
Docker image 能 build
Container 能启动
FastAPI 能监听 8000
/health 正常
Backend 能连接本地 PostgreSQL
```

只有这一关通过，再上云。

---

## A.4 整理云端环境变量

你的 Backend 已经通过 Pydantic Settings 读取环境变量，因此不应该为腾讯云写另一套配置逻辑。citeturn359904view1

建议预先整理出 CloudBase Run 需要设置的变量：

```text
APP_ENV=staging
DATABASE_URL=<之后填腾讯 PostgreSQL 地址>

AI_PROVIDER_PRIMARY=...
QWEN_API_KEY=...
GLM_API_KEY=...
DOUBAO_API_KEY=...
...

STORAGE_BACKEND=...
```

这里推荐：

```text
APP_ENV=staging
```

而不是 `dev`。

因为你当前代码只有 `APP_ENV=dev` 时才加载 AI Debug 和开发产品目录接口。citeturn359904view2

---

# Part B｜创建 CloudBase 云环境并跑通单实例

这一阶段的目标不是高可用。

目标只有：

> **让公网 HTTPS → Backend → PostgreSQL 完整跑通。**

---

## B.1 创建 CloudBase 环境

进入：

```text
腾讯云
→ CloudBase 云开发
→ 创建环境
```

选择：

```text
地域：上海
数据库类型：PostgreSQL
```

目前 CloudBase 的数据库、云托管、云存储等完整能力集中在上海地域；PG 类型环境支持 PostgreSQL、云托管和云存储。citeturn258549search1turn258549search4

创建 PostgreSQL 类型 CloudBase 环境后，PostgreSQL 会自动初始化，不需要再自己部署 PostgreSQL Server。citeturn146075search1

所以结构已经变成：

```text
CloudBase Environment
│
├── PostgreSQL
├── CloudBase Run
└── Cloud Storage
```

---

## B.2 配置 PostgreSQL

进入：

```text
CloudBase
→ PostgreSQL
→ 数据库连接配置
```

获取控制台提供的：

```text
host
port
database
username
password
```

Backend 应继续使用标准 PostgreSQL 协议直连。

CloudBase 官方本身就推荐云托管、云函数和后端服务使用 PostgreSQL 协议连接数据库。citeturn146075search0

最终组成：

```text
postgresql+psycopg://USER:PASSWORD@HOST:5432/DATABASE
```

得到：

```text
DATABASE_URL
```

以后设置到 CloudBase Run。

### 初始化数据库表

你的项目已经有 Alembic，而且 migration 会自动读取 `settings.database_url`。citeturn296062view0turn296062view1

因此目标不是手工创建 `users`、`observations` 等表，而是执行：

```bash
alembic upgrade head
```

推荐测试阶段：

```bash
DATABASE_URL="postgresql+psycopg://..." alembic upgrade head
```

如果 CloudBase 控制台当前允许数据库外网直连，可以暂时从你的电脑执行。

如果只提供内网连接，则可以使用 CloudBase PostgreSQL 控制台的 SQL Editor，或之后建立独立 migration 流程。

迁移完成后，检查数据库中已经存在业务表。

---

## B.3 创建 CloudBase Run Service

进入：

```text
CloudBase
→ 云托管 CloudBase Run
→ 新建服务
```

Service 名可以叫：

```text
skin-care-backend
```

CloudBase Run 不支持 Docker Compose；这里的正确抽象是：

```text
一个长期运行进程
=
一个 CloudBase Run Service
``` citeturn650776search8


---

## B.4 从 GitHub 部署

创建版本时选择：

```text
代码库拉取
```

授权 GitHub 后选择：

```text
Mia-ctrip/agent_tryout
```

CloudBase 会自己：

```text
GitHub
  ↓
读取 Dockerfile
  ↓
docker build
  ↓
生成镜像
  ↓
启动 Container
```

你不需要自己：

```text
docker build
docker push
TCR push
```

代码仓库拉取模式正式支持 GitHub / GitLab / Gitee，并要求代码仓库内存在 Dockerfile。citeturn650776search7

由于你的 Repository 是 monorepo，配置：

```text
目标目录：
skin_care_agent/backend

Dockerfile：
Dockerfile

Container Port：
8000

公网访问：
开启
```

CloudBase 支持目标目录配置，因此不会把 `mobile/` 和其他文件一起当 Backend 构建。citeturn650776search0

---

## B.5 配置 Run 环境变量

在 Service 环境变量中设置：

```text
APP_ENV=staging

DATABASE_URL=<CloudBase PostgreSQL>

AI_PROVIDER_PRIMARY=...
对应模型 API KEY
...
```

不要提交这些值到 Git。

CloudBase Run 支持直接把环境变量注入容器。citeturn650776search0

---

## B.6 第一次部署先只启动一个实例

配置：

```text
最小副本数：1
最大副本数：1
```

不要现在就上两个实例。

启动部署。

部署成功后 CloudBase 会提供：

```text
https://xxxxxxxx.<cloudbase-default-domain>
```

测试：

```text
GET https://xxxxxxxx.../health
```

成功以后再测试：

```text
注册
登录
数据库读写
创建 observation
AI 请求
```

CloudBase Run 默认域名就是为开发和测试提供的，因此国庆真机联调完全可以使用；只是不要把它视为最终正式生产域名。citeturn650776search0turn650776search2

### 这里形成第一个里程碑

```text
Internet
    ↓
CloudBase HTTPS
    ↓
FastAPI
    ↓
CloudBase PostgreSQL
```

这条链打通以后，你的后端实际上就已经“上云成功”。

---

# Part C｜从单实例升级为真正可多实例运行

这部分不要阻塞第一次部署。

只有 B 部分稳定后，再做。

核心原则只有一句：

> **多实例之前，Backend 必须无状态化。**

数据库已经共享，所以数据库部分天然满足。

现在真正的问题是照片。

你的当前配置仍然是：

```text
storage_backend = "local"
storage_local_dir = "./storage_local"
```

也就是说照片目前保存在 Backend 容器自己的磁盘。citeturn359904view1

这在一个实例时勉强能跑，但不能用于真正的多实例：

```text
请求 1
↓
Instance A
↓
照片存在 A

请求 2
↓
Instance B
↓
B 找不到照片
```

而且 CloudBase Run 本身不适合部署数据库、Redis 等有状态组件。citeturn650776search8

---

## C.1 把照片迁到共享对象存储

目标：

```text
              ┌── Instance A
Android ──────┤
              └── Instance B
                     │
                     ▼
              Cloud Storage / COS
```

建议保留当前已有的 Storage abstraction：

```text
local
```

增加：

```text
cloudbase / cos
```

例如：

```text
STORAGE_BACKEND=local
```

用于本地开发。

云环境：

```text
STORAGE_BACKEND=cloud
```

照片上传后：

```text
Backend
   ↓
Cloud Storage
   ↓
数据库只保存 object key / URL
```

CloudBase 的 PG 环境本身已经包含云存储能力，因此没有必要再自己部署文件服务器。citeturn146075search1

完成后，Container 本地磁盘上不应再存在需要长期保存的业务状态。

---

## C.2 控制数据库连接池

你当前 SQLAlchemy Engine 使用：

```python
create_engine(
    database_url,
    pool_pre_ping=True
)
``` citeturn791401view0


以后多个 Backend 实例都会建立自己的连接池。

第一版建议把连接池显式控制得小一点，例如：

```python
create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)
```

两个实例理论最大：

```text
2 × (5 + 5)
```

避免因为实例增加无意中把 PostgreSQL 连接数撑高。

CloudBase 官方也建议 Serverless Backend 复用连接池，并根据实例数和数据库最大连接数设置池大小。citeturn146075search0

---

## C.3 开启两个实例

照片共享存储完成以后，修改 CloudBase Run：

```text
最小副本数：2
最大副本数：2
```

腾讯云自动负责：

```text
                ┌── Backend A
HTTPS Endpoint ─┤
                └── Backend B
```

不需要 Nginx，也不需要你自己写流量转发。

CloudBase Run 本身支持配置最小和最大实例副本数，并按照 CPU 或内存指标自动扩缩。citeturn356876search6

国庆测试先：

```text
2 / 2
```

最容易观察。

以后为了省钱可以：

```text
min = 1
max = 3
```

由平台自动扩容。

---

# Part D｜把 Mobile 变成真正可以安装的 APK

后端稳定以后，再做 Mobile。

目标是彻底摆脱：

```text
Expo Metro
USB
Android Emulator
你的电脑
```

最终：

```text
手机 APK
   ↓
Internet
   ↓
CloudBase
```

---

## D.1 API 地址环境化

Mobile 不应该再硬编码：

```text
localhost
10.0.2.2
192.168.x.x
```

统一改成例如：

```text
EXPO_PUBLIC_API_BASE_URL
```

开发环境：

```text
http://10.0.2.2:8000
```

国庆 Preview：

```text
https://你的CloudBase默认域名
```

代码只读取：

```typescript
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL;
```

注意：

> CloudBase Service 一旦用于 APK，就暂时不要删除并重建。

因为删除 Service 后默认域名会永久失效；即使重新创建同名 Service，也会获得新的默认域名。citeturn650776search11

更新同一个 Service 的版本没有问题。

---

## D.2 固定 Android Package Name

你当前 `app.json` 已经有 Android 配置，但还没有固定 `android.package`。citeturn359904view4

增加：

```json
"android": {
  "package": "com.mia.skincareagent"
}
```

这个以后就是 Android Application ID。

第一次确定之后不要随意更换。

---

## D.3 创建 Preview APK 配置

在：

```text
skin_care_agent/mobile
```

执行：

```bash
eas build:configure
```

生成：

```text
eas.json
```

建议：

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://你的CloudBase默认域名"
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

然后：

```bash
eas build -p android --profile preview
```

最终得到：

```text
xxxx.apk
```

APK 可以直接安装到 Android 真机；AAB 主要用于应用商店，不能像 APK 一样直接安装到普通设备。citeturn356876search0turn356876search5

Internal Distribution Build 本身也不依赖 Metro 开发服务器。citeturn356876search1turn356876search2

---

# Part E｜国庆真机联调流程

这时系统已经完整变成：

```text
Android APK
     │
     ▼
CloudBase HTTPS
     │
     ▼
Backend × 1/2
     │
     ├── PostgreSQL
     │
     └── Cloud Storage
```

真机测试不要随机到处点。

按照四轮来。

---

## Round 1｜安装与启动冒烟

使用一台没有安装过 App 的 Android 手机。

验证：

```text
APK 能安装
App 能独立启动
不需要 Metro
不需要电脑
首页正常
CloudBase /health 正常
```

然后分别：

```text
Wi-Fi
移动网络
```

运行一次。

这一轮只证明：

> App → Internet → CloudBackend 链路成立。

---

## Round 2｜完整核心业务闭环

按真实用户顺序完成一次：

```text
首次启动
   ↓
注册
   ↓
登录
   ↓
选择拍照
   ↓
相机授权
   ↓
拍摄原图
   ↓
选择面部区域
   ↓
上传照片
   ↓
AI 分析
   ↓
保存 Observation
   ↓
进入历程
   ↓
重新读取记录
```

再测试：

```text
相册选择图片
多区域选择
全脸选择
AI失败重试
补充文字
产品使用记录
```

验收标准：

> 当前 MVP 定义中的主要用户行为都能在真实手机 + 云端 Backend 环境完成。

---

## Round 3｜异常与恢复

开始故意破坏环境。

### 网络

```text
上传过程中断网

AI分析过程中：
Wi-Fi → 5G

AI分析过程中：
完全断网

断网后重新连接
```

期望：

```text
不会 Crash
状态不会错误丢失
用户能理解失败原因
允许重试
```

### 权限

第一次启动分别测试：

```text
拒绝 Camera
拒绝 Photo Library
之后重新授权
```

### App 生命周期

在：

```text
上传中
AI 分析中
结果页
```

分别：

```text
切后台
锁屏
强杀 App
重新打开
```

### 图片边界

你目前 Backend 默认上传上限是：

```text
8 MB
``` citeturn359904view1


所以特别测试：

```text
正常相机照片
高分辨率照片
接近 8 MB
超过 8 MB
```

---

## Round 4｜云端稳定性与多实例

完成 Cloud Storage 改造以后再执行这一轮。

CloudBase：

```text
min = 2
max = 2
```

然后反复：

```text
登录
查询 timeline
打开照片
新建 observation
AI 分析
刷新
```

确认无论请求落在哪个实例：

```text
数据一致
照片一致
登录状态正确
```

再人为重新部署 Backend 一个新版本。

新版启动完成后再次进入 App：

```text
历史数据还在
历史照片还在
登录/Refresh Token 行为正常
```

这一步非常关键。

它证明：

> Backend Container 已经真正变成可随时销毁和重新创建的无状态实例。

---

# 最终验收标准

国庆这一轮完成后，不要求它已经“可以上架”。

只要求下面这套系统成立：

```text
GitHub
   ↓
Dockerfile
   ↓
CloudBase Run
   ↓
FastAPI
   ├── PostgreSQL
   └── Cloud Storage

        ↑
        │ HTTPS
        │
Android Preview APK
```

并且做到：

```text
Backend 可以重新部署
数据库不会丢

Backend 可以增加实例
数据不会乱

Backend 实例被替换
照片不会丢

手机不连接电脑
App 仍然完整运行

Wi-Fi / 5G
都可以完成核心闭环
```

达到这里，就可以认为：

> **Skin Care Agent 已经从“本地开发项目”正式进入“可部署移动应用”的阶段。**

---

# 实际执行顺序

国庆前真正按照这个顺序做即可：

```text
Part A
Dockerfile
环境变量
本地 Docker 验证

        ↓

Part B
CloudBase 上海 PG 环境
Alembic 初始化
Run 单实例部署
公网 HTTPS 验证

        ↓

Part D
Mobile API 地址切 CloudBase
EAS Preview APK
真机安装

        ↓

Part E Round 1～3
完整单机真机联调

        ↓

Part C
照片迁 Cloud Storage
Backend 无状态化
开启两个实例

        ↓

Part E Round 4
多实例 + 重部署验证
```

这里有一个刻意的顺序调整：

**第一次真机联调不等多实例完成。**

先让：

```text
Cloud Backend × 1
+
PostgreSQL
+
Android APK
```

跑通。

再解决：

```text
Cloud Storage
+
Backend × 2
```

这样任何问题出现时，你都知道是“基础部署问题”还是“多实例问题”，不会一次把 Docker、数据库、对象存储、负载均衡、APK 五种变量搅在一起。