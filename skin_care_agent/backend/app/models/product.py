from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, IdMixin, TimestampMixin


class PersonalProduct(Base, IdMixin, TimestampMixin):
    __tablename__ = "personal_products"
    __table_args__ = (
        Index(
            "uq_personal_products_user_client_request_id",
            "user_id",
            "client_request_id",
            unique=True,
        ),
        Index("ix_personal_products_user_created", "user_id", "created_at"),
        Index(
            "uq_personal_products_user_standard_active",
            "user_id",
            "standard_product_id",
            unique=True,
            postgresql_where=text("standard_product_id IS NOT NULL"),
        ),
        Index(
            "ix_personal_products_normalized_name_trgm",
            "normalized_name",
            postgresql_using="gin",
            postgresql_ops={"normalized_name": "public.gin_trgm_ops"},
        ),
        CheckConstraint(
            "char_length(btrim(name)) BETWEEN 1 AND 120",
            name="ck_personal_products_name",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_request_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    standard_product_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("standard_products.id", ondelete="RESTRICT"),
        nullable=True,
    )
    display_name_override: Mapped[str | None] = mapped_column(String(120), nullable=True)
    normalized_name: Mapped[str] = mapped_column(String(180), nullable=False)
    user_image_asset_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
        nullable=True,
    )


class ProductUse(Base, IdMixin, TimestampMixin):
    __tablename__ = "product_uses"
    __table_args__ = (
        Index(
            "uq_product_uses_user_client_request_id",
            "user_id",
            "client_request_id",
            unique=True,
        ),
        Index("ix_product_uses_user_used_at", "user_id", "used_at"),
        CheckConstraint(
            "used_timezone_offset_minutes BETWEEN -840 AND 840",
            name="ck_product_uses_timezone_offset",
        ),
        CheckConstraint(
            "note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 500",
            name="ck_product_uses_note",
        ),
    )

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_request_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_timezone_offset_minutes: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ProductUseProduct(Base):
    __tablename__ = "product_use_products"

    product_use_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("product_uses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("personal_products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    name_snapshot: Mapped[str] = mapped_column(String(180), nullable=False)
    brand_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    formula_version_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    image_asset_id_snapshot: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("product_image_assets.id", ondelete="RESTRICT"),
        nullable=True,
    )
    document_id_snapshot: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("standard_product_documents.id", ondelete="RESTRICT"),
        nullable=True,
    )
