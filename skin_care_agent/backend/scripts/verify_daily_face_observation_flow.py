from __future__ import annotations

import subprocess
import sys
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
FOCUSED_TESTS = (
    "tests/test_observation_quality.py",
    "tests/test_observations.py",
    "tests/test_observation_worker.py",
)


def main() -> int:
    command = [sys.executable, "-m", "pytest", *FOCUSED_TESTS, "-q"]
    print("Verifying daily face observation contracts with local test doubles...")
    completed = subprocess.run(command, cwd=BACKEND_ROOT, check=False)
    if completed.returncode != 0:
        print("Daily face observation verification failed.")
        return completed.returncode
    print("Daily face observation verification passed without an external AI provider.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
