"""In-memory SQLite ORM sessions for service-level tests.

This is query/behavior coverage only; PostgreSQL persistence acceptance still needs a
disposable TEST_DATABASE_URL (see tests/integration). JSONB is rendered as JSON and
BigInteger primary keys as INTEGER so SQLite assigns row ids.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Table, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register every table on Base.metadata)
from app.models.base import Base


@compiles(JSONB, "sqlite")
def _jsonb_as_json(element, compiler, **kw) -> str:  # noqa: ARG001
    return "JSON"


@compiles(BigInteger, "sqlite")
def _bigint_as_integer(element, compiler, **kw) -> str:  # noqa: ARG001
    return "INTEGER"


_TABLES = (
    "users",
    "photos",
    "observation_records",
    "observation_targets",
    "region_events",
    "region_insights",
    "ai_call_logs",
)


def _with_fk_dependencies(names: tuple[str, ...]) -> list[Table]:
    """Requested tables plus everything they reference (catalog tables stay out)."""
    pending = list(names)
    seen: dict[str, Table] = {}
    while pending:
        table = Base.metadata.tables[pending.pop()]
        if table.name in seen:
            continue
        seen[table.name] = table
        pending.extend(fk.column.table.name for fk in table.foreign_keys)
    return list(seen.values())


def sqlite_session_factory() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection, _record) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")
        # PostgreSQL-only function used by product catalog constraints.
        dbapi_connection.create_function(
            "btrim", -1, lambda value, chars=None: None if value is None else value.strip(chars)
        )

    Base.metadata.create_all(engine, tables=_with_fk_dependencies(_TABLES))
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
