"""AI 调用链可观测性工具。

核心概念：
- trace_id：一次业务请求（如 POST /analyses）分配一个 UUID
- attempt_seq：该 trace 内第几次真实 provider 调用（fallback 时递增）
- 结构化日志：所有关键节点用 [trace=xxx] 前缀，便于终端 grep

图片脱敏：base64 data URL 太大，落库/日志时替换为 placeholder。
"""

from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Optional


_trace_id_var: ContextVar[Optional[str]] = ContextVar("ai_trace_id", default=None)


def new_trace_id() -> str:
    return uuid.uuid4().hex[:16]


def set_current_trace_id(trace_id: str) -> None:
    _trace_id_var.set(trace_id)


def get_current_trace_id() -> Optional[str]:
    return _trace_id_var.get()


class TracedLogger:
    """logging 包装：自动前缀 [trace=xxx]，key=value 结构化。"""

    def __init__(self, name: str = "skin_care_agent.ai_gateway"):
        self._logger = logging.getLogger(name)

    def _fmt(self, event: str, **kv: Any) -> str:
        trace = get_current_trace_id() or "-"
        parts = [f"[trace={trace}]", event]
        for k, v in kv.items():
            if v is None:
                continue
            if isinstance(v, str) and len(v) > 200:
                v = v[:200] + "..."
            parts.append(f"{k}={v}")
        return " ".join(parts)

    def info(self, event: str, **kv: Any) -> None:
        self._logger.info(self._fmt(event, **kv))

    def warning(self, event: str, **kv: Any) -> None:
        self._logger.warning(self._fmt(event, **kv))

    def error(self, event: str, **kv: Any) -> None:
        self._logger.error(self._fmt(event, **kv))

    def debug(self, event: str, **kv: Any) -> None:
        self._logger.debug(self._fmt(event, **kv))


trace_log = TracedLogger()


def sanitize_messages_for_log(messages: list[Any]) -> list[dict[str, Any]]:
    """把 UnifiedRequest.messages 转成可安全落库/展示的形式。

    - base64 data URL 替换为 <data:image/jpeg;base64,...(N bytes)...>
    - 保留 role / content / image 元信息
    """
    out: list[dict[str, Any]] = []
    for m in messages:
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else None)
        content = getattr(m, "content", None) or (
            m.get("content") if isinstance(m, dict) else None
        )
        image_urls = getattr(m, "image_urls", None) or (
            m.get("image_urls", []) if isinstance(m, dict) else []
        )
        redacted_images: list[str] = []
        for url in image_urls or []:
            if isinstance(url, str) and url.startswith("data:"):
                # data:image/jpeg;base64,AAAA...
                head, _, tail = url.partition(",")
                redacted_images.append(f"<{head},...({len(tail)} b64 chars)...>")
            else:
                redacted_images.append(str(url))
        out.append(
            {
                "role": role,
                "content": content,
                "image_urls": redacted_images,
            }
        )
    return out


@dataclass
class ProviderCallRecord:
    """一次真实 provider 调用的完整快照。gateway 每尝试一家就 append 一条。"""

    trace_id: str
    attempt_seq: int
    provider: str
    model: str
    status: str  # ok / retryable_exhausted / dead / skipped
    latency_ms: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    response_text: Optional[str] = None
    raw_response: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    skip_reason: Optional[str] = None
