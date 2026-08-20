from __future__ import annotations


class GatewayError(Exception):
    """Base for all AI gateway errors."""


class RetryableError(GatewayError):
    """Transient: 5xx / timeout / 429 / JSON schema mismatch. Retry then fallback."""


class DeadProviderError(GatewayError):
    """401/403/402: provider unusable for a while. Mark unhealthy, skip."""


class FatalRequestError(GatewayError):
    """400 / programmer error / compliance violation: do NOT fallback, raise."""


class AllProvidersFailedError(GatewayError):
    """Every node in the route chain failed."""

    def __init__(self, task: str, attempts: list[dict]):
        super().__init__(f"All providers failed for task={task}")
        self.task = task
        self.attempts = attempts
