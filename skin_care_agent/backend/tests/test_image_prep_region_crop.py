from __future__ import annotations

import base64
import io

import pytest
from PIL import Image, ImageStat

from app.services.vision.image_prep import prepare_region_crop_for_llm, region_polygon


def _box(x0: float, y0: float, x1: float, y1: float) -> list[dict[str, float]]:
    return [{"x": x0, "y": y0}, {"x": x1, "y": y0}, {"x": x1, "y": y1}, {"x": x0, "y": y1}]


def _meta(**regions: list[dict[str, float]]) -> dict:
    return {"regions": [{"region_id": key, "points": value} for key, value in regions.items()]}


def _jpeg(image: Image.Image, **save_kwargs) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95, **save_kwargs)
    return buffer.getvalue()


def _decode(data_url: str) -> Image.Image:
    raw = base64.b64decode(data_url.split(",", 1)[1])
    image = Image.open(io.BytesIO(raw))
    image.load()
    return image.convert("RGB")


def _two_tone(width: int = 800, height: int = 1000) -> Image.Image:
    # Top half red (forehead area), bottom half blue (chin area).
    image = Image.new("RGB", (width, height), (0, 0, 255))
    image.paste((255, 0, 0), (0, 0, width, height // 2))
    return image


def test_region_crop_follows_saved_geometry() -> None:
    raw = _jpeg(_two_tone())
    meta = _meta(forehead=_box(0.3, 0.05, 0.7, 0.25), chin=_box(0.35, 0.8, 0.65, 0.95))

    forehead = prepare_region_crop_for_llm(raw, meta, "forehead")
    chin = prepare_region_crop_for_llm(raw, meta, "chin")

    assert forehead.crop_mode == "region_crop"
    assert chin.crop_mode == "region_crop"
    red, _, blue = ImageStat.Stat(_decode(forehead.image.data_url)).mean
    assert red > 200 and blue < 60
    red, _, blue = ImageStat.Stat(_decode(chin.image.data_url)).mean
    assert blue > 200 and red < 60
    assert forehead.crop_box != chin.crop_box


def test_crop_box_expands_margin_and_clamps_to_image() -> None:
    raw = _jpeg(_two_tone(1000, 1000))
    prepared = prepare_region_crop_for_llm(raw, _meta(chin=_box(0.0, 0.8, 0.4, 1.0)), "chin")
    left, top, right, bottom = prepared.crop_box
    # 15% of the 400x200 bbox on each side, clamped at the image edge.
    assert (left, top, right, bottom) == (0, 770, 460, 1000)


def test_left_face_uses_saved_region_id_without_mirroring() -> None:
    image = Image.new("RGB", (1000, 1000), (0, 0, 255))
    image.paste((255, 0, 0), (0, 0, 500, 1000))
    raw = _jpeg(image)
    # Saved geometry for the user's left cheek sits on the image's right side (selfie view).
    meta = _meta(left_face=_box(0.6, 0.4, 0.9, 0.7), right_face=_box(0.1, 0.4, 0.4, 0.7))

    left = prepare_region_crop_for_llm(raw, meta, "left_face")
    red, _, blue = ImageStat.Stat(_decode(left.image.data_url)).mean
    assert blue > 200 and red < 60
    right = prepare_region_crop_for_llm(raw, meta, "right_face")
    red, _, blue = ImageStat.Stat(_decode(right.image.data_url)).mean
    assert red > 200 and blue < 60


@pytest.mark.parametrize(
    "meta",
    [
        None,
        {},
        {"regions": []},
        _meta(forehead=_box(0.3, 0.05, 0.7, 0.25)),  # other region only
        _meta(chin=[{"x": 0.2, "y": 0.2}, {"x": 0.4, "y": 0.4}]),  # fewer than 3 points
        _meta(chin=_box(0.2, 0.8, 1.4, 0.9)),  # out of range
        _meta(chin=_box(0.5, 0.5, 0.5, 0.9)),  # zero width
        {"regions": [{"region_id": "chin", "points": [{"x": "a", "y": 0.1}] * 3}]},
    ],
)
def test_missing_or_invalid_geometry_falls_back_to_downscaled_full_photo(meta) -> None:
    raw = _jpeg(_two_tone(2000, 2500))
    prepared = prepare_region_crop_for_llm(raw, meta, "chin", fallback_edge_px=1024)
    assert prepared.crop_mode == "full_photo"
    assert prepared.crop_box == (0, 0, 2000, 2500)
    assert max(prepared.image.width, prepared.image.height) == 1024
    assert region_polygon(meta, "chin") is None


def test_exif_rotation_is_applied_before_normalized_geometry() -> None:
    # Oriented (displayed) image: 600 wide x 1000 tall, red top, blue bottom.
    oriented = _two_tone(600, 1000)
    raw_pixels = oriented.transpose(Image.Transpose.ROTATE_90)
    exif = Image.Exif()
    exif[0x0112] = 6
    raw = _jpeg(raw_pixels, exif=exif)

    prepared = prepare_region_crop_for_llm(raw, _meta(chin=_box(0.3, 0.8, 0.7, 0.95)), "chin")
    assert prepared.image.original_width == 600
    assert prepared.image.original_height == 1000
    red, _, blue = ImageStat.Stat(_decode(prepared.image.data_url)).mean
    assert blue > 200 and red < 60


def test_crop_is_downscaled_to_edge_but_never_upscaled() -> None:
    large = prepare_region_crop_for_llm(
        _jpeg(_two_tone(4000, 5000)), _meta(chin=_box(0.1, 0.5, 0.9, 0.95)), "chin", edge_px=640
    )
    assert max(large.image.width, large.image.height) == 640
    assert large.image.was_resized is True

    small = prepare_region_crop_for_llm(
        _jpeg(_two_tone(400, 500)), _meta(chin=_box(0.4, 0.8, 0.6, 0.9)), "chin", edge_px=640
    )
    assert max(small.image.width, small.image.height) < 640
    assert small.image.was_resized is False
