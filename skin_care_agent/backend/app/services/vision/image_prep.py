"""图像预处理：为 LLM 调用做尺寸压缩 + base64 编码。

FIXME(step-4): 3b 阶段用简单的等比缩放策略控制 token 成本。
未来接入 vision 模块后（Task #4），应先做人脸检测+裁剪，
把眼部打码 + 只送人脸区域给 LLM，此时 image_prep 应下沉为
"resize 到目标尺寸"的纯工具函数，压缩策略由上游 vision 决定。
"""

from __future__ import annotations

import base64
import io
import math
from dataclasses import dataclass
from typing import Any, Literal, Mapping

from PIL import Image, ImageOps


DEFAULT_MAX_EDGE_PX = 1600
DEFAULT_JPEG_QUALITY = 85
DEFAULT_REGION_CROP_EDGE_PX = 640
DEFAULT_REGION_FALLBACK_EDGE_PX = 1024
DEFAULT_REGION_CROP_MARGIN = 0.15

CropMode = Literal["region_crop", "full_photo"]


@dataclass(frozen=True)
class PreparedImage:
    data_url: str
    encoded_bytes: int
    width: int
    height: int
    original_width: int
    original_height: int
    was_resized: bool


def _encode(
    img: Image.Image,
    *,
    max_edge_px: int,
    jpeg_quality: int,
    original_size: tuple[int, int],
) -> PreparedImage:
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    width, height = img.size
    long_edge = max(width, height)
    was_resized = long_edge > max_edge_px
    if was_resized:
        scale = max_edge_px / long_edge
        width = int(width * scale)
        height = int(height * scale)
        img = img.resize((width, height), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
    encoded = buf.getvalue()

    b64 = base64.b64encode(encoded).decode("ascii")
    return PreparedImage(
        data_url=f"data:image/jpeg;base64,{b64}",
        encoded_bytes=len(encoded),
        width=width,
        height=height,
        original_width=original_size[0],
        original_height=original_size[1],
        was_resized=was_resized,
    )


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
        return _encode(
            img,
            max_edge_px=max_edge_px,
            jpeg_quality=jpeg_quality,
            original_size=img.size,
        )


@dataclass(frozen=True)
class PreparedRegionImage:
    image: PreparedImage
    crop_mode: CropMode
    # (left, top, right, bottom) in EXIF-oriented original pixels.
    crop_box: tuple[int, int, int, int]


def region_polygon(
    quality_meta: Mapping[str, Any] | None,
    region_id: str,
) -> list[tuple[float, float]] | None:
    """Saved normalized polygon for one region, or None when missing or unusable."""
    if not isinstance(quality_meta, Mapping):
        return None
    regions = quality_meta.get("regions")
    if not isinstance(regions, list):
        return None
    geometry = next(
        (
            item
            for item in regions
            if isinstance(item, Mapping) and item.get("region_id") == region_id
        ),
        None,
    )
    points = geometry.get("points") if geometry is not None else None
    if not isinstance(points, list) or len(points) < 3:
        return None
    polygon: list[tuple[float, float]] = []
    for point in points:
        if not isinstance(point, Mapping):
            return None
        x, y = point.get("x"), point.get("y")
        if isinstance(x, bool) or isinstance(y, bool):
            return None
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        if not (math.isfinite(x) and math.isfinite(y) and 0 <= x <= 1 and 0 <= y <= 1):
            return None
        polygon.append((float(x), float(y)))
    xs = [x for x, _ in polygon]
    ys = [y for _, y in polygon]
    if max(xs) <= min(xs) or max(ys) <= min(ys):
        return None
    return polygon


def prepare_region_crop_for_llm(
    raw_bytes: bytes,
    quality_meta: Mapping[str, Any] | None,
    region_id: str,
    *,
    edge_px: int = DEFAULT_REGION_CROP_EDGE_PX,
    fallback_edge_px: int = DEFAULT_REGION_FALLBACK_EDGE_PX,
    margin_ratio: float = DEFAULT_REGION_CROP_MARGIN,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> PreparedRegionImage:
    """In-memory region copy for comparison/trend requests; the original is never written.

    Geometry is normalized against the EXIF-oriented photo (as produced by the quality
    check), so orientation is applied before the bbox is mapped to pixels. Without
    usable geometry the whole photo is downscaled and marked ``full_photo``.
    """
    polygon = region_polygon(quality_meta, region_id)
    with Image.open(io.BytesIO(raw_bytes)) as img:
        img.load()
        img = ImageOps.exif_transpose(img)
        width, height = img.size
        if polygon is None:
            return PreparedRegionImage(
                image=_encode(
                    img,
                    max_edge_px=fallback_edge_px,
                    jpeg_quality=jpeg_quality,
                    original_size=(width, height),
                ),
                crop_mode="full_photo",
                crop_box=(0, 0, width, height),
            )
        left = min(x for x, _ in polygon) * width
        right = max(x for x, _ in polygon) * width
        top = min(y for _, y in polygon) * height
        bottom = max(y for _, y in polygon) * height
        pad_x = (right - left) * margin_ratio
        pad_y = (bottom - top) * margin_ratio
        box = (
            max(0, math.floor(left - pad_x)),
            max(0, math.floor(top - pad_y)),
            min(width, math.ceil(right + pad_x)),
            min(height, math.ceil(bottom + pad_y)),
        )
        return PreparedRegionImage(
            image=_encode(
                img.crop(box),
                max_edge_px=edge_px,
                jpeg_quality=jpeg_quality,
                original_size=(width, height),
            ),
            crop_mode="region_crop",
            crop_box=box,
        )
