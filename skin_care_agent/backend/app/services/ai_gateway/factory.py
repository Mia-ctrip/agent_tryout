"""Build the AIGateway singleton from app settings.

Provider registry is hard-coded for MVP. Tasks (vision_analyze / chat_qa) are wired here.
Move to yaml in a later iteration.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import Settings, get_settings
from app.services.ai_gateway.gateway import AIGateway, HealthTracker
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.providers.glm import GLMProvider
from app.services.ai_gateway.providers.mock import MockProvider
from app.services.ai_gateway.providers.openai_compat import OpenAICompatProvider
from app.services.ai_gateway.routes import ModelBinding, ModelRoute
from app.services.ai_gateway.types import Capability


def _build_providers(s: Settings) -> dict[str, Provider]:
    providers: dict[str, Provider] = {
        "mock": MockProvider(),
    }

    if s.minimax_api_key:
        providers["minimax"] = OpenAICompatProvider(
            name="minimax",
            base_url=s.minimax_base_url,
            api_key=s.minimax_api_key,
            capabilities={
                Capability.TEXT,
                Capability.VISION,
                Capability.JSON_MODE,
                Capability.TOOL_USE,
            },
        )

    if s.deepseek_api_key:
        providers["deepseek"] = OpenAICompatProvider(
            name="deepseek",
            base_url=s.deepseek_base_url,
            api_key=s.deepseek_api_key,
            capabilities={Capability.TEXT, Capability.JSON_MODE, Capability.TOOL_USE},
        )

    if s.qwen_api_key:
        providers["qwen"] = OpenAICompatProvider(
            name="qwen",
            base_url=s.qwen_base_url,
            api_key=s.qwen_api_key,
            capabilities={Capability.TEXT, Capability.VISION},
        )

    if s.glm_api_key:
        providers["glm"] = GLMProvider(
            name="glm",
            base_url=s.glm_base_url,
            api_key=s.glm_api_key,
            capabilities={Capability.TEXT, Capability.VISION, Capability.JSON_MODE},
        )

    if s.doubao_api_key:
        providers["doubao"] = OpenAICompatProvider(
            name="doubao",
            base_url=s.doubao_base_url,
            api_key=s.doubao_api_key,
            capabilities={Capability.TEXT, Capability.VISION},
        )

    return providers


def _build_routes(s: Settings, providers: dict[str, Provider]) -> dict[str, ModelRoute]:
    model_by_provider = {
        "mock": "mock-v1",
        "glm": s.glm_model,
        "minimax": s.minimax_model,
        "qwen": s.qwen_model,
        "doubao": s.doubao_model,
        "deepseek": s.deepseek_model,
    }
    configured_names = [s.ai_provider_primary.strip(), *s.fallback_providers]
    ordered_names = list(dict.fromkeys(name for name in configured_names if name))
    configured_chain = tuple(
        ModelBinding(name, model_by_provider[name])
        for name in ordered_names
        if name in model_by_provider
    )

    return {
        "vision_analyze": ModelRoute(
            task="vision_analyze",
            chain=configured_chain,
            requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
            timeout_s=90.0,
            max_retries_per_node=1,
        ),
        "chat_qa": ModelRoute(
            task="chat_qa",
            chain=configured_chain,
            requires=frozenset({Capability.TEXT}),
            timeout_s=15.0,
            max_retries_per_node=1,
        ),
    }


@lru_cache
def get_gateway() -> AIGateway:
    s = get_settings()
    providers = _build_providers(s)
    routes = _build_routes(s, providers)
    return AIGateway(providers=providers, routes=routes, health=HealthTracker())
