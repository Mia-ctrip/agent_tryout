from __future__ import annotations

from abc import ABC, abstractmethod

from app.services.ai_gateway.types import Capability, UnifiedRequest, UnifiedResponse


class Provider(ABC):
    """Wire-protocol adapter. One Provider per (base_url, protocol) combo."""

    name: str
    capabilities: set[Capability]

    @abstractmethod
    async def invoke(self, model: str, req: UnifiedRequest, timeout_s: float) -> UnifiedResponse:
        """Send one request. Translate UnifiedRequest into the provider's native schema.

        Must raise one of:
          - RetryableError: transient (5xx / timeout / 429 / parse failure)
          - DeadProviderError: auth/quota issues, mark unhealthy
          - FatalRequestError: 400 / bad request / compliance violation
        """
