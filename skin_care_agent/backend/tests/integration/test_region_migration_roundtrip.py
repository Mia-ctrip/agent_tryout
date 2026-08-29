from __future__ import annotations

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text

from app.config import BACKEND_ROOT


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "app" / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _fingerprint(database_url: str) -> tuple:
    engine = create_engine(database_url, future=True)
    try:
        inspector = inspect(engine)
        tables = sorted(inspector.get_table_names())
        return tuple(
            (
                table,
                tuple(sorted(column["name"] for column in inspector.get_columns(table))),
                tuple(sorted(index["name"] for index in inspector.get_indexes(table))),
            )
            for table in tables
        )
    finally:
        engine.dispose()


def test_0014_0015_downgrade_upgrade_preserves_legacy_observations(
    migrated_database_url,
) -> None:
    if migrated_database_url is None:
        pytest.skip("use --local-postgres for the migration round trip")
    config = _config(migrated_database_url)
    engine = create_engine(migrated_database_url, future=True)
    with engine.connect() as connection:
        before_count = connection.scalar(text("SELECT count(*) FROM observation_records"))
    before = _fingerprint(migrated_database_url)
    try:
        command.downgrade(config, "0013_full_face_observations")
        downgraded = inspect(engine)
        assert "region_events" not in downgraded.get_table_names()
        assert "recorded_local_date" not in {
            column["name"] for column in downgraded.get_columns("observation_records")
        }
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM observation_records")) == before_count
        command.upgrade(config, "head")
    finally:
        command.upgrade(config, "head")
        engine.dispose()

    assert _fingerprint(migrated_database_url) == before
