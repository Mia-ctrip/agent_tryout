from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DATA_DIR = ROOT / "data"
IMAGE_DIR = DATA_DIR / "images"
RUNS_FILE = DATA_DIR / "runs.json"
PRESETS_FILE = DATA_DIR / "presets.json"

def _load_env_file() -> None:
    """Load the local backend .env without adding a dotenv dependency."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_file()

API_KEY = os.getenv("GLM_API_KEY", "")
BASE_URL = os.getenv("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4").rstrip("/")
DEFAULT_MODEL = os.getenv("GLM_MODEL", "glm-4.6v")
MAX_IMAGE_BYTES = int(os.getenv("VISION_LAB_MAX_IMAGE_BYTES", str(12 * 1024 * 1024)))
