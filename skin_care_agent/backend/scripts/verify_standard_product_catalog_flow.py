from __future__ import annotations

import os
from pathlib import Path
import shutil
import sys
from tempfile import mkdtemp
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


BACKEND_ROOT = Path(__file__).resolve().parents[1]
CLOSURE_TESTS = (
    "tests/integration/test_standard_product_migration_roundtrip.py",
    "tests/integration/test_standard_product_catalog_http.py",
    "tests/integration/test_product_http_closure.py",
)


def closure_database_url(default_database_url: str) -> str:
    return os.environ.get("TEST_DATABASE_URL", default_database_url)


def verify_flow() -> None:
    """Run the catalog closure in an isolated schema and local storage directory."""
    from app.config import get_settings

    base_url = closure_database_url(get_settings().database_url)
    schema_name = f"catalog_closure_{uuid4().hex}"
    scoped_url = str(
        make_url(base_url).update_query_dict({"options": f"-csearch_path={schema_name}"})
    )
    storage_directory = Path(mkdtemp(prefix="skin-catalog-closure-"))
    engine = create_engine(base_url, future=True)
    previous_environment = {
        key: os.environ.get(key)
        for key in ("DATABASE_URL", "TEST_DATABASE_URL", "STORAGE_LOCAL_DIR")
    }

    try:
        with engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))

        os.environ["DATABASE_URL"] = scoped_url
        os.environ["TEST_DATABASE_URL"] = scoped_url
        os.environ["STORAGE_LOCAL_DIR"] = str(storage_directory)
        get_settings.cache_clear()

        print("stage: migration, catalog import, HTTP search, cabinet, snapshots, isolation")
        result = pytest.main([*CLOSURE_TESTS, "--local-postgres", "-q"])
        if result != pytest.ExitCode.OK:
            raise RuntimeError(f"catalog closure failed with pytest exit code {result}")
        print(f"PASS: {len(CLOSURE_TESTS)} integration suites")
    finally:
        get_settings.cache_clear()
        for key, value in previous_environment.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        try:
            with engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        finally:
            engine.dispose()
            shutil.rmtree(storage_directory, ignore_errors=True)


def main() -> int:
    verify_flow()
    return 0


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND_ROOT))
    raise SystemExit(main())
