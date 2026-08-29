from __future__ import annotations

import sys
from pathlib import Path

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    tests = [
        "tests/integration/test_product_http_closure.py",
        "tests/integration/test_life_context_http_closure.py",
        "tests/integration/test_timeline_http_closure.py",
        "tests/integration/test_region_migration_roundtrip.py",
    ]
    return pytest.main([*tests, "--local-postgres", "-q"])


if __name__ == "__main__":
    sys.path.insert(0, str(BACKEND_ROOT))
    raise SystemExit(main())
