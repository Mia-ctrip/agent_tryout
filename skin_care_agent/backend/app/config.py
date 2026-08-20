from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # app
    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_log_level: str = "INFO"
    api_v1_prefix: str = "/api/v1"
    cors_allowed_origins: str = ""

    # db
    database_url: str = "postgresql+psycopg://skin:skin@localhost:5432/skin_care"

    # storage
    storage_backend: str = "local"
    storage_local_dir: str = "./storage_local"
    storage_local_base_url: str = "http://localhost:8000/files"
    storage_url_sign_secret: str = "dev-only-change-me"
    storage_url_ttl_seconds: int = 900  # 15 minutes

    # upload constraints
    upload_max_bytes: int = 8 * 1024 * 1024  # 8MB
    upload_allowed_mimes: str = "image/jpeg,image/png,image/webp"
    photo_quality_save_rejected_in_dev: bool = False

    # ai rate limit
    ai_analyze_daily_limit: int = 10
    ai_chat_daily_limit: int = 50
    ai_ratelimit_enforce_in_dev: bool = False  # dev 环境默认豁免；true 时强制开启

    # auth
    auth_access_token_ttl_seconds: int = 15 * 60
    auth_refresh_token_ttl_seconds: int = 30 * 24 * 60 * 60
    auth_registration_enabled: bool = True

    # required consent document versions
    consent_terms_version: str = "2026-07-16"
    consent_privacy_version: str = "2026-07-16"
    consent_health_disclaimer_version: str = "2026-07-16"
    consent_ai_processing_version: str = "2026-07-16"

    # ai providers
    ai_provider_primary: str = "mock"
    ai_provider_fallbacks: str = ""

    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-vl-max"

    glm_api_key: str = ""
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    glm_model: str = "glm-4.6v"

    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimaxi.com/v1"
    minimax_model: str = "MiniMax-M3"

    doubao_api_key: str = ""
    doubao_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    doubao_model: str = "doubao-vision-pro"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-chat"

    # optional future identity provider
    wx_appid: str = ""
    wx_secret: str = Field(default="")

    @property
    def fallback_providers(self) -> list[str]:
        return [p.strip() for p in self.ai_provider_fallbacks.split(",") if p.strip()]

    @property
    def storage_local_path(self) -> Path:
        p = Path(self.storage_local_dir)
        if not p.is_absolute():
            p = BACKEND_ROOT / p
        return p

    @property
    def allowed_mime_set(self) -> set[str]:
        return {m.strip() for m in self.upload_allowed_mimes.split(",") if m.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_allowed_origins.split(",") if item.strip()]

    @property
    def required_consents(self) -> dict[str, str]:
        return {
            "terms": self.consent_terms_version,
            "privacy": self.consent_privacy_version,
            "health_disclaimer": self.consent_health_disclaimer_version,
            "ai_processing": self.consent_ai_processing_version,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
