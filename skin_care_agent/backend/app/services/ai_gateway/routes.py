from __future__ import annotations

from dataclasses import dataclass, field

from app.services.ai_gateway.types import Capability


@dataclass(frozen=True)
class ModelBinding:
    provider: str
    model: str


@dataclass(frozen=True)
class ModelRoute:
    task: str
    chain: tuple[ModelBinding, ...]
    requires: frozenset[Capability] = field(default_factory=frozenset)
    timeout_s: float = 30.0
    max_retries_per_node: int = 1
