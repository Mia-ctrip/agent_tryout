from __future__ import annotations

from typing import Any

from app.services.ai_gateway.providers.openai_compat import OpenAICompatProvider
from app.services.ai_gateway.types import UnifiedRequest


class GLMProvider(OpenAICompatProvider):
    """GLM chat-completions adapter with its vision-specific request contract."""

    def _build_payload(self, model: str, req: UnifiedRequest) -> dict[str, Any]:
        payload = super()._build_payload(model, req)
        if any(message.image_urls for message in req.messages):
            # GLM documents response_format for text models only. The full-face
            # flow instead enforces JSON through its prompt and local schema guard.
            payload.pop("response_format", None)
            payload["thinking"] = {"type": "disabled"}
        return payload
