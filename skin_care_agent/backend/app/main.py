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
    files,
    health,
    lineages,
    me,
    photos,
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
    api_v1.include_router(photos.router)
    api_v1.include_router(check_ins.router)
    api_v1.include_router(analyses.router)
    api_v1.include_router(chat.router)
    api_v1.include_router(lineages.router)
    api_v1.include_router(trends.router)
    if settings.app_env == "dev":
        api_v1.include_router(ai_debug.router)
    app.include_router(api_v1)

    return app


app = create_app()
