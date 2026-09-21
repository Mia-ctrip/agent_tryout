
# Skin Care Agent｜腾讯云 CloudBase 控制台实操部署指南

> 本文记录 2026-09-20 实际结合腾讯云 CloudBase 控制台走过的部署流程，重点记录真实页面路径、字段填写方式、常见误区和本次实际遇到的部署错误。

## 0. 部署目标

第一阶段目标：

    CloudBase 环境
        ├── PostgreSQL
        └── CloudBase Run
                └── FastAPI Backend

先跑通：

    公网 HTTPS → CloudBase Run → FastAPI → PostgreSQL

Android APK 和 COS 图片存储不作为第一阶段部署成功的阻塞项。

## 1. 本地项目准备

CloudBase Run 只部署：

    skin_care_agent/backend

不部署：

    mobile/
    Expo Metro
    Android Emulator
    start-all.ps1

Backend 已使用 FastAPI、Uvicorn、SQLAlchemy、psycopg 和 Alembic。

### 1.1 Dockerfile

文件：

    skin_care_agent/backend/Dockerfile

正式启动命令：

    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

第一次需要在云内网执行数据库迁移时，可以临时使用：

    CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]

注意：

- 0.0.0.0 是 FastAPI 在容器内监听所有网卡的地址。
- 0.0.0.0 不是 PostgreSQL 的 Host。
- 数据库 Host 必须使用腾讯云提供的真实内网域名或 IP。
- 迁移完成后，应恢复为只启动 Uvicorn 的命令。

### 1.2 .dockerignore

文件：

    skin_care_agent/backend/.dockerignore

至少排除：

    .env
    .venv
    __pycache__
    .pytest_cache
    *.log
    storage_local
    storage_debug
    tests

.env 不得进入 Docker 镜像。数据库密码和 AI Key 通过 CloudBase Run 环境变量注入。

## 2. 创建 CloudBase 环境

控制台入口：

    云开发 CloudBase → 创建环境

本次实际选择：

    地域：上海
    环境名称：skin-care-agent
    套餐版本：免费体验版
    数据库：PostgreSQL 数据库
    购买时长：免费试用 6 个月

环境名称只使用小写字母、数字和连字符，建议使用：

    skin-care-agent

环境创建后不要再次创建第二个 PostgreSQL 实例。CloudBase 已经自动创建实例。

本次环境页面显示的环境 ID 类似：

    skin-care-agent-d1feekt513cf1626

实际部署以控制台当前显示的环境 ID 为准。

## 3. PostgreSQL 实例

进入：

    SQL 型数据库 → PostgreSQL

如果看到实例状态“运行中”，说明数据库已经准备好，不需要再次购买或创建实例。

### 3.1 获取数据库名、用户名、端口

进入：

    PostgreSQL 管理 → SQL 编辑器

SQL 编辑器只能执行 SQL，不能执行 alembic、docker 或 Shell 命令。

执行：

    SELECT
      current_database() AS database_name,
      current_user AS username,
      inet_server_port() AS port;

本次实际得到：

    database_name：pgdb-gq7gayxj
    username：cloudbase_postgres_pgdb_gq7gayxj
    port：50169

### 3.2 设置数据库密码

进入：

    配置管理 → 数据库密码 → 重置数据库密码

密码创建后不会再次显示，请保存到密码管理器，不要提交 Git，也不要发到聊天中。

### 3.3 内网地址和外网地址

正式运行优先使用内网连接，不要为了本地调试立即新增实例或开启外网 IP。

数据库 Host 必须是控制台提供的：

    内网地址 / 内网域名

不能使用：

    0.0.0.0
    localhost
    pgdb-gq7gayxj

其中 pgdb-gq7gayxj 是数据库名/实例标识，不是网络地址。

如果页面显示“内网地址：-”，不要猜 Host。应在 CloudBase Run 网络/VPC 配置中连接当前 CloudBase 环境的网络，并获取腾讯云提供的内网连接地址。

外网 IPv4 适合开发或辅助管理。开启外网会增加数据库暴露面，正式业务优先使用内网。

### 3.4 DATABASE_URL

在 CloudBase Run 环境变量中配置：

    Key：
    DATABASE_URL

    Value：
    postgresql+psycopg://cloudbase_postgres_pgdb_gq7gayxj:实际密码@实际内网Host:50169/pgdb-gq7gayxj

Value 必须是一整行，不能保留“实际密码”和“实际内网Host”这样的占位文字。

如果密码包含 @、#、/、: 等特殊字符，需要先进行 URL 编码。

## 4. CloudBase Run 创建服务

控制台入口：

    云函数 / 托管 → 云托管 → 新建服务

### 4.1 GitHub 授权

如果页面显示“GitHub 未授权”，先点击：

    代码权限未授权或授权过期 → 点击授权

完成 GitHub 授权后回到 CloudBase 并刷新页面，仓库下拉框才会出现内容。

本项目配置：

    仓库：Mia-ctrip/agent_tryout
    分支：实际部署分支，通常是 main

### 4.2 基础配置

    服务名称：skin-care-backend
    目标目录：skin_care_agent/backend
    Dockerfile：Dockerfile

不要只填 skin_care_agent。因为 Dockerfile 实际位于：

    skin_care_agent/backend/Dockerfile

CloudBase 要求 Dockerfile 位于目标目录根目录。

### 4.3 端口配置

项目 Dockerfile 和 Uvicorn 使用端口 8000。

正确配置：

    访问端口：80（如果页面固定或不可编辑，可以保持）
    服务端口：8000

本次实际失败原因就是把服务端口保留成了 80：

    Liveness probe failed: dial tcp 10.10.12.236:80: connect: connection refused

但容器日志显示：

    Uvicorn running on http://0.0.0.0:8000

所以 CloudBase 健康检查访问了 80，而 FastAPI 只监听 8000。修复方法是把“服务端口”改成 8000 后重新部署。

### 4.4 环境变量

展开：

    环境变量设置

选择“可视化输入”，逐行添加：

    APP_ENV=staging
    DATABASE_URL=postgresql+psycopg://cloudbase_postgres_pgdb_gq7gayxj:密码@内网Host:50169/pgdb-gq7gayxj
    STORAGE_BACKEND=local

AI Provider 的 Key 也在这里添加，例如：

    AI_PROVIDER_PRIMARY=glm
    GLM_API_KEY=实际密钥

不要打开“API Key 设置”来配置项目 AI Key。那个入口是 CloudBase 平台 API 权限，不是应用环境变量。

### 4.5 副本数和公网访问

第一阶段：

    公网访问：开启
    最小副本数：1
    最大副本数：1

当前项目照片仍然保存在容器本地磁盘，因此暂时不要开多实例。

## 5. Alembic 迁移

### 5.1 SQL 编辑器不能执行 Alembic

错误做法：

    在 SQL 编辑器输入 alembic upgrade head

结果会报：

    syntax error at or near "alembic"

原因是 SQL 编辑器不是 Shell。

### 5.2 内网数据库的迁移方式

如果本地电脑无法访问数据库内网地址，第一次部署时让容器先迁移再启动：

    CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]

CloudBase Run 必须先配置好 DATABASE_URL。

容器启动顺序：

    alembic upgrade head
        ↓ 成功
    启动 uvicorn

迁移完成并确认服务正常后，恢复：

    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

如果 CloudBase 页面提供“启动命令”覆盖项，也可以只临时修改服务配置，不修改 Dockerfile。

## 6. 查看部署日志和服务 URL

进入：

    云托管 → 服务列表 → skin-care-backend → 服务详情

查找：

    服务域名
    默认域名
    访问地址

先测试：

    https://你的域名/health

健康检查是 /health，不是 /api/v1/health。

移动端以后配置：

    EXPO_PUBLIC_API_URL=https://你的域名/api/v1

## 7. 本次真实问题总结

### 问题一：把 Alembic 当 SQL 执行

SQL 编辑器只能执行 SQL。Alembic 必须在 Python 环境或 Backend 容器里执行。

### 问题二：服务端口错误

容器监听 8000，CloudBase 探针检查 80，导致：

    Liveness probe failed

修复：

    CloudBase 服务端口：8000
    FastAPI：8000

### 问题三：APP_ENV 没有注入

日志曾显示：

    App starting up. env=dev

这说明当前版本没有读取到：

    APP_ENV=staging

需要检查环境变量是否保存到当前发布版本，并重新部署。

## 8. PostgreSQL 和 COS 后续处理

### 8.1 PostgreSQL

数据库部分已经有 Alembic，不需要手工创建业务表：

    alembic upgrade head

### 8.2 当前照片存储

当前配置：

    STORAGE_BACKEND=local

照片会写入容器本地磁盘。单实例测试可以暂时使用，但容器重建或扩展多实例后不保证照片仍然存在。

### 8.3 COS 改造方向

项目现在已经增加 COS 存储实现，代码文件为：

    backend/app/services/storage_service/cos.py

它实现现有 StorageBackend 接口：

    put()
    get()
    exists()
    delete()
    signed_url()

构建新镜像后，云端环境变量改为：

    STORAGE_BACKEND=cos
    COS_SECRET_ID=...
    COS_SECRET_KEY=...
    COS_REGION=ap-shanghai
    COS_BUCKET=...

Bucket 建议私有读写，由 Backend 生成临时签名 URL，不要设置成公开读。

## 9. 当前验收清单

已实际走过：

- [x] 创建上海 CloudBase 环境
- [x] 选择 PostgreSQL 类型环境
- [x] 确认 PostgreSQL 实例运行中
- [x] 准备 Dockerfile 和 .dockerignore
- [x] 完成 GitHub 授权入口
- [x] CloudBase 镜像构建成功
- [x] 创建并尝试部署 CloudBase Run 服务
- [x] 定位到端口探针失败原因

待完成：

- [ ] 将 CloudBase 服务端口改为 8000
- [ ] 确认内网 PostgreSQL Host
- [ ] 确认 DATABASE_URL 注入当前版本
- [ ] 重新部署并通过 /health
- [ ] 通过 /health/db 验证数据库连接
- [ ] 确认 Alembic 迁移成功
- [ ] 测试注册、登录、Observation 和 AI 请求
- [ ] 将照片存储从 local 改为 COS
- [ ] 生成配置 CloudBase URL 的 Android Preview APK

## 10. 推荐执行顺序

    修正 CloudBase 服务端口为 8000
            ↓
    确认内网 PostgreSQL Host
            ↓
    配置 DATABASE_URL
            ↓
    容器执行 Alembic
            ↓
    访问 /health
            ↓
    访问 /health/db
            ↓
    注册、登录和核心业务验证
            ↓
    COS 存储改造
            ↓
    Android Preview APK
            ↓
    多实例测试

第一阶段不需要购买轻量应用服务器，也不需要 ECS、Nginx、Docker Compose 或额外的 PostgreSQL 实例。

## 11. 假期前建议补齐的流程

以下项目按优先级排序。

### P0：部署前必须完成

#### 11.1 修正服务端口

确认 CloudBase Run 配置为：

    服务端口：8000

这是本次已经实际遇到的阻塞问题。容器日志显示应用监听 8000，但探针访问 80 时，版本会直接判定部署失败。

#### 11.2 确认内网 PostgreSQL Host

不要使用 0.0.0.0、localhost 或实例 ID。确认 CloudBase Run 的网络/VPC 配置可以访问 PostgreSQL，并把真实内网 Host 记录到部署信息中。

#### 11.3 确认环境变量已经进入新版本

部署后查看启动日志，必须看到：

    env=staging

如果仍然看到 env=dev，说明 APP_ENV 没有进入当前发布版本。

至少确认：

    APP_ENV=staging
    DATABASE_URL=...
    STORAGE_BACKEND=local

#### 11.4 完成一次数据库迁移并验证

在云内网容器中执行 Alembic 后，检查：

    alembic_version

并访问：

    /health
    /health/db

迁移完成后，把 Dockerfile 从“迁移后启动”恢复为“只启动 Uvicorn”，避免每次容器重启都执行迁移。

#### 11.5 固定可回滚版本

假期前不要直接依赖 GitHub 的持续变化。建议至少记录：

    Git commit SHA
    Docker 镜像标签
    CloudBase Run 版本号
    数据库 Alembic revision

部署新版本时不要删除原服务，保留上一稳定版本用于回滚。

### P1：真机联调前必须完成

#### 11.6 先完成 Backend 真实业务冒烟

按顺序测试：

    /health
    /health/db
    注册
    登录
    刷新 Token
    创建 observation
    上传照片
    AI 分析
    查询 timeline

不要只验证 /health。/health 只代表进程监听正常，不代表数据库、AI Provider 和图片上传正常。

#### 11.7 明确 AI Provider 和额度

把实际使用的 Provider、模型和 Key 记录到离线部署清单中，并确认：

    AI_PROVIDER_PRIMARY
    对应 API Key
    模型名称
    额度/限流

API Key 只放 CloudBase Run 环境变量，不写入 Git、Dockerfile 或 APK。

#### 11.8 完成 Mobile 的云端配置

移动端最终使用：

    EXPO_PUBLIC_API_URL=https://CloudBase默认域名/api/v1

不要把 localhost、127.0.0.1 或 10.0.2.2 打包进假期联调 APK。

在 app.json 中固定：

    android.package=com.mia.skincareagent

然后使用 EAS Preview APK 构建，真机安装后分别验证 Wi-Fi 和移动网络。

### P2：正式多实例前必须完成

#### 11.9 把照片从 local 迁移到 COS

当前 STORAGE_BACKEND=local 时，照片保存在容器磁盘。容器重建、换实例或扩容后，不应假定照片仍然存在。

在打开多实例前必须完成：

    COS Bucket
    CosStorage 实现
    私有读写权限
    Backend 临时签名 URL
    历史照片读取验证

#### 11.10 控制数据库连接池

多实例前检查 SQLAlchemy 连接池大小，按实例数估算最大连接数，避免实例增加后耗尽 PostgreSQL 连接。

第一阶段单实例不需要为了理论上的高并发提前做复杂连接池改造。

## 12. 建议准备一份离线部署卡片

假期时至少保存以下信息，不要只放在聊天记录中：

    CloudBase 环境 ID
    CloudBase Run 服务名
    当前稳定版本号
    Git commit SHA
    Docker 镜像标签
    服务域名
    PostgreSQL 实例 ID
    PostgreSQL 内网 Host 和端口
    Alembic revision
    AI Provider 名称
    APK 下载地址

密码、SecretKey 和 AI Key 只放密码管理器，不写进这张卡片。

## 13. 假期部署的最小可靠路径

如果时间有限，优先完成下面这条链：

    CloudBase Run 服务端口 8000
        ↓
    内网 PostgreSQL 连接
        ↓
    Alembic migration
        ↓
    /health 和 /health/db
        ↓
    单实例注册登录
        ↓
    单实例照片上传和 AI 分析
        ↓
    Android Preview APK

COS、多实例和自动扩缩容放在这条链稳定之后。当前 local 存储只能用于单实例联调，不能作为长期生产存储。
