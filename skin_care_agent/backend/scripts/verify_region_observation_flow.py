from __future__ import annotations

import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    tests = [
        "tests/integration/test_observations_persistence.py",
        "tests/integration/test_region_observations_persistence.py",
        "tests/integration/test_region_events_persistence.py",
        "tests/integration/test_region_http_closure.py",
        "tests/integration/test_region_migration_roundtrip.py",
    ]
    return pytest.main([*tests, "--local-postgres", "-q"])


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND_ROOT))
    raise SystemExit(main())
