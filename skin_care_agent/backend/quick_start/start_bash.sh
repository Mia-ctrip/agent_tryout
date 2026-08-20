1. 启动后端：
  cd backend
  .venv\Scripts\activate
  alembic upgrade head
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

2. 打开：

  http://localhost:8000/docs