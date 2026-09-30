from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    ai_debug,
    analyses,
    auth,
    chat,
    check_ins,
    dev_product_catalog,
    files,
    health,
    lineages,
    me,
    observations,
    photos,
    product_catalog,
    products,
    region_events,
    timeline,
    trends,
)
from app.config import get_settings
from app.services.vision.quality import close_quality_model


settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.app_log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("skin_care_agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("App starting up. env=%s", settings.app_env)
    config_errors = settings.deployment_config_errors()
    if config_errors:
        # 拒绝以开发默认值对外服务（伪造照片签名、Mock AI、容器本地照片等）。
        raise RuntimeError("invalid deployment config: " + "; ".join(config_errors))
    try:
        yield
    finally:
        close_quality_model()
        logger.info("App shutting down.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Skin Care Agent API",
        version="0.2.0",
        lifespan=lifespan,
    )

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(files.router)

    api_v1 = APIRouter(prefix=settings.api_v1_prefix)
    api_v1.include_router(auth.router)
    api_v1.include_router(me.router)
    api_v1.include_router(observations.router)
    api_v1.include_router(region_events.router)
    api_v1.include_router(product_catalog.catalog_router)
    api_v1.include_router(products.products_router)
    api_v1.include_router(products.product_uses_router)
    api_v1.include_router(timeline.router)
    api_v1.include_router(photos.router)
    if settings.app_env == "dev":
        # Legacy 三视角、医学分析、聊天与旧趋势只留给开发环境回看，不对外暴露。
        api_v1.include_router(photos.legacy_upload_router)
        api_v1.include_router(check_ins.router)
        api_v1.include_router(analyses.router)
        api_v1.include_router(chat.router)
        api_v1.include_router(lineages.router)
        api_v1.include_router(trends.router)
        api_v1.include_router(ai_debug.router)
        api_v1.include_router(dev_product_catalog.dev_catalog_router)
    app.include_router(api_v1)

    return app


app = create_app()
