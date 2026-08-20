> **历史归档说明（2026-07-20）**：本文是早期路线草稿，不作为当前计划或进度来源。当前主线见 [`../project_background.md`](../project_background.md) 和 [`../backend/dev_notes.md`](../backend/dev_notes.md)。以下原文保留用于追溯历史。

1. 基础脚手架：FastAPI 起项目、配置、PG 连接、alembic 初始迁移、健康检查端点 → 跑通 GET /health
2. storage_service + 上传：本地实现 + photos 表 + POST /photos → 能上传一张图、能签 URL 读回来
3. ai_service Mock 版：mock provider + 合规中间件 + schema_guard + 限流 → POST /analyses 返回假数据但全链路通
4. vision 模块：MediaPipe 对齐 + 眼部打码 + 标注图渲染（不含 tracker）
5. 接入真实 LLM（Qwen-VL 优先）+ Provider 降级链
6. vision.tracker（A1 核心）：跨日匹配 + lifecycle 状态机 + acne_points 表
7. trends + diary + medications + chat + 小程序对接
8. 首启免责声明 + checkNeedDoctor 规则（合规收尾）


已建立的文件

skin_care_agent/
├── .gitignore                              # 忽略 .env、storage_local、venv
└── backend/
    ├── pyproject.toml                      # 依赖声明（FastAPI/PG/alembic/mediapipe/opencv 等）
    ├── alembic.ini
    ├── .env.example                        # 所有环境变量模板（密钥占位）
    ├── README.md                           # 启动指南 + 进度跟踪
    └── app/
        ├── __init__.py
        ├── main.py                         # FastAPI 入口、CORS、lifespan
        ├── config.py                       # pydantic-settings 读 .env
        ├── api/
        │   └── health.py                   # /health 和 /health/db
        ├── db/
        │   ├── session.py                  # SQLAlchemy engine + get_db 依赖
        │   └── migrations/                 # alembic（env.py + script.py.mako + versions/）
        └── models/
            └── base.py                     # DeclarativeBase + IdMixin + TimestampMixin
