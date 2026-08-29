from __future__ import annotations

import io
from datetime import datetime, timezone
from uuid import uuid4

from PIL import Image
from sqlalchemy import func, select

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.user import User
from app.schemas.observation import RegionTargetCreate
from app.services.observation_service import ObservationPhotoInput, create_observation
from app.services.storage_service import get_storage


def _jpeg() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (8, 8), color=(128, 128, 128)).save(output, format="JPEG")
    return output.getvalue()


def test_region_observation_is_idempotent_and_restores_independent_target_states(
    postgres_session_factory,
) -> None:
    request_id = uuid4()
    storage_key: str | None = None
    try:
        with postgres_session_factory() as first:
            user = User(nickname="region integration")
            first.add(user)
            first.flush()
            user_id = user.id
            record, targets, created = create_observation(
                first,
                user_id=user_id,
                client_request_id=request_id,
                recorded_at=datetime(2026, 8, 24, 8, tzinfo=timezone.utc),
                recorded_timezone_offset_minutes=480,
                target_inputs=[
                    RegionTargetCreate(region_id="left_face"),
                    RegionTargetCreate(region_id="chin"),
                ],
                photo_input=ObservationPhotoInput(data=_jpeg(), mime_type="image/jpeg"),
            )
            record_id = record.id
            photo = first.get(Photo, record.photo_id)
            assert photo is not None
            storage_key = photo.storage_key
            assert created is True
            assert [target.region_id for target in targets] == ["left_face", "chin"]

        with postgres_session_factory() as fresh:
            loaded = fresh.get(ObservationRecord, record_id)
            targets = list(
                fresh.scalars(
                    select(ObservationTarget)
                    .where(ObservationTarget.record_id == record_id)
                    .order_by(ObservationTarget.id)
                )
            )
            assert loaded is not None
            assert loaded.recorded_local_date.isoformat() == "2026-08-24"
            assert len(targets) == 2
            targets[0].status = "completed"
            targets[0].result_source = "photo_analysis"
            targets[0].facts = {"summary": "left"}
            targets[1].status = "needs_input"
            fresh.commit()

        with postgres_session_factory() as duplicate:
            record, targets, created = create_observation(
                duplicate,
                user_id=user_id,
                client_request_id=request_id,
                recorded_at=datetime(2026, 8, 24, 8, tzinfo=timezone.utc),
                recorded_timezone_offset_minutes=480,
                target_inputs=[RegionTargetCreate(region_id="forehead")],
                photo_input=None,
            )
            assert created is False
            assert record.id == record_id
            assert [target.status for target in targets] == ["completed", "needs_input"]
            assert duplicate.scalar(
                select(func.count()).select_from(ObservationRecord).where(
                    ObservationRecord.user_id == user_id,
                    ObservationRecord.client_request_id == request_id,
                )
            ) == 1
            assert duplicate.scalar(
                select(func.count()).select_from(ObservationTarget).where(
                    ObservationTarget.record_id == record_id
                )
            ) == 2
    finally:
        if storage_key is not None:
            get_storage().delete(storage_key)
