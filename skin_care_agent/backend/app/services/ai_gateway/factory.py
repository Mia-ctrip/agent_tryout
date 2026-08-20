"""Build the AIGateway singleton from app settings.

Provider registry is hard-coded for MVP. Tasks (vision_analyze / chat_qa) are wired here.
Move to yaml in a later iteration.
"""

from __future__ import annotations

from functools import lru_cache

from app.config import Settings, get_settings
from app.services.ai_gateway.gateway import AIGateway, HealthTracker
from app.services.ai_gateway.providers.base import Provider
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
        providers["glm"] = OpenAICompatProvider(
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
    # Vision: GLM-4.6V 优先（体验包 500 万 token），MiniMax M3 兜底。
    vision_chain = [
        ModelBinding("glm", s.glm_model),
        ModelBinding("minimax", s.minimax_model),
        ModelBinding("qwen", s.qwen_model),
        ModelBinding("doubao", s.doubao_model),
    ]
    # Chat: prefer MiniMax fast models; cross-vendor fallback to DeepSeek.
    chat_chain = [
        ModelBinding("minimax", s.minimax_model),
        ModelBinding("deepseek", s.deepseek_model),
    ]

    if not providers or set(providers.keys()) == {"mock"}:
        # Dev mode: route everything to mock so the API is usable without keys.
        mock_chain = (ModelBinding("mock", "mock-v1"),)
        return {
            "vision_analyze": ModelRoute(
                task="vision_analyze",
                chain=mock_chain,
                requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
            ),
            "chat_qa": ModelRoute(
                task="chat_qa", chain=mock_chain, requires=frozenset({Capability.TEXT})
            ),
        }

    return {
        "vision_analyze": ModelRoute(
            task="vision_analyze",
            chain=tuple(b for b in vision_chain if b.provider in providers),
            requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
            timeout_s=90.0,
            max_retries_per_node=1,
        ),
        "chat_qa": ModelRoute(
            task="chat_qa",
            chain=tuple(b for b in chat_chain if b.provider in providers),
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
