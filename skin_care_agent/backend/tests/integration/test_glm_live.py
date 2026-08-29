from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from app.config import Settings
from app.schemas.full_face_observation import FullFaceObservationFacts, validate_full_face_display
from app.services.ai_gateway.factory import _build_providers, _build_routes
from app.services.ai_gateway.gateway import AIGateway, HealthTracker
from app.services.ai_gateway.parsing import parse_llm_json
from app.services.ai_gateway.types import Message, UnifiedRequest
from app.services.full_face_prompt import (
    FULL_FACE_OBSERVATION_SYSTEM_PROMPT,
    FULL_FACE_OBSERVATION_USER_PROMPT,
)
from app.services.vision.image_prep import prepare_for_llm


@pytest.mark.asyncio
async def test_glm_live_returns_valid_full_face_facts() -> None:
    if os.getenv("RUN_LIVE_GLM_TEST") != "1":
        pytest.skip("set RUN_LIVE_GLM_TEST=1 to call the paid GLM API")

    env_file = os.getenv("LIVE_GLM_ENV_FILE")
    image_path = os.getenv("LIVE_GLM_IMAGE_PATH")
    if not env_file or not image_path:
        pytest.fail("LIVE_GLM_ENV_FILE and LIVE_GLM_IMAGE_PATH are required")

    settings = Settings(_env_file=env_file)
    assert settings.ai_provider_primary == "glm"
    assert settings.glm_api_key
    assert settings.glm_model == "glm-4.6v"

    providers = _build_providers(settings)
    routes = _build_routes(settings, providers)
    gateway = AIGateway(providers=providers, routes=routes, health=HealthTracker())
    prepared = prepare_for_llm(Path(image_path).read_bytes())
    request = UnifiedRequest(
        messages=[
            Message(role="system", content=FULL_FACE_OBSERVATION_SYSTEM_PROMPT),
            Message(
                role="user",
                content=FULL_FACE_OBSERVATION_USER_PROMPT,
                image_urls=[prepared.data_url],
            ),
        ],
        temperature=0.1,
        max_tokens=1024,
        response_format="json",
    )

    response = await gateway.invoke("vision_analyze", request)
    parsed = parse_llm_json(response.text)
    assert parsed.ok, response.text[:500]
    facts = FullFaceObservationFacts.model_validate(parsed.parsed)
    validate_full_face_display(facts)

    print(
        json.dumps(
            {
                "provider": response.provider,
                "model": response.model,
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "latency_ms": response.latency_ms,
                "facts": facts.model_dump(),
            },
            ensure_ascii=False,
        )
    )
