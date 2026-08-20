from __future__ import annotations

import time
from typing import Any

import httpx

from app.services.ai_gateway.errors import (
    DeadProviderError,
    FatalRequestError,
    RetryableError,
)
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.types import (
    Capability,
    Message,
    TokenUsage,
    UnifiedRequest,
    UnifiedResponse,
)


class OpenAICompatProvider(Provider):
    """Talks to any /v1/chat/completions OpenAI-compatible endpoint.

    Covers MiniMax (api.minimaxi.com/v1), DeepSeek, Qwen DashScope compat, GLM, etc.
    """

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str,
        capabilities: set[Capability],
    ):
        self.name = name
        self.capabilities = capabilities
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def invoke(
        self, model: str, req: UnifiedRequest, timeout_s: float
    ) -> UnifiedResponse:
        url = f"{self._base_url}/chat/completions"
        payload = self._build_payload(model, req)
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        start = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=timeout_s) as client:
                resp = await client.post(url, headers=headers, json=payload)
        except (httpx.TimeoutException, httpx.TransportError) as e:
            raise RetryableError(f"{self.name} transport error: {e}") from e

        latency_ms = int((time.monotonic() - start) * 1000)
        self._raise_for_status(resp)

        try:
            body = resp.json()
        except ValueError as e:
            raise RetryableError(f"{self.name} returned non-JSON body") from e

        return self._parse_response(model, body, latency_ms)

    def _build_payload(self, model: str, req: UnifiedRequest) -> dict[str, Any]:
        messages = [self._encode_message(m) for m in req.messages]
        payload: dict[str, Any] = {"model": model, "messages": messages}
        if req.temperature is not None:
            payload["temperature"] = req.temperature
        if req.max_tokens is not None:
            payload["max_tokens"] = req.max_tokens
        if req.response_format == "json":
            payload["response_format"] = {"type": "json_object"}
        return payload

    @staticmethod
    def _encode_message(m: Message) -> dict[str, Any]:
        if not m.image_urls:
            return {"role": m.role, "content": m.content}
        parts: list[dict[str, Any]] = []
        if m.content:
            parts.append({"type": "text", "text": m.content})
        for url in m.image_urls:
            parts.append({"type": "image_url", "image_url": {"url": url}})
        return {"role": m.role, "content": parts}

    def _raise_for_status(self, resp: httpx.Response) -> None:
        if resp.is_success:
            return
        code = resp.status_code
        body = resp.text[:500]
        if code in (401, 403, 402):
            raise DeadProviderError(f"{self.name} auth/quota error {code}: {body}")
        if code == 429 or 500 <= code < 600:
            raise RetryableError(f"{self.name} retryable {code}: {body}")
        raise FatalRequestError(f"{self.name} request error {code}: {body}")

    def _parse_response(
        self, model: str, body: dict[str, Any], latency_ms: int
    ) -> UnifiedResponse:
        try:
            choice = body["choices"][0]
            text = choice["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise RetryableError(f"{self.name} unexpected response shape: {e}") from e

        usage_raw = body.get("usage") or {}
        usage = TokenUsage(
            input_tokens=int(usage_raw.get("prompt_tokens", 0) or 0),
            output_tokens=int(usage_raw.get("completion_tokens", 0) or 0),
        )
        return UnifiedResponse(
            text=text,
            provider=self.name,
            model=model,
            usage=usage,
            raw=body,
            latency_ms=latency_ms,
        )
