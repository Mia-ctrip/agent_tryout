from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    photo_id: int
    force: bool = Field(
        default=False,
        description="true 时忽略缓存强制重跑 LLM（默认幂等：同 photo_id 返回最近一次成功结果）",
    )


class AnalysisOut(BaseModel):
    analysis_id: int
    photo_id: int
    provider: str
    model: str
    parsed_result: dict[str, Any]
    overall_severity: Optional[int] = None
    skin_health_index: Optional[int] = None
    needs_doctor: bool
    created_at: datetime
    cached: bool = Field(
        default=False,
        description="true 表示未调用 LLM，直接返回上次结果",
    )
