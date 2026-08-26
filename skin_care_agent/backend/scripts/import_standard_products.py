from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Callable


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def _catalog_service():
    backend_root = str(BACKEND_ROOT)
    if backend_root not in sys.path:
        sys.path.insert(0, backend_root)
    from app.services import catalog_import_service

    return catalog_import_service


def run_import(
    *,
    source: Path,
    dry_run: bool,
    session_factory: Callable[[], Any] | None = None,
    storage: Any | None = None,
):
    service = _catalog_service()
    try:
        package = service.validate_catalog_package(source)
        if dry_run:
            return service.import_catalog(None, None, package, dry_run=True)
        if session_factory is None:
            from app.db.session import SessionLocal

            session_factory = SessionLocal
        if storage is None:
            from app.services.storage_service.factory import get_storage

            storage = get_storage()
        with session_factory() as db:
            return service.import_catalog(db, storage, package, dry_run=False)
    except (RuntimeError, ValueError) as exc:
        return service.ImportReport(
            valid=False,
            catalog_version="",
            products=0,
            aliases=0,
            documents=0,
            images=0,
            errors=[str(exc)],
        )
    except Exception:
        return service.ImportReport(
            valid=False,
            catalog_version="",
            products=0,
            aliases=0,
            documents=0,
            images=0,
            errors=["catalog import failed"],
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import a versioned standard-product catalog")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    report = run_import(source=args.source, dry_run=args.dry_run)
    print(report.model_dump_json(indent=2))
    return 0 if report.valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
