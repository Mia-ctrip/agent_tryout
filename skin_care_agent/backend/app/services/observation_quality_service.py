from __future__ import annotations

from collections.abc import Sequence

from app.domain.region_catalog import REGION_IDS
from app.schemas.observation_quality import (
    NormalizedPoint,
    ObservationQualityIssue,
    ObservationQualityOut,
    ObservationRegionGeometry,
)
from app.services.vision.quality import PhotoQualityResult, assess_photo_quality


_FOREHEAD = (103, 67, 109, 10, 338, 297, 332, 284, 300, 293, 334, 296, 336, 107, 66, 105, 63, 70)
_IMAGE_LEFT_CHEEK = (116, 117, 118, 119, 100, 126, 209, 203, 206, 186, 214, 192, 213, 147, 123)
_IMAGE_RIGHT_CHEEK = (345, 346, 347, 348, 329, 355, 429, 423, 426, 410, 434, 416, 433, 376, 352)
_REQUIRED_GEOMETRY_LANDMARK = 454

_ISSUE_COPY: dict[str, tuple[str, str]] = {
    "face_not_detected": ("face_not_found", "请将脸移入框内后重拍"),
    "face_cut_off": ("face_not_found", "请让额头、两颊和下巴完整出现在框内"),
    "face_off_center": ("face_not_found", "请将脸移到引导框中央"),
    "multiple_faces": ("multiple_faces", "画面中请只保留一张主要人脸"),
    "face_too_small": ("face_too_far", "脸部距离有些远，请靠近一点"),
    "face_too_large": ("face_too_close", "脸部距离过近，请稍微向后移动"),
    "head_tilted": ("face_off_angle", "请保持手机水平并正视镜头"),
    "view_angle_mismatch": ("face_off_angle", "请正视镜头后重拍"),
    "lighting_extreme": ("poor_lighting", "光线不太合适，请面向柔和光源后重拍"),
    "lighting_clipped": ("poor_lighting", "画面有明显过暗或过曝，请调整光线后重拍"),
    "image_blurry": ("blurry", "照片有些模糊，请保持手机稳定"),
    "face_occluded": ("occluded", "面部关键区域可能被遮挡，请整理后重拍"),
    "image_too_small": ("low_resolution", "照片分辨率较低，请使用相机原图重拍"),
}
_ISSUE_PRIORITY = (
    "face_not_found",
    "multiple_faces",
    "face_too_far",
    "face_too_close",
    "face_off_angle",
    "poor_lighting",
    "blurry",
    "occluded",
    "low_resolution",
)


def _point(value: Sequence[float]) -> NormalizedPoint:
    return NormalizedPoint(
        x=min(1.0, max(0.0, float(value[0]))),
        y=min(1.0, max(0.0, float(value[1]))),
    )


def _polygon(
    landmarks: Sequence[Sequence[float]],
    indexes: Sequence[int],
) -> tuple[NormalizedPoint, ...]:
    return tuple(_point(landmarks[index]) for index in indexes)


def _centroid_x(points: Sequence[NormalizedPoint]) -> float:
    return sum(point.x for point in points) / len(points)


def _derived_point(x: float, y: float) -> NormalizedPoint:
    return NormalizedPoint(x=min(1.0, max(0.0, x)), y=min(1.0, max(0.0, y)))


def _nose_polygon(landmarks: Sequence[Sequence[float]]) -> tuple[NormalizedPoint, ...]:
    top = _point(landmarks[168])
    left_wing = _point(landmarks[98])
    right_wing = _point(landmarks[327])
    left_mouth = _point(landmarks[61])
    right_mouth = _point(landmarks[291])
    upper_lip = _point(landmarks[0])
    face_width = abs(float(landmarks[454][0]) - float(landmarks[234][0]))
    face_height = abs(float(landmarks[152][1]) - float(landmarks[10][1]))
    center_x = (left_wing.x + right_wing.x) / 2
    return (
        _derived_point(center_x, top.y),
        _derived_point(center_x + face_width * 0.08, top.y + face_height * 0.10),
        _derived_point(right_wing.x + face_width * 0.03, right_wing.y),
        _derived_point(right_mouth.x + face_width * 0.02, upper_lip.y - face_height * 0.015),
        _derived_point(center_x, upper_lip.y),
        _derived_point(left_mouth.x - face_width * 0.02, upper_lip.y - face_height * 0.015),
        _derived_point(left_wing.x - face_width * 0.03, left_wing.y),
        _derived_point(center_x - face_width * 0.08, top.y + face_height * 0.10),
    )


def _mouth_polygon(landmarks: Sequence[Sequence[float]]) -> tuple[NormalizedPoint, ...]:
    left_mouth = _point(landmarks[61])
    right_mouth = _point(landmarks[291])
    left_wing = _point(landmarks[98])
    right_wing = _point(landmarks[327])
    lower_lip = _point(landmarks[17])
    face_width = abs(float(landmarks[454][0]) - float(landmarks[234][0]))
    face_height = abs(float(landmarks[152][1]) - float(landmarks[10][1]))
    left = left_mouth.x - face_width * 0.06
    right = right_mouth.x + face_width * 0.06
    top = min(left_wing.y, right_wing.y) + face_height * 0.015
    bottom = lower_lip.y + face_height * 0.04
    corner_x = (right - left) * 0.18
    corner_y = (bottom - top) * 0.18
    return (
        _derived_point(left + corner_x, top),
        _derived_point(right - corner_x, top),
        _derived_point(right, top + corner_y),
        _derived_point(right, bottom - corner_y),
        _derived_point(right - corner_x, bottom),
        _derived_point(left + corner_x, bottom),
        _derived_point(left, bottom - corner_y),
        _derived_point(left, top + corner_y),
    )


def _chin_polygon(landmarks: Sequence[Sequence[float]]) -> tuple[NormalizedPoint, ...]:
    left = _point(landmarks[57])
    right = _point(landmarks[287])
    lower_lip = _point(landmarks[17])
    bottom = _point(landmarks[152])
    face_height = abs(float(landmarks[152][1]) - float(landmarks[10][1]))
    top_y = lower_lip.y + face_height * 0.015
    middle_y = (top_y + bottom.y) / 2
    return (
        _derived_point(left.x, top_y),
        _derived_point((left.x + bottom.x) / 2, top_y - face_height * 0.01),
        _derived_point((right.x + bottom.x) / 2, top_y - face_height * 0.01),
        _derived_point(right.x, top_y),
        _derived_point(right.x - (right.x - bottom.x) * 0.18, middle_y),
        _derived_point(bottom.x + (right.x - bottom.x) * 0.30, bottom.y),
        _derived_point(bottom.x - (bottom.x - left.x) * 0.30, bottom.y),
        _derived_point(left.x + (bottom.x - left.x) * 0.18, middle_y),
    )


def build_region_geometries(
    landmarks: Sequence[Sequence[float]],
) -> list[ObservationRegionGeometry]:
    if len(landmarks) <= _REQUIRED_GEOMETRY_LANDMARK:
        raise ValueError("face landmarks are incomplete")
    image_left = _polygon(landmarks, _IMAGE_LEFT_CHEEK)
    image_right = _polygon(landmarks, _IMAGE_RIGHT_CHEEK)
    physical_left, physical_right = (
        (image_left, image_right)
        if _centroid_x(image_left) > _centroid_x(image_right)
        else (image_right, image_left)
    )
    polygons = {
        "forehead": _polygon(landmarks, _FOREHEAD),
        "left_face": physical_left,
        "right_face": physical_right,
        "nose_area": _nose_polygon(landmarks),
        "mouth_area": _mouth_polygon(landmarks),
        "chin": _chin_polygon(landmarks),
    }
    return [
        ObservationRegionGeometry(region_id=region_id, points=polygons[region_id])
        for region_id in REGION_IDS
    ]


def quality_issues_from_result(
    result: PhotoQualityResult,
) -> list[ObservationQualityIssue]:
    by_code: dict[str, ObservationQualityIssue] = {}
    for source_code in result.errors:
        mapped = _ISSUE_COPY.get(source_code)
        if mapped is None:
            continue
        issue_code, message = mapped
        by_code.setdefault(
            issue_code,
            ObservationQualityIssue(code=issue_code, message=message),
        )
    return [by_code[code] for code in _ISSUE_PRIORITY if code in by_code]


def assess_observation_photo(raw_bytes: bytes) -> ObservationQualityOut:
    result = assess_photo_quality(raw_bytes, view_type="front")
    issues = quality_issues_from_result(result)
    regions = (
        build_region_geometries(result.landmarks)
        if result.landmarks is not None and not any(
            issue.code in {"face_not_found", "multiple_faces"} for issue in issues
        )
        else []
    )
    return ObservationQualityOut(
        status="failed" if issues else "passed",
        primary_issue=issues[0] if issues else None,
        issues=issues,
        metrics=result.to_meta()["metrics"],
        regions=regions,
    )
