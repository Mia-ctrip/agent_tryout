from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models.observation import ObservationRecord, ObservationTarget
from app.models.region_event import RegionEvent
from app.models.user import User
from app.schemas.observation import RegionTargetCreate
from app.services.region_event_service import (
    activate_valid_target_event,
    end_region_event,
    get_region_event_detail,
    list_region_events,
    reserve_events_for_targets,
)


def _add_timepoint(
    session,
    *,
    user_id: int,
    recorded_on: date,
    decision: str | None = None,
) -> tuple[int, int]:
    record = ObservationRecord(
        user_id=user_id,
        client_request_id=uuid4(),
        recorded_at=datetime.combine(recorded_on, datetime.min.time(), tzinfo=timezone.utc),
        recorded_timezone_offset_minutes=0,
        recorded_local_date=recorded_on,
        status="saved",
    )
    session.add(record)
    session.flush()
    target_input = RegionTargetCreate(
        region_id="forehead",
        user_note=f"{recorded_on.isoformat()} 额头观察",
        event_decision=decision,
    )
    event = reserve_events_for_targets(
        session,
        user_id=user_id,
        recorded_local_date=recorded_on,
        target_inputs=[target_input],
    )["forehead"]
    target = ObservationTarget(
        record_id=record.id,
        user_id=user_id,
        scope_type="region",
        region_id="forehead",
        region_event_id=event.id,
        user_note=target_input.user_note,
        status="completed",
        result_source="user_record",
        completed_at=datetime.now(tz=timezone.utc),
    )
    session.add(target)
    session.commit()
    assert activate_valid_target_event(session, target.id) is True
    return event.id, target.id


def test_region_event_lifecycle_persists_across_sessions(postgres_session_factory) -> None:
    with postgres_session_factory() as setup:
        owner = User(nickname="event owner")
        other = User(nickname="event other")
        setup.add_all([owner, other])
        setup.commit()
        owner_id, other_id = owner.id, other.id

    with postgres_session_factory() as first:
        first_event_id, first_target_id = _add_timepoint(
            first, user_id=owner_id, recorded_on=date(2026, 7, 1)
        )

    with postgres_session_factory() as day_29:
        continued_id, second_target_id = _add_timepoint(
            day_29, user_id=owner_id, recorded_on=date(2026, 7, 30)
        )
        assert continued_id == first_event_id

    with postgres_session_factory() as day_30_continue:
        continued_again_id, third_target_id = _add_timepoint(
            day_30_continue,
            user_id=owner_id,
            recorded_on=date(2026, 8, 29),
            decision="continue",
        )
        assert continued_again_id == first_event_id

    with postgres_session_factory() as day_30_new:
        second_event_id, fourth_target_id = _add_timepoint(
            day_30_new,
            user_id=owner_id,
            recorded_on=date(2026, 9, 28),
            decision="start_new",
        )
        assert second_event_id != first_event_id

    with postgres_session_factory() as verify_replaced:
        first_event = verify_replaced.get(RegionEvent, first_event_id)
        second_event = verify_replaced.get(RegionEvent, second_event_id)
        assert first_event.status == "ended"
        assert first_event.end_reason == "replaced"
        assert second_event.status == "current"
        assert verify_replaced.scalar(
            select(func.count()).select_from(RegionEvent).where(
                RegionEvent.user_id == owner_id,
                RegionEvent.region_id == "forehead",
                RegionEvent.status == "current",
            )
        ) == 1
        detail = get_region_event_detail(
            verify_replaced, user_id=owner_id, event_id=first_event_id
        )
        assert [point.target.target_id for point in detail.timepoints] == [
            first_target_id,
            second_target_id,
            third_target_id,
        ]
        with pytest.raises(HTTPException) as hidden:
            get_region_event_detail(
                verify_replaced,
                user_id=other_id,
                event_id=first_event_id,
            )
        assert hidden.value.status_code == 404

    with postgres_session_factory() as end_session:
        ended = end_region_event(
            end_session,
            user_id=owner_id,
            event_id=second_event_id,
            ended_local_date=date(2026, 9, 29),
        )
        assert ended is not None and ended.status == "ended"

    with postgres_session_factory() as next_session:
        third_event_id, fifth_target_id = _add_timepoint(
            next_session, user_id=owner_id, recorded_on=date(2026, 10, 1)
        )
        assert third_event_id not in (first_event_id, second_event_id)

    with postgres_session_factory() as final:
        events = list_region_events(final, user_id=owner_id)
        assert [event.status for event in events].count("current") == 1
        assert {event.event_id for event in events} == {
            first_event_id,
            second_event_id,
            third_event_id,
        }
        assert get_region_event_detail(
            final, user_id=owner_id, event_id=second_event_id
        ).timepoints[0].target.target_id == fourth_target_id
        assert get_region_event_detail(
            final, user_id=owner_id, event_id=third_event_id
        ).timepoints[0].target.target_id == fifth_target_id


@pytest.mark.parametrize("status", ["current", "pending"])
def test_database_rejects_two_open_events_for_one_user_region(
    postgres_session_factory,
    status: str,
) -> None:
    with postgres_session_factory() as session:
        user = User(nickname=f"unique {status}")
        session.add(user)
        session.flush()
        session.add_all(
            [
                RegionEvent(
                    user_id=user.id,
                    region_id="chin",
                    status=status,
                    started_local_date=date(2026, 8, 1),
                ),
                RegionEvent(
                    user_id=user.id,
                    region_id="chin",
                    status=status,
                    started_local_date=date(2026, 8, 2),
                ),
            ]
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
