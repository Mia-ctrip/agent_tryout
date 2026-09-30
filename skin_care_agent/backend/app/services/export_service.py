from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.life_context import ObservationLifeContext
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.product import PersonalProduct, ProductUse, ProductUseProduct
from app.models.region_event import RegionEvent
from app.models.user import User
from app.schemas.auth import ConsentStatusOut, UserOut
from app.schemas.export import (
    DataExportOut,
    ExportObservationOut,
    ExportObservationTargetOut,
    ExportPersonalProductOut,
    ExportProductUseOut,
    ExportProductUseProductOut,
    ExportRegionEventOut,
)
from app.services import auth_service, consent_service


def _user_out(db: Session, user: User) -> UserOut:
    identity = auth_service.load_email_identity(db, user.id)
    return UserOut(
        user_id=user.id,
        email=identity.provider_subject if identity is not None else None,
        nickname=user.nickname,
        created_at=user.created_at,
    )


def _group_by(rows: list, key) -> dict:
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(key(row), []).append(row)
    return grouped


def build_data_export(db: Session, user: User) -> DataExportOut:
    user_id = user.id

    records = list(
        db.scalars(
            select(ObservationRecord)
            .where(
                ObservationRecord.user_id == user_id,
                ObservationRecord.deleted_at.is_(None),
            )
            .order_by(ObservationRecord.recorded_at)
        )
    )
    record_ids = [record.id for record in records]

    targets_by_record = (
        _group_by(
            list(
                db.scalars(
                    select(ObservationTarget)
                    .where(ObservationTarget.record_id.in_(record_ids))
                    .order_by(ObservationTarget.id)
                )
            ),
            lambda target: target.record_id,
        )
        if record_ids
        else {}
    )
    life_context_by_record = (
        _group_by(
            list(
                db.scalars(
                    select(ObservationLifeContext)
                    .where(ObservationLifeContext.observation_id.in_(record_ids))
                    .order_by(ObservationLifeContext.observation_id)
                )
            ),
            lambda row: row.observation_id,
        )
        if record_ids
        else {}
    )

    observations = [
        ExportObservationOut(
            observation_id=record.id,
            recorded_at=record.recorded_at,
            user_note=record.user_note,
            life_context=[
                row.context_id for row in life_context_by_record.get(record.id, [])
            ],
            targets=[
                ExportObservationTargetOut(
                    scope_type=target.scope_type,
                    region_id=target.region_id,
                    status=target.status,
                    result_source=target.result_source,
                    user_note=target.user_note,
                    facts=target.facts,
                    completed_at=target.completed_at,
                )
                for target in targets_by_record.get(record.id, [])
            ],
        )
        for record in records
    ]

    region_events = [
        ExportRegionEventOut(
            region_event_id=event.id,
            region_id=event.region_id,
            status=event.status,
            started_local_date=event.started_local_date,
            last_valid_local_date=event.last_valid_local_date,
            ended_local_date=event.ended_local_date,
            end_reason=event.end_reason,
        )
        for event in db.scalars(
            select(RegionEvent)
            .where(RegionEvent.user_id == user_id, RegionEvent.deleted_at.is_(None))
            .order_by(RegionEvent.started_local_date)
        )
    ]

    personal_products = [
        ExportPersonalProductOut(
            product_id=product.id,
            name=product.display_name_override or product.name,
            standard_product_id=product.standard_product_id,
            created_at=product.created_at,
        )
        for product in db.scalars(
            select(PersonalProduct)
            .where(
                PersonalProduct.user_id == user_id,
                PersonalProduct.deleted_at.is_(None),
                PersonalProduct.archived_at.is_(None),
            )
            .order_by(PersonalProduct.created_at)
        )
    ]

    uses = list(
        db.scalars(
            select(ProductUse)
            .where(ProductUse.user_id == user_id, ProductUse.deleted_at.is_(None))
            .order_by(ProductUse.used_at)
        )
    )
    use_ids = [use.id for use in uses]
    products_by_use = (
        _group_by(
            list(
                db.scalars(
                    select(ProductUseProduct).where(
                        ProductUseProduct.product_use_id.in_(use_ids)
                    )
                )
            ),
            lambda link: link.product_use_id,
        )
        if use_ids
        else {}
    )

    product_uses = [
        ExportProductUseOut(
            product_use_id=use.id,
            used_at=use.used_at,
            note=use.note,
            products=[
                ExportProductUseProductOut(
                    name_snapshot=link.name_snapshot,
                    brand_snapshot=link.brand_snapshot,
                )
                for link in products_by_use.get(use.id, [])
            ],
        )
        for use in uses
    ]

    consents = [
        ConsentStatusOut(
            consent_type=consent_type,
            version=version,
            accepted=accepted,
            accepted_at=accepted_at,
        )
        for consent_type, version, accepted, accepted_at in consent_service.consent_statuses(
            db, user_id
        )
    ]

    return DataExportOut(
        generated_at=datetime.now(tz=timezone.utc),
        user=_user_out(db, user),
        consents=consents,
        observations=observations,
        region_events=region_events,
        personal_products=personal_products,
        product_uses=product_uses,
    )
