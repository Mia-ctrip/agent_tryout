from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.vision.normalization import (
    OUTPUT_HEIGHT,
    OUTPUT_WIDTH,
    normalize_photo_for_analysis,
)
from app.services.vision.quality import PhotoQualityResult


def _source_jpeg() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (900, 1200), color=(120, 100, 90)).save(output, format="JPEG")
    return output.getvalue()


def _quality(status: str = "passed") -> PhotoQualityResult:
    return PhotoQualityResult(
        status=status,
        view_type="front",
        errors=() if status == "passed" else ("face_cut_off",),
        warnings=(),
        metrics={
            "face_box": {
                "left": 0.2,
                "top": 0.2,
                "right": 0.8,
                "bottom": 0.75,
                "width": 0.6,
                "height": 0.55,
                "center_x": 0.5,
                "center_y": 0.475,
            }
        },
    )


def test_normalization_outputs_fixed_geometry_without_color_adjustment() -> None:
    result = normalize_photo_for_analysis(_source_jpeg(), _quality())

    with Image.open(io.BytesIO(result.data)) as image:
        assert image.size == (OUTPUT_WIDTH, OUTPUT_HEIGHT)
        pixel = image.getpixel((OUTPUT_WIDTH // 2, OUTPUT_HEIGHT // 2))

    assert result.source_size == (900, 1200)
    assert all(abs(channel - expected) <= 2 for channel, expected in zip(pixel, (120, 100, 90)))
    assert result.to_meta()["geometry_only"] is True


def test_normalization_rejects_failed_quality_result() -> None:
    with pytest.raises(ValueError, match="failed-quality"):
        normalize_photo_for_analysis(_source_jpeg(), _quality("failed"))