from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


class Capability(str, Enum):
    TEXT = "text"
    VISION = "vision"
    JSON_MODE = "json_mode"
    TOOL_USE = "tool_use"


Role = Literal["system", "user", "assistant", "tool"]


@dataclass
class Message:
    role: Role
    content: str
    image_urls: list[str] = field(default_factory=list)


@dataclass
class UnifiedRequest:
    messages: list[Message]
    temperature: float | None = None
    max_tokens: int | None = None
    response_format: Literal["text", "json"] = "text"
    user_id: str | None = None
    request_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0


@dataclass
class UnifiedResponse:
    text: str
    provider: str
    model: str
    usage: TokenUsage = field(default_factory=TokenUsage)
    raw: dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0
