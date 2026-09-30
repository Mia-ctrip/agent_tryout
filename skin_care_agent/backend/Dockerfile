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

# 启动前迁移到 head；env.py 用 PostgreSQL advisory lock 串行化，多副本同时启动也只执行一次。
# APP_ENV 非 dev 时，缺少关键配置（签名密钥、AI Key、数据库等）会在启动阶段直接失败。
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
