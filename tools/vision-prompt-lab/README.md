# Skin Care Vision Prompt Lab

本地内部工具，用于快速调试 GLM-4.6V 的单图观察、双图对比和多图时间轴 Prompt。

## 启动

```powershell
cd tools/vision-prompt-lab/backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
# 编辑 .env，填入 GLM_API_KEY
.venv\Scripts\uvicorn app.main:app --reload --port 8000

cd ..\frontend
npm install
npm run dev
```

前端打开 http://localhost:5173。GLM 配置只读后端 `.env`：`GLM_API_KEY`、`GLM_BASE_URL`、`GLM_MODEL`。

实验记录保存在 `data/runs.json`，Preset 在 `data/presets.json`，去重图片在 `data/images/`。图片按 SHA-256 文件内容命名。

后端使用独立的 OpenAI-compatible GLM client；其 payload 规则与仓库已有 GLM provider 保持一致：`/chat/completions`、Bearer key、视觉请求关闭 thinking。

