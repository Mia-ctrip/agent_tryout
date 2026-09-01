from __future__ import annotations

import io
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.domain.region_catalog import REGION_IDS, normalize_region_ids
from app.domain.life_context_catalog import LifeContextId, normalize_life_context_ids
from app.models.life_context import ObservationLifeContext
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.schemas.observation import (
    ObservationOut,
    ObservationPhotoOut,
    ObservationTargetOut,
    RegionTargetCreate,
)
from app.services import observation_quality_service
from app.services.storage_service import get_storage
from app.services.region_event_service import (
    activate_valid_target_event,
    reserve_events_for_targets,
)


_MIME_TO_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@dataclass(frozen=True)
class ObservationPhotoInput:
    data: bytes
    mime_type: str
    taken_at: datetime | None = None


def normalize_user_note(user_note: str | None) -> str | None:
    if user_note is None:
        return None
    normalized = user_note.strip()
    if not normalized:
        return None
    if len(normalized) > 500:
        raise HTTPException(status_code=422, detail="user_note must be at most 500 characters")
    return normalized


def normalize_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def local_date_for_offset(recorded_at: datetime, offset_minutes: int) -> date:
    if not -840 <= offset_minutes <= 840:
        raise HTTPException(status_code=422, detail="invalid timezone offset")
    return (normalize_utc(recorded_at) + timedelta(minutes=offset_minutes)).date()


def normalize_region_targets(
    values: list[RegionTargetCreate],
    *,
    photo_present: bool,
) -> list[RegionTargetCreate]:
    try:
        region_ids = normalize_region_ids(value.region_id for value in values)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    by_region = {value.region_id: value for value in values}
    normalized: list[RegionTargetCreate] = []
    for region_id in region_ids:
        value = by_region[region_id]
        note = normalize_user_note(value.user_note)
        if not photo_present and note is None:
            raise HTTPException(
                status_code=422,
                detail=f"user_note is required for region: {region_id}",
            )
        normalized.append(
            RegionTargetCreate(
                region_id=region_id,
                user_note=note,
                event_decision=value.event_decision,
            )
        )
    return normalized


def validate_photo_input(photo: ObservationPhotoInput) -> tuple[int, int, str]:
    settings = get_settings()
    if photo.mime_type not in settings.allowed_mime_set or photo.mime_type not in _MIME_TO_EXT:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"unsupported mime: {photo.mime_type}",
        )
    if not photo.data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(photo.data) > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"file too large: {len(photo.data)} > {settings.upload_max_bytes}",
        )
    try:
        with Image.open(io.BytesIO(photo.data)) as image:
            image.verify()
        with Image.open(io.BytesIO(photo.data)) as image:
            width, height = ImageOps.exif_transpose(image).size
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="invalid image") from exc
    return width, height, _MIME_TO_EXT[photo.mime_type]


def find_observation_by_request(
    db: Session, user_id: int, client_request_id: uuid.UUID
) -> ObservationRecord | None:
    return db.scalar(
        select(ObservationRecord).where(
            ObservationRecord.user_id == user_id,
            ObservationRecord.client_request_id == client_request_id,
            ObservationRecord.deleted_at.is_(None),
        )
    )


def load_full_face_target(db: Session, record_id: int) -> ObservationTarget:
    target = db.scalar(
        select(ObservationTarget).where(
            ObservationTarget.record_id == record_id,
            ObservationTarget.scope_type == "full_face",
            ObservationTarget.region_id.is_(None),
            ObservationTarget.deleted_at.is_(None),
        )
    )
    if target is None:
        raise RuntimeError("observation target missing")
    return target


def load_observation_targets(db: Session, record_id: int) -> list[ObservationTarget]:
    return list(
        db.scalars(
            select(ObservationTarget).where(
                ObservationTarget.record_id == record_id,
                ObservationTarget.deleted_at.is_(None),
            )
        ).all()
    )


def _build_storage_key(user_id: int, ext: str, now: datetime) -> str:
    return (
        f"observations/{user_id}/{now.year:04d}/{now.month:02d}/{now.day:02d}/"
        f"{uuid.uuid4().hex}.{ext}"
    )


def create_observation(
    db: Session,
    *,
    user_id: int,
    client_request_id: uuid.UUID,
    recorded_at: datetime,
    recorded_timezone_offset_minutes: int,
    target_inputs: list[RegionTargetCreate],
    photo_input: ObservationPhotoInput | None,
) -> tuple[ObservationRecord, list[ObservationTarget], bool]:
    existing = find_observation_by_request(db, user_id, client_request_id)
    if existing is not None:
        return existing, load_observation_targets(db, existing.id), False

    normalized_targets = normalize_region_targets(
        target_inputs,
        photo_present=photo_input is not None,
    )
    normalized_recorded_at = normalize_utc(recorded_at)
    normalized_local_date = local_date_for_offset(
        normalized_recorded_at,
        recorded_timezone_offset_minutes,
    )

    now = datetime.now(tz=timezone.utc)
    photo: Photo | None = None
    storage_key: str | None = None
    storage = get_storage()
    try:
        if photo_input is not None:
            width, height, ext = validate_photo_input(photo_input)
            quality = observation_quality_service.assess_observation_photo(
                photo_input.data
            )
            if quality.status == "failed":
                raise HTTPException(
                    status_code=422,
                    detail={
                        "message": "photo quality check failed",
                        "primary_issue": (
                            quality.primary_issue.model_dump(mode="json")
                            if quality.primary_issue is not None
                            else None
                        ),
                        "issues": [
                            issue.model_dump(mode="json") for issue in quality.issues
                        ],
                    },
                )
            storage_key = _build_storage_key(user_id, ext, now)
            storage.put(storage_key, photo_input.data, photo_input.mime_type)
            photo = Photo(
                user_id=user_id,
                check_in_id=None,
                view_type=None,
                client_request_id=None,
                storage_key=storage_key,
                processed_storage_key=None,
                mime_type=photo_input.mime_type,
                size_bytes=len(photo_input.data),
                width=width,
                height=height,
                taken_at=(
                    normalize_utc(photo_input.taken_at) if photo_input.taken_at is not None else None
                ),
                quality_status=quality.status,
                quality_meta=quality.model_dump(mode="json"),
            )
            db.add(photo)
            db.flush()

        record = ObservationRecord(
            user_id=user_id,
            client_request_id=client_request_id,
            recorded_at=normalized_recorded_at,
            recorded_timezone_offset_minutes=recorded_timezone_offset_minutes,
            recorded_local_date=normalized_local_date,
            photo_id=photo.id if photo is not None else None,
            user_note=None,
            status="saved",
        )
        db.add(record)
        db.flush()
        events_by_region = reserve_events_for_targets(
            db,
            user_id=user_id,
            recorded_local_date=normalized_local_date,
            target_inputs=normalized_targets,
        )
        targets = [
            ObservationTarget(
                record_id=record.id,
                user_id=user_id,
                scope_type="region",
                region_id=target_input.region_id,
                region_event_id=events_by_region[target_input.region_id].id,
                user_note=target_input.user_note,
                status="queued" if photo is not None else "completed",
                result_source=None if photo is not None else "user_record",
                facts=None,
                completed_at=None if photo is not None else now,
            )
            for target_input in normalized_targets
        ]
        for target in targets:
            db.add(target)
        db.flush()
        db.commit()
    except IntegrityError:
        db.rollback()
        if storage_key is not None:
            storage.delete(storage_key)
        existing = find_observation_by_request(db, user_id, client_request_id)
        if existing is None:
            raise
        return existing, load_observation_targets(db, existing.id), False
    except Exception:
        db.rollback()
        if storage_key is not None:
            storage.delete(storage_key)
        raise

    if photo is not None:
        db.refresh(photo)
    db.refresh(record)
    for target in targets:
        db.refresh(target)
    return record, targets, True


def to_observation_out(
    db: Session, record: ObservationRecord, targets: list[ObservationTarget]
) -> ObservationOut:
    photo = None
    if record.photo_id is not None:
        photo = db.get(Photo, record.photo_id)
        if photo is None or photo.deleted_at is not None or photo.user_id != record.user_id:
            raise RuntimeError("observation photo missing")
    return _build_observation_out(db, record, targets, photo)


def _build_observation_out(
    db: Session,
    record: ObservationRecord,
    targets: list[ObservationTarget],
    photo: Photo | None,
) -> ObservationOut:
    photo_out: ObservationPhotoOut | None = None
    if photo is not None:
        signed = get_storage().signed_url(photo.storage_key)
        photo_out = ObservationPhotoOut(
            photo_id=photo.id,
            mime_type=photo.mime_type,
            size_bytes=photo.size_bytes,
            width=photo.width,
            height=photo.height,
            taken_at=photo.taken_at,
            quality_status=photo.quality_status,
            quality_meta=photo.quality_meta,
            url=signed.url,
            url_expires_at=signed.expires_at,
        )
    return ObservationOut(
        observation_id=record.id,
        client_request_id=record.client_request_id,
        recorded_at=record.recorded_at,
        recorded_timezone_offset_minutes=record.recorded_timezone_offset_minutes,
        recorded_local_date=record.recorded_local_date,
        status=record.status,
        created_at=record.created_at,
        life_context_ids=load_life_context_ids(db, record.id),
        life_context_completed_at=record.life_context_completed_at,
        photo=photo_out,
        targets=[
            ObservationTargetOut(
                target_id=target.id,
                scope_type=target.scope_type,
                region_id=target.region_id,
                user_note=(
                    target.user_note
                    if target.user_note is not None
                    else record.user_note if target.scope_type == "full_face" else None
                ),
                status=target.status,
                result_source=target.result_source,
                facts=target.facts,
                completed_at=target.completed_at,
            )
            for target in sorted(
                targets,
                key=lambda item: (
                    0 if item.scope_type == "full_face" else 1,
                    (
                        REGION_IDS.index(item.region_id)
                        if item.region_id is not None
                        else -1
                    ),
                ),
            )
        ],
    )


def _bundle_statement(user_id: int, observation_id: int | None = None):
    statement = (
        select(ObservationRecord, ObservationTarget, Photo)
        .join(
            ObservationTarget,
            (ObservationTarget.record_id == ObservationRecord.id)
            & ObservationTarget.deleted_at.is_(None),
        )
        .outerjoin(
            Photo,
            (Photo.id == ObservationRecord.photo_id)
            & Photo.deleted_at.is_(None),
        )
        .where(
            ObservationRecord.user_id == user_id,
            ObservationRecord.deleted_at.is_(None),
        )
    )
    if observation_id is not None:
        statement = statement.where(ObservationRecord.id == observation_id)
    return statement


def list_observations(
    db: Session,
    *,
    user_id: int,
    limit: int,
    before_id: int | None,
) -> list[ObservationOut]:
    record_ids = select(ObservationRecord.id).where(
        ObservationRecord.user_id == user_id,
        ObservationRecord.deleted_at.is_(None),
    )
    if before_id is not None:
        record_ids = record_ids.where(ObservationRecord.id < before_id)
    record_ids = record_ids.order_by(
        ObservationRecord.recorded_at.desc(),
        ObservationRecord.id.desc(),
    ).limit(max(1, min(limit, 50)))
    statement = _bundle_statement(user_id).where(ObservationRecord.id.in_(record_ids))
    rows = db.execute(
        statement.order_by(
            ObservationRecord.recorded_at.desc(),
            ObservationRecord.id.desc(),
            ObservationTarget.id,
        )
    ).all()
    grouped: dict[int, tuple[ObservationRecord, list[ObservationTarget], Photo | None]] = {}
    for record, target, photo in rows:
        if record.user_id != user_id:
            continue
        if record.id not in grouped:
            grouped[record.id] = (record, [], photo)
        grouped[record.id][1].append(target)
    return [
        _build_observation_out(db, record, targets, photo)
        for record, targets, photo in grouped.values()
    ]


def get_observation(
    db: Session,
    *,
    user_id: int,
    observation_id: int,
) -> tuple[ObservationRecord, list[ObservationTarget], Photo | None]:
    rows = db.execute(_bundle_statement(user_id, observation_id)).all()
    matching = [
        row for row in rows if row[0].id == observation_id and row[0].user_id == user_id
    ]
    if not matching:
        raise HTTPException(status_code=404, detail="observation not found")
    record, _, photo = matching[0]
    return record, [row[1] for row in matching], photo


def get_observation_out(
    db: Session,
    *,
    user_id: int,
    observation_id: int,
) -> ObservationOut:
    record, targets, photo = get_observation(
        db,
        user_id=user_id,
        observation_id=observation_id,
    )
    return _build_observation_out(db, record, targets, photo)


def replace_failed_observation_note(
    db: Session,
    *,
    user_id: int,
    observation_id: int,
    target_id: int,
    user_note: str,
) -> ObservationOut:
    record, targets, photo = get_observation(
        db,
        user_id=user_id,
        observation_id=observation_id,
    )
    target = next((item for item in targets if item.id == target_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="observation target not found")
    if target.status != "needs_input":
        raise HTTPException(status_code=409, detail="observation is not awaiting user input")
    note = normalize_user_note(user_note)
    if note is None:
        raise HTTPException(status_code=422, detail="user_note must not be blank")
    target.user_note = note
    target.status = "completed"
    target.result_source = "user_record"
    target.failure_code = None
    target.completed_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(target)
    activate_valid_target_event(db, target.id)
    return _build_observation_out(db, record, targets, photo)


def retry_failed_observation_target(
    db: Session,
    *,
    user_id: int,
    observation_id: int,
    target_id: int,
) -> tuple[ObservationRecord, list[ObservationTarget], bool]:
    record, targets, photo = get_observation(
        db,
        user_id=user_id,
        observation_id=observation_id,
    )
    target = next((item for item in targets if item.id == target_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="observation target not found")
    if target.status in {"queued", "processing"}:
        return record, targets, False
    if target.status != "needs_input" or photo is None:
        raise HTTPException(status_code=409, detail="observation target cannot be retried")
    target.status = "queued"
    target.result_source = None
    target.facts = None
    target.completed_at = None
    target.processing_started_at = None
    target.provider = None
    target.model = None
    target.failure_code = None
    db.commit()
    db.refresh(target)
    return record, targets, True


def load_life_context_ids(db: Session, observation_id: int) -> list[LifeContextId]:
    values = db.scalars(
        select(ObservationLifeContext.context_id).where(
            ObservationLifeContext.observation_id == observation_id
        )
    ).all()
    return list(normalize_life_context_ids(list(values)))


def replace_life_contexts(
    db: Session,
    *,
    user_id: int,
    observation_id: int,
    context_ids: list[LifeContextId],
) -> ObservationOut:
    record, targets, photo = get_observation(
        db,
        user_id=user_id,
        observation_id=observation_id,
    )
    ordered = normalize_life_context_ids(context_ids)
    db.execute(
        delete(ObservationLifeContext).where(
            ObservationLifeContext.observation_id == observation_id
        )
    )
    for context_id in ordered:
        db.add(
            ObservationLifeContext(
                observation_id=observation_id,
                context_id=context_id,
            )
        )
    record.life_context_completed_at = datetime.now(tz=timezone.utc)
    db.commit()
    db.refresh(record)
    return _build_observation_out(db, record, targets, photo)
