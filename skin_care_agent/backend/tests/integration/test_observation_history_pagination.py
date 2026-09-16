from datetime import datetime, timezone
from uuid import uuid4

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.user import User
from app.services.observation_service import list_observations


def test_chronological_history_pages_keep_backdated_records_and_account_isolation(
    postgres_session_factory,
) -> None:
    with postgres_session_factory() as db:
        user = User(nickname='discardable history pagination fixture')
        other = User(nickname='discardable other account fixture')
        db.add_all([user, other])
        db.flush()
        expected_ids = set()
        for index in range(51):
            occurred = datetime(2030 if index == 0 else 2000 if index == 1 else 2026,
                                1, 1, tzinfo=timezone.utc)
            record = ObservationRecord(
                user_id=user.id, client_request_id=uuid4(), recorded_at=occurred,
                recorded_timezone_offset_minutes=480, recorded_local_date=occurred.date(),
                status='saved',
            )
            db.add(record)
            db.flush()
            expected_ids.add(record.id)
            db.add(ObservationTarget(
                record_id=record.id, user_id=user.id, scope_type='full_face', region_id=None,
                status='completed', result_source='user_record', user_note='Historical fixture only',
            ))
        foreign = ObservationRecord(
            user_id=other.id, client_request_id=uuid4(),
            recorded_at=datetime(2031, 1, 1, tzinfo=timezone.utc), status='saved',
        )
        db.add(foreign)
        db.flush()
        first = list_observations(db, user_id=user.id, limit=50, before_id=None)
        second = list_observations(db, user_id=user.id, limit=50,
                                   before_id=first[-1].observation_id)
        assert len(first) == 50
        assert len(second) == 1
        assert {record.observation_id for record in first + second} == expected_ids
        assert list_observations(db, user_id=user.id, limit=50, before_id=foreign.id) == []
