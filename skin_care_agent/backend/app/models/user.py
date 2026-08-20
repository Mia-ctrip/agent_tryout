from __future__ import annotations

from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class User(Base, IdMixin, TimestampMixin):
    __tablename__ = "users"

    nickname: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
