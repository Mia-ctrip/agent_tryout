from __future__ import annotations

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.config import BACKEND_ROOT


def _config(database_url: str) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "app" / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def test_0020_downgrade_upgrade_round_trip(migrated_database_url) -> None:
    if migrated_database_url is None:
        pytest.skip("TEST_DATABASE_URL or --local-postgres is required for migration round trip")
    config = _config(migrated_database_url)
    engine = create_engine(migrated_database_url, future=True)
    try:
        assert "region_insights" in inspect(engine).get_table_names()
        command.downgrade(config, "0019_personal_product_links")
        assert "region_insights" not in inspect(engine).get_table_names()
        command.upgrade(config, "head")
        inspector = inspect(engine)
        indexes = {index["name"] for index in inspector.get_indexes("region_insights")}
        assert {
            "uq_region_insights_user_kind_fingerprint",
            "ix_region_insights_event_kind",
        } <= indexes
    finally:
        command.upgrade(config, "head")
        engine.dispose()
