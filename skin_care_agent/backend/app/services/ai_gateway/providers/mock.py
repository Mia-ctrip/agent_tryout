from __future__ import annotations

import asyncio
import time

from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.types import (
    Capability,
    TokenUsage,
    UnifiedRequest,
    UnifiedResponse,
)


class MockProvider(Provider):
    """Returns a canned response. Used for dev / tests when no real API key is set."""

    def __init__(
        self,
        name: str = "mock",
        capabilities: set[Capability] | None = None,
        latency_ms: int = 20,
    ):
        self.name = name
        self.capabilities = capabilities or {
            Capability.TEXT,
            Capability.VISION,
            Capability.JSON_MODE,
        }
        self._latency_ms = latency_ms

    async def invoke(
        self, model: str, req: UnifiedRequest, timeout_s: float
    ) -> UnifiedResponse:
        start = time.monotonic()
        await asyncio.sleep(self._latency_ms / 1000)

        last_user = next(
            (m.content for m in reversed(req.messages) if m.role == "user"), ""
        )
        if req.response_format == "json":
            text = '{"echo": ' + repr(last_user) + ', "mock": true}'
        else:
            text = f"[mock:{model}] {last_user}"

        return UnifiedResponse(
            text=text,
            provider=self.name,
            model=model,
            usage=TokenUsage(input_tokens=len(last_user), output_tokens=len(text)),
            raw={"mock": True},
            latency_ms=int((time.monotonic() - start) * 1000),
        )
