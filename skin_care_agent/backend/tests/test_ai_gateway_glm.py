from __future__ import annotations

from app.config import Settings
from app.services.ai_gateway.factory import _build_providers, _build_routes
from app.services.ai_gateway.types import Message, UnifiedRequest


def _settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "ai_provider_primary": "glm",
        "ai_provider_fallbacks": "",
        "glm_api_key": "glm-secret",
        "minimax_api_key": "minimax-secret",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_fallback_parser_ignores_inline_comment_from_env_template() -> None:
    settings = _settings(ai_provider_fallbacks="# comma-separated, e.g. qwen,doubao")

    assert settings.fallback_providers == []


def test_vision_route_uses_only_configured_primary_when_fallbacks_are_empty() -> None:
    settings = _settings()
    providers = _build_providers(settings)

    route = _build_routes(settings, providers)["vision_analyze"]

    assert [(binding.provider, binding.model) for binding in route.chain] == [
        ("glm", "glm-4.6v")
    ]


def test_explicit_glm_without_key_does_not_silently_route_to_mock() -> None:
    settings = _settings(glm_api_key="", minimax_api_key="")
    providers = _build_providers(settings)

    route = _build_routes(settings, providers)["vision_analyze"]

    assert [binding.provider for binding in route.chain] == ["glm"]


def test_glm_vision_payload_disables_thinking_without_text_only_json_mode() -> None:
    settings = _settings()
    provider = _build_providers(settings)["glm"]
    request = UnifiedRequest(
        messages=[
            Message(
                role="user",
                content="Return the visible facts as JSON.",
                image_urls=["data:image/jpeg;base64,ZmFrZQ=="],
            )
        ],
        temperature=0.1,
        max_tokens=1024,
        response_format="json",
    )

    payload = provider._build_payload("glm-4.6v", request)  # type: ignore[attr-defined]

    assert payload["thinking"] == {"type": "disabled"}
    assert payload["max_tokens"] == 1024
    assert "response_format" not in payload
    assert payload["messages"][0]["content"][1] == {
        "type": "image_url",
        "image_url": {"url": "data:image/jpeg;base64,ZmFrZQ=="},
    }
