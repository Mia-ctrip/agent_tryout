"""AI 每日配额（原子计数）。

设计：
- 用 PG `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` 一条 SQL 完成"占额"
- 达到上限时不 update，保留原值，调用方比较 count 决定是否放行
- dev 环境（APP_ENV=dev）默认豁免；可通过 AI_RATELIMIT_ENFORCE_IN_DEV=true 强制开启
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings


UsageKind = Literal["analyze", "chat"]


@dataclass(frozen=True)
class QuotaResult:
    allowed: bool
    used: int
    limit: int
    kind: UsageKind
    usage_date: date

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.used)


class QuotaExceeded(Exception):
    def __init__(self, result: QuotaResult):
        super().__init__(
            f"quota exceeded: kind={result.kind} used={result.used} limit={result.limit}"
        )
        self.result = result


_UPSERT_SQL = text(
    """
    INSERT INTO ai_usage_counters (user_id, kind, usage_date, count)
    VALUES (:user_id, :kind, :usage_date, 1)
    ON CONFLICT (user_id, kind, usage_date)
    DO UPDATE SET count = ai_usage_counters.count + 1
                  WHERE ai_usage_counters.count < :limit
    RETURNING count
    """
)

_PEEK_SQL = text(
    """
    SELECT count FROM ai_usage_counters
    WHERE user_id = :user_id AND kind = :kind AND usage_date = :usage_date
    """
)


def _today_utc() -> date:
    return datetime.now(tz=timezone.utc).date()


def _is_bypassed() -> bool:
    s = get_settings()
    if s.app_env != "dev":
        return False
    return not s.ai_ratelimit_enforce_in_dev


def _limit_for(kind: UsageKind) -> int:
    s = get_settings()
    if kind == "analyze":
        return s.ai_analyze_daily_limit
    if kind == "chat":
        return s.ai_chat_daily_limit
    raise ValueError(f"unknown kind: {kind}")


def try_consume(db: Session, user_id: int, kind: UsageKind) -> QuotaResult:
    """尝试占用 1 次配额。原子操作。达到上限时不递增，返回 allowed=False。"""
    today = _today_utc()
    limit = _limit_for(kind)

    if _is_bypassed():
        return QuotaResult(allowed=True, used=0, limit=limit, kind=kind, usage_date=today)

    row = db.execute(
        _UPSERT_SQL,
        {"user_id": user_id, "kind": kind, "usage_date": today, "limit": limit},
    ).first()

    if row is not None:
        db.commit()
        return QuotaResult(
            allowed=True, used=int(row[0]), limit=limit, kind=kind, usage_date=today
        )

    # 已达上限：SET 分支被 WHERE 挡掉，RETURNING 无返回
    db.rollback()
    peek = db.execute(
        _PEEK_SQL, {"user_id": user_id, "kind": kind, "usage_date": today}
    ).first()
    used = int(peek[0]) if peek else limit
    return QuotaResult(allowed=False, used=used, limit=limit, kind=kind, usage_date=today)


def peek(db: Session, user_id: int, kind: UsageKind) -> QuotaResult:
    """只读查询：返回当日已用次数，不占额。"""
    today = _today_utc()
    limit = _limit_for(kind)
    if _is_bypassed():
        return QuotaResult(allowed=True, used=0, limit=limit, kind=kind, usage_date=today)
    row = db.execute(
        _PEEK_SQL, {"user_id": user_id, "kind": kind, "usage_date": today}
    ).first()
    used = int(row[0]) if row else 0
    return QuotaResult(
        allowed=used < limit, used=used, limit=limit, kind=kind, usage_date=today
    )


def require(db: Session, user_id: int, kind: UsageKind) -> QuotaResult:
    """占额 + 未通过则抛 QuotaExceeded。业务代码在进入 AI 调用前调用一次即可。"""
    result = try_consume(db, user_id, kind)
    if not result.allowed:
        raise QuotaExceeded(result)
    return result
