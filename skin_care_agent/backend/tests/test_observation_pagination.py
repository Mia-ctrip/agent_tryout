from sqlalchemy import create_engine, text

from app.services import observation_service


def test_time_cursor_does_not_omit_backdated_ids_and_is_account_scoped() -> None:
    # Execute the real read query against an isolated, in-memory minimal table.
    # This is query behavior coverage, not PostgreSQL persistence acceptance.
    engine = create_engine('sqlite://')
    with engine.begin() as db:
        db.execute(text('CREATE TABLE observation_records '
                        '(id INTEGER, user_id INTEGER, recorded_at DATETIME, deleted_at DATETIME)'))
        rows = [
            {'id': record_id, 'user_id': 7, 'recorded_at':
             '2030-01-01' if record_id == 1 else
             '2000-01-01' if record_id == 2 else '2026-01-01', 'deleted_at': None}
            for record_id in range(1, 52)
        ]
        rows += [{'id': 90, 'user_id': 8, 'recorded_at': '2031-01-01', 'deleted_at': None},
                 {'id': 91, 'user_id': 7, 'recorded_at': '2032-01-01', 'deleted_at': '2032-01-02'}]
        db.execute(text('INSERT INTO observation_records VALUES '
                        '(:id, :user_id, :recorded_at, :deleted_at)'), rows)
        first = list(db.scalars(observation_service._observation_page_ids(
            user_id=7, limit=50, before_id=None,
        )))
        assert first == [1, *range(51, 2, -1)]
        second = list(db.scalars(observation_service._observation_page_ids(
            user_id=7, limit=50, before_id=first[-1],
        )))
        assert second == [2]
        assert list(db.scalars(observation_service._observation_page_ids(
            user_id=7, limit=50, before_id=90,
        ))) == []
        # A soft-deleted cursor still anchors the same user's next page.
        assert list(db.scalars(observation_service._observation_page_ids(
            user_id=7, limit=1, before_id=91,
        ))) == [1]
    engine.dispose()
