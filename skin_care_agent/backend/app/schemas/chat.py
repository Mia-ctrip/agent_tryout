from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ChatContext(BaseModel):
    """前端传的上下文（Q1=B：前端主动带）。"""

    latest_analysis_id: Optional[int] = None


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="用户当前问题")
    context: Optional[ChatContext] = None
    history: list[ChatHistoryItem] = Field(
        default_factory=list,
        description="可选：前端维护的多轮历史（服务端不存 session）",
    )


class ChatResponse(BaseModel):
    chat_id: int
    assistant_message: str
    provider: str
    model: str
    medical_intervention: bool = Field(
        False,
        description="true 时表示命中医疗紧急兜底，assistant_message 是服务端预设回复",
    )
    compliance_flags: Optional[list[dict[str, Any]]] = None
    created_at: datetime
    trace_id: Optional[str] = None


class ChatMessageOut(BaseModel):
    chat_id: int
    user_message: str
    assistant_message: str
    provider: str
    model: str
    medical_intervention: bool
    analysis_id: Optional[int] = None
    created_at: datetime
