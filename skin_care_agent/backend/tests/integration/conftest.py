from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, sessionmaker

from app.config import BACKEND_ROOT, get_settings


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--local-postgres",
        action="store_true",
        default=False,
        help="run PostgreSQL integration tests against the configured local database",
    )


@pytest.fixture(scope="session")
def migrated_database_url(request: pytest.FixtureRequest) -> str | None:
    database_url = os.getenv("TEST_DATABASE_URL")
    if database_url:
        return database_url
    if not request.config.getoption("--local-postgres"):
        return None
    database_url = get_settings().database_url
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "app" / "db" / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")
    return database_url


@pytest.fixture
def postgres_session_factory(
    migrated_database_url: str | None,
) -> Iterator[sessionmaker[Session]]:
    database_url = migrated_database_url
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")

    engine = create_engine(database_url, pool_pre_ping=True, future=True)
    connection: Connection = engine.connect()
    outer_transaction = connection.begin()
    factory = sessionmaker(
        bind=connection,
        autoflush=False,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield factory
    finally:
        if outer_transaction.is_active:
            outer_transaction.rollback()
        connection.close()
        engine.dispose()
