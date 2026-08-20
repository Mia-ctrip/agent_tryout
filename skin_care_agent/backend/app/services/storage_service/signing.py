from __future__ import annotations

import hmac
import time
from hashlib import sha256
from urllib.parse import quote, urlencode

from app.config import get_settings


def _sign(key: str, exp: int, secret: str) -> str:
    msg = f"{key}|{exp}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, sha256).hexdigest()


def sign_url(key: str, ttl_seconds: int | None = None) -> tuple[str, int]:
    """Return (url, exp_unix). URL form: {base}/{key}?exp=...&sig=..."""
    s = get_settings()
    ttl = ttl_seconds or s.storage_url_ttl_seconds
    exp = int(time.time()) + ttl
    sig = _sign(key, exp, s.storage_url_sign_secret)
    qs = urlencode({"exp": exp, "sig": sig})
    base = s.storage_local_base_url.rstrip("/")
    # do not quote slashes in the key — they encode directory structure
    return f"{base}/{quote(key, safe='/')}?{qs}", exp


def verify_signature(key: str, exp: int, sig: str) -> bool:
    s = get_settings()
    if exp < int(time.time()):
        return False
    expected = _sign(key, exp, s.storage_url_sign_secret)
    return hmac.compare_digest(expected, sig)
