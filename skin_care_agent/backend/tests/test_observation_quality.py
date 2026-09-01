from __future__ import annotations

import io
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api.deps import get_current_app_user
from app.main import app
from app.services.observation_quality_service import (
    build_region_geometries,
    quality_issues_from_result,
)
from app.services.vision.quality import PhotoQualityResult
from app.services.vision.quality import key_regions_are_occluded


def _image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (720, 960), color=(142, 132, 124)).save(output, format="JPEG")
    return output.getvalue()


def _face_landmarks() -> tuple[tuple[float, float, float], ...]:
    points = [(0.5, 0.5, 0.0) for _ in range(478)]
    for index in (116, 117, 118, 119, 100, 126, 209, 203, 206, 186, 214, 192, 213, 147, 123):
        points[index] = (0.30, 0.58, 0.0)
    for index in (345, 346, 347, 348, 329, 355, 429, 423, 426, 410, 434, 416, 433, 376, 352):
        points[index] = (0.70, 0.58, 0.0)
    anchors = {
        168: (0.50, 0.34, 0.0),
        98: (0.42, 0.60, 0.0),
        327: (0.58, 0.60, 0.0),
        61: (0.40, 0.69, 0.0),
        291: (0.60, 0.69, 0.0),
        0: (0.50, 0.68, 0.0),
        17: (0.50, 0.75, 0.0),
        152: (0.50, 0.90, 0.0),
        234: (0.24, 0.58, 0.0),
        454: (0.76, 0.58, 0.0),
        57: (0.36, 0.72, 0.0),
        287: (0.64, 0.72, 0.0),
    }
    for index, value in anchors.items():
        points[index] = value
    return tuple(points)


def test_region_geometry_exposes_six_normalized_polygons_and_physical_left() -> None:
    regions = build_region_geometries(_face_landmarks())

    assert [region.region_id for region in regions] == [
        "forehead",
        "left_face",
        "right_face",
        "nose_area",
        "mouth_area",
        "chin",
    ]
    assert all(len(region.points) >= 6 for region in regions)
    assert all(
        0.0 <= point.x <= 1.0 and 0.0 <= point.y <= 1.0
        for region in regions
        for point in region.points
    )
    by_id = {region.region_id: region for region in regions}
    left_centroid = sum(point.x for point in by_id["left_face"].points) / len(
        by_id["left_face"].points
    )
    right_centroid = sum(point.x for point in by_id["right_face"].points) / len(
        by_id["right_face"].points
    )
    assert left_centroid > right_centroid


def test_region_geometry_keeps_feature_zones_separate() -> None:
    by_id = {region.region_id: region for region in build_region_geometries(_face_landmarks())}

    mouth_x = [point.x for point in by_id["mouth_area"].points]
    assert max(mouth_x) - min(mouth_x) < 0.40
    assert min(point.y for point in by_id["chin"].points) > 0.65
    assert max(point.y for point in by_id["left_face"].points) < 0.82
    assert max(point.y for point in by_id["right_face"].points) < 0.82
    nose_x = [point.x for point in by_id["nose_area"].points]
    assert max(nose_x) - min(nose_x) >= 0.18


def test_quality_issues_choose_one_actionable_problem_by_priority() -> None:
    result = PhotoQualityResult(
        status="failed",
        view_type="front",
        errors=("image_blurry", "lighting_extreme", "face_not_detected"),
        warnings=(),
        metrics={},
    )

    issues = quality_issues_from_result(result)

    assert [issue.code for issue in issues] == [
        "face_not_found",
        "poor_lighting",
        "blurry",
    ]
    assert issues[0].message == "请将脸移入框内后重拍"


def test_occlusion_check_is_conservative_when_landmark_confidence_exists() -> None:
    visible = [SimpleNamespace(visibility=0.9, presence=0.9) for _ in range(478)]
    for index in (33, 263, 1, 13, 14, 152):
        visible[index] = SimpleNamespace(visibility=0.15, presence=0.2)
    assert key_regions_are_occluded(visible) is True
    unavailable = [SimpleNamespace(visibility=None, presence=None) for _ in range(478)]
    assert key_regions_are_occluded(unavailable) is False


@contextmanager
def _client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from app.api import observations

    writes = SimpleNamespace(storage=0, database=0)
    response = SimpleNamespace(
        status="passed",
        primary_issue=None,
        issues=[],
        metrics={"face_count": 1},
        regions=build_region_geometries(_face_landmarks()),
    )
    monkeypatch.setattr(
        observations.observation_quality_service,
        "assess_observation_photo",
        lambda _data: response,
    )
    app.dependency_overrides[get_current_app_user] = lambda: SimpleNamespace(id=7)
    try:
        with TestClient(app) as client:
            client.app.state.observation_quality_test_writes = writes
            yield client
    finally:
        app.dependency_overrides.clear()


def test_quality_preflight_returns_geometry_without_persisting(monkeypatch) -> None:
    with _client(monkeypatch) as client:
        response = client.post(
            "/api/v1/observations/photo-quality",
            files={"file": ("face.jpg", _image_bytes(), "image/jpeg")},
        )
        writes = client.app.state.observation_quality_test_writes

    assert response.status_code == 200
    assert response.json()["status"] == "passed"
    assert len(response.json()["regions"]) == 6
    assert writes.storage == 0
    assert writes.database == 0
