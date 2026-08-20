"""LLM 响应解析工具。

推理模型（MiniMax M3 / DeepSeek-R1 等）会先输出 `<think>...</think>` 再输出答案。
本模块负责：
1. 剥离 `<think>` 块，单独保留供观测
2. 尝试 direct JSON parse
3. 失败则从散文里抠出第一个平衡的 { ... } 块（extracted 策略）
4. 全部失败返回 None + strategy=failed
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal, Optional


ParseStrategy = Literal["direct", "extracted", "failed"]


@dataclass(frozen=True)
class ParseResult:
    parsed: Optional[dict[str, Any]]
    reasoning: Optional[str]
    strategy: ParseStrategy
    stripped_text: str  # 剥离 <think> 后的正文，用于排障

    @property
    def ok(self) -> bool:
        return self.parsed is not None


_THINK_PATTERN = re.compile(r"<think>(.*?)</think>", re.DOTALL | re.IGNORECASE)


def parse_llm_json(text: str) -> ParseResult:
    """入口：处理推理块 + 兜底抽取 JSON。"""
    if not text:
        return ParseResult(None, None, "failed", "")

    reasoning, stripped = _extract_reasoning(text)
    stripped = stripped.strip()

    # 剥壳：markdown code fence
    body = stripped
    if body.startswith("```"):
        body = body.strip("`")
        if body.lower().startswith("json"):
            body = body[4:]
        body = body.strip()

    # Strategy 1: direct parse
    try:
        obj = json.loads(body)
        if isinstance(obj, dict):
            return ParseResult(obj, reasoning, "direct", stripped)
    except json.JSONDecodeError:
        pass

    # Strategy 2: 从散文里抠平衡 { ... }
    extracted = _extract_json_object(body)
    if extracted is not None:
        return ParseResult(extracted, reasoning, "extracted", stripped)

    return ParseResult(None, reasoning, "failed", stripped)


def _extract_reasoning(text: str) -> tuple[Optional[str], str]:
    """把所有 <think>...</think> 提出来（多段合并），返回 (reasoning, 剥离后的文本)。"""
    matches = _THINK_PATTERN.findall(text)
    if not matches:
        return None, text
    reasoning = "\n---\n".join(m.strip() for m in matches)
    stripped = _THINK_PATTERN.sub("", text)
    return reasoning, stripped


def _extract_json_object(text: str) -> Optional[dict[str, Any]]:
    """从可能夹杂散文的文本里抠出第一个平衡的 { ... }。"""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = text[start : i + 1]
                    try:
                        obj = json.loads(candidate)
                    except json.JSONDecodeError:
                        return None
                    return obj if isinstance(obj, dict) else None
    return None
