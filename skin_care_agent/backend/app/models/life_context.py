from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ObservationLifeContext(Base):
    __tablename__ = "observation_life_contexts"
    __table_args__ = (
        CheckConstraint(
            "context_id IN ('sleep', 'stress', 'diet', 'mood', 'menstrual_cycle', 'care_change')",
            name="ck_observation_life_contexts_context_id",
        ),
    )

    observation_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("observation_records.id", ondelete="CASCADE"),
        primary_key=True,
    )
    context_id: Mapped[str] = mapped_column(String(32), primary_key=True)
