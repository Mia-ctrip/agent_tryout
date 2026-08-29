from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.models.user import User
from app.services.observation_service import find_observation_by_request


def test_observation_commit_is_visible_to_fresh_session_and_user_isolated(
    postgres_session_factory,
) -> None:
    request_id = uuid4()
    storage_key = f"observations/integration/{uuid4().hex}.jpg"
    with postgres_session_factory() as session_a:
        owner = User(nickname="owner")
        other = User(nickname="other")
        session_a.add_all([owner, other])
        session_a.flush()
        photo = Photo(
            user_id=owner.id,
            storage_key=storage_key,
            mime_type="image/jpeg",
            size_bytes=10,
            width=4,
            height=4,
        )
        session_a.add(photo)
        session_a.flush()
        record = ObservationRecord(
            user_id=owner.id,
            client_request_id=request_id,
            recorded_at=datetime(2026, 8, 21, tzinfo=timezone.utc),
            photo_id=photo.id,
            status="saved",
        )
        session_a.add(record)
        session_a.flush()
        session_a.add(
            ObservationTarget(
                record_id=record.id,
                user_id=owner.id,
                scope_type="full_face",
                region_id=None,
                status="queued",
            )
        )
        session_a.commit()
        owner_id, other_id, record_id = owner.id, other.id, record.id

    with postgres_session_factory() as session_b:
        loaded = session_b.get(ObservationRecord, record_id)
        target = session_b.scalar(
            select(ObservationTarget).where(ObservationTarget.record_id == record_id)
        )
        assert loaded is not None
        assert loaded.client_request_id == request_id
        assert target is not None
        assert target.scope_type == "full_face"
        assert target.region_id is None
        assert find_observation_by_request(session_b, other_id, request_id) is None

    with postgres_session_factory() as duplicate_session:
        duplicate_session.add(
            ObservationRecord(
                user_id=owner_id,
                client_request_id=request_id,
                recorded_at=datetime(2026, 8, 21, tzinfo=timezone.utc),
                status="saved",
            )
        )
        with pytest.raises(IntegrityError):
            duplicate_session.commit()
        duplicate_session.rollback()

    with postgres_session_factory() as count_session:
        count = count_session.scalar(
            select(func.count())
            .select_from(ObservationRecord)
            .where(
                ObservationRecord.user_id == owner_id,
                ObservationRecord.client_request_id == request_id,
            )
        )
        assert count == 1
