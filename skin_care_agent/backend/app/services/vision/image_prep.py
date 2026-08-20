"""图像预处理：为 LLM 调用做尺寸压缩 + base64 编码。

FIXME(step-4): 3b 阶段用简单的等比缩放策略控制 token 成本。
未来接入 vision 模块后（Task #4），应先做人脸检测+裁剪，
把眼部打码 + 只送人脸区域给 LLM，此时 image_prep 应下沉为
"resize 到目标尺寸"的纯工具函数，压缩策略由上游 vision 决定。
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

from PIL import Image, ImageOps


DEFAULT_MAX_EDGE_PX = 1600
DEFAULT_JPEG_QUALITY = 85


@dataclass(frozen=True)
class PreparedImage:
    data_url: str
    encoded_bytes: int
    width: int
    height: int
    original_width: int
    original_height: int
    was_resized: bool


def prepare_for_llm(
    raw_bytes: bytes,
    *,
    max_edge_px: int = DEFAULT_MAX_EDGE_PX,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> PreparedImage:
    """把上传图压缩到长边 <= max_edge_px 的 JPEG，返回 data URL。"""
    with Image.open(io.BytesIO(raw_bytes)) as img:
        img.load()
        img = ImageOps.exif_transpose(img)
        original_w, original_h = img.size

        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        long_edge = max(original_w, original_h)
        was_resized = long_edge > max_edge_px
        if was_resized:
            scale = max_edge_px / long_edge
            new_w = int(original_w * scale)
            new_h = int(original_h * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        else:
            new_w, new_h = original_w, original_h

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
        encoded = buf.getvalue()

    b64 = base64.b64encode(encoded).decode("ascii")
    return PreparedImage(
        data_url=f"data:image/jpeg;base64,{b64}",
        encoded_bytes=len(encoded),
        width=new_w,
        height=new_h,
        original_width=original_w,
        original_height=original_h,
        was_resized=was_resized,
    )
