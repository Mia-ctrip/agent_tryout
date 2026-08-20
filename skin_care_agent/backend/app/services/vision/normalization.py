"""为后续 AI 分析生成几何标准化照片。

只统一 EXIF 方向、裁切范围与输出尺寸；不做美白、调色、锐化或皮肤修改。
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageOps

from app.services.vision.quality import PhotoQualityResult


OUTPUT_WIDTH = 1024
OUTPUT_HEIGHT = 1280
OUTPUT_JPEG_QUALITY = 92
FACE_TARGET_WIDTH_RATIO = 0.62
FACE_TARGET_HEIGHT_RATIO = 0.56


@dataclass(frozen=True)
class NormalizedPhoto:
    data: bytes
    width: int
    height: int
    crop_box_px: tuple[int, int, int, int]
    source_size: tuple[int, int]

    def to_meta(self) -> dict[str, Any]:
        return {
            "width": self.width,
            "height": self.height,
            "crop_box_px": list(self.crop_box_px),
            "source_size": list(self.source_size),
            "geometry_only": True,
        }


def _bounded_crop(
    *,
    image_width: int,
    image_height: int,
    center_x: float,
    center_y: float,
    crop_width: float,
    crop_height: float,
) -> tuple[int, int, int, int]:
    crop_width = min(crop_width, float(image_width))
    crop_height = min(crop_height, float(image_height))

    left = center_x - crop_width / 2.0
    top = center_y - crop_height / 2.0
    left = min(max(left, 0.0), image_width - crop_width)
    top = min(max(top, 0.0), image_height - crop_height)

    right = left + crop_width
    bottom = top + crop_height
    return (
        int(round(left)),
        int(round(top)),
        int(round(right)),
        int(round(bottom)),
    )


def _crop_box_from_face(
    image_width: int,
    image_height: int,
    face_box: dict[str, float],
) -> tuple[int, int, int, int]:
    face_width = face_box["width"] * image_width
    face_height = face_box["height"] * image_height
    crop_width = face_width / FACE_TARGET_WIDTH_RATIO
    crop_height = face_height / FACE_TARGET_HEIGHT_RATIO
    target_aspect = OUTPUT_WIDTH / OUTPUT_HEIGHT

    if crop_width / crop_height > target_aspect:
        crop_height = crop_width / target_aspect
    else:
        crop_width = crop_height * target_aspect

    if crop_width > image_width:
        crop_width = float(image_width)
        crop_height = crop_width / target_aspect
    if crop_height > image_height:
        crop_height = float(image_height)
        crop_width = crop_height * target_aspect

    center_x = face_box["center_x"] * image_width
    center_y = face_box["center_y"] * image_height
    return _bounded_crop(
        image_width=image_width,
        image_height=image_height,
        center_x=center_x,
        center_y=center_y,
        crop_width=crop_width,
        crop_height=crop_height,
    )


def normalize_photo_for_analysis(
    raw_bytes: bytes,
    quality: PhotoQualityResult,
) -> NormalizedPhoto:
    """使用已通过质量检查的人脸框生成固定 4:5 JPEG。"""
    if not quality.passed:
        raise ValueError("cannot normalize a failed-quality photo")
    face_box = quality.metrics.get("face_box")
    if not isinstance(face_box, dict):
        raise ValueError("quality result does not contain face_box")

    with Image.open(io.BytesIO(raw_bytes)) as image:
        image.load()
        image = ImageOps.exif_transpose(image).convert("RGB")
        source_size = image.size
        crop_box = _crop_box_from_face(image.width, image.height, face_box)
        normalized = image.crop(crop_box).resize(
            (OUTPUT_WIDTH, OUTPUT_HEIGHT),
            Image.Resampling.LANCZOS,
        )
        output = io.BytesIO()
        normalized.save(
            output,
            format="JPEG",
            quality=OUTPUT_JPEG_QUALITY,
            optimize=True,
            subsampling=0,
        )

    return NormalizedPhoto(
        data=output.getvalue(),
        width=OUTPUT_WIDTH,
        height=OUTPUT_HEIGHT,
        crop_box_px=crop_box,
        source_size=source_size,
    )