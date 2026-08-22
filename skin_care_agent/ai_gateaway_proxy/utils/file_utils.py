from pathlib import Path


_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def read_text_file(relative_path: str) -> str:
    """读取相对于 ai_gateaway_proxy 目录的 UTF-8 文本文件。"""
    file_path = _PROJECT_ROOT / relative_path
    return file_path.read_text(encoding="utf-8")
