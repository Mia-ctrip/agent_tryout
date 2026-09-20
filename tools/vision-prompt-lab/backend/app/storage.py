import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from . import config


def _read(path: Path) -> list[dict]:
    if not path.exists(): return []
    try: return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError: return []


def _write(path: Path, value: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def now() -> str: return datetime.now(timezone.utc).isoformat()
def all_runs() -> list[dict]: return _read(config.RUNS_FILE)
def save_run(run: dict) -> dict:
    runs = all_runs(); runs.insert(0, run); _write(config.RUNS_FILE, runs[:200]); return run
def all_presets() -> list[dict]: return _read(config.PRESETS_FILE)
def save_preset(item: dict) -> dict:
    items = all_presets(); existing = next((x for x in items if x["scenario"] == item["scenario"] and x["name"] == item["name"]), None)
    item["updated_at"] = now()
    if existing: existing.update(item); return _write(config.PRESETS_FILE, items) or existing
    item["id"] = str(uuid4()); item["created_at"] = item["updated_at"]; items.insert(0, item); _write(config.PRESETS_FILE, items); return item
def delete_preset(item_id: str) -> None: _write(config.PRESETS_FILE, [x for x in all_presets() if x["id"] != item_id])

