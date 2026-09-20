import time
from typing import Any
import httpx
from . import config


class ProviderError(Exception):
    def __init__(self, message: str, status: int | None = None, request_id: str | None = None):
        super().__init__(message)
        self.status, self.request_id = status, request_id


async def invoke(messages: list[dict[str, Any]], model: str, temperature: float, max_tokens: int) -> dict[str, Any]:
    if not config.API_KEY:
        raise ProviderError("GLM_API_KEY is not configured")
    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    if any(isinstance(m["content"], list) for m in messages):
        payload["thinking"] = {"type": "disabled"}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{config.BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {config.API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise ProviderError(f"GLM request timed out: {exc}") from exc
    except httpx.HTTPError as exc:
        raise ProviderError(f"GLM network error: {exc}") from exc
    request_id = response.headers.get("x-request-id") or response.headers.get("request-id")
    if not response.is_success:
        detail = response.text[:1000]
        raise ProviderError(f"GLM returned HTTP {response.status_code}: {detail}", response.status_code, request_id)
    try:
        body = response.json()
    except ValueError as exc:
        raise ProviderError("GLM returned a non-JSON response", response.status_code, request_id) from exc
    try:
        output = body["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(f"Unexpected GLM response shape: {exc}", response.status_code, request_id) from exc
    usage = body.get("usage") or {}
    return {
        "output": output,
        "raw_response": body,
        "latency_ms": int((time.perf_counter() - started) * 1000),
        "input_tokens": usage.get("prompt_tokens"),
        "output_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "request_id": request_id,
        "payload": payload,
    }

