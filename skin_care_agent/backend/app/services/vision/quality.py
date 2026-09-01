"""本地照片质量与拍摄姿态检查。

此模块只负责判断照片是否适合进入后续分析：清晰度、光照、是否完整包含
人脸，以及 front/left/right 视角是否基本符合要求。它不识别痘痘。
"""

from __future__ import annotations

import io
import threading
from dataclasses import dataclass
from functools import lru_cache
from math import atan2, degrees
from pathlib import Path
from collections.abc import Sequence
from typing import Any, Literal

import cv2
import numpy as np
from PIL import Image, ImageOps

from app.config import BACKEND_ROOT


QUALITY_MODEL_PATH = BACKEND_ROOT / "model_assets" / "face_landmarker.task"
MIN_IMAGE_EDGE_PX = 640
MIN_LAPLACIAN_VARIANCE = 100.0
MIN_FACE_MARGIN = 0.02
MIN_FACE_WIDTH_RATIO = 0.35
MIN_FACE_HEIGHT_RATIO = 0.35
MAX_ROLL_DEGREES = 15.0
FRONT_MAX_YAW_PROXY = 0.30
SIDE_MIN_YAW_PROXY = 0.30
MAX_FACE_WIDTH_RATIO = 0.82
MAX_FACE_HEIGHT_RATIO = 0.90
MAX_FACE_CENTER_X_OFFSET = 0.14
MIN_FACE_CENTER_Y = 0.34
MAX_FACE_CENTER_Y = 0.68
OCCLUSION_KEY_LANDMARKS = (33, 263, 1, 13, 14, 152)

QualityStatus = Literal["passed", "failed"]

QUALITY_ERROR_MESSAGES = {
    "image_too_small": "图片分辨率过低，请使用原图重新拍摄。",
    "image_blurry": "照片较模糊，请稳定手机并重新拍摄。",
    "lighting_extreme": "光线过暗或过亮，请在均匀光线下重新拍摄。",
    "lighting_clipped": "照片存在大面积死黑或过曝，请调整光线后重拍。",
    "face_not_detected": "未检测到完整面部，请将脸放入参考框。",
    "multiple_faces": "画面中只能出现一张脸。",
    "face_cut_off": "面部被裁切，请确保额头、两颊和下巴都在画面内。",
    "face_too_small": "面部距离镜头太远，请靠近后重新拍摄。",
    "face_too_large": "面部距离镜头太近，请稍微向后移动。",
    "face_off_center": "面部没有居中，请移到参考框中央。",
    "head_tilted": "头部倾斜过大，请保持手机与头部水平。",
    "view_angle_mismatch": "拍摄角度不符合当前视角提示，请按参考姿势重拍。",
    "face_occluded": "面部关键区域可能被遮挡，请整理头发或移开遮挡物后重拍。",
}
QUALITY_WARNING_MESSAGES = {
    "dynamic_range_extreme": "画面明暗反差较大，建议使用更均匀的光线。",
}


class QualityModelUnavailable(RuntimeError):
    """Face Landmarker 模型资产缺失。"""


@dataclass(frozen=True)
class PhotoQualityResult:
    status: QualityStatus
    view_type: str | None
    errors: tuple[str, ...]
    warnings: tuple[str, ...]
    metrics: dict[str, Any]
    landmarks: tuple[tuple[float, float, float], ...] | None = None

    @property
    def passed(self) -> bool:
        return self.status == "passed"

    def to_meta(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "view_type": self.view_type,
            "errors": list(self.errors),
            "error_messages": [QUALITY_ERROR_MESSAGES[code] for code in self.errors],
            "warnings": list(self.warnings),
            "warning_messages": [
                QUALITY_WARNING_MESSAGES[code] for code in self.warnings
            ],
            "metrics": self.metrics,
            "model": "mediapipe_face_landmarker",
        }


_landmarker_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_landmarker(model_path: str):
    import mediapipe as mp

    if not Path(model_path).is_file():
        raise QualityModelUnavailable(
            f"face landmarker model not found: {model_path}"
        )
    options = mp.tasks.vision.FaceLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
        running_mode=mp.tasks.vision.RunningMode.IMAGE,
        num_faces=2,
        min_face_detection_confidence=0.35,
        min_face_presence_confidence=0.35,
    )
    return mp.tasks.vision.FaceLandmarker.create_from_options(options)


def close_quality_model() -> None:
    """关闭已缓存的本地模型，供应用退出时释放资源。"""
    if _get_landmarker.cache_info().currsize == 0:
        return
    with _landmarker_lock:
        landmarker = _get_landmarker(str(QUALITY_MODEL_PATH))
        landmarker.close()
        _get_landmarker.cache_clear()


def _load_rgb(raw_bytes: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(raw_bytes)) as image:
        image.load()
        oriented = ImageOps.exif_transpose(image).convert("RGB")
        return np.asarray(oriented)


def _image_metrics(rgb: np.ndarray) -> dict[str, float | int]:
    height, width = rgb.shape[:2]
    scale = min(1.0, 960.0 / max(height, width))
    sample = (
        cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if scale < 1.0
        else rgb
    )
    gray = cv2.cvtColor(sample, cv2.COLOR_RGB2GRAY)
    p05, p95 = np.percentile(gray, [5, 95])
    return {
        "width": width,
        "height": height,
        "min_edge": min(width, height),
        "mean_luma": round(float(gray.mean()), 2),
        "p05_luma": round(float(p05), 2),
        "p95_luma": round(float(p95), 2),
        "dark_fraction": round(float((gray < 30).mean()), 4),
        "bright_fraction": round(float((gray > 245).mean()), 4),
        "laplacian_variance": round(
            float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2
        ),
    }


def _face_box(face_landmarks: Any) -> dict[str, float]:
    xs = [float(point.x) for point in face_landmarks]
    ys = [float(point.y) for point in face_landmarks]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    return {
        "left": round(left, 4),
        "top": round(top, 4),
        "right": round(right, 4),
        "bottom": round(bottom, 4),
        "width": round(right - left, 4),
        "height": round(bottom - top, 4),
        "center_x": round((left + right) / 2.0, 4),
        "center_y": round((top + bottom) / 2.0, 4),
    }


def _pose_metrics(face_landmarks: Any) -> dict[str, float]:
    def xy(index: int) -> np.ndarray:
        point = face_landmarks[index]
        return np.array([float(point.x), float(point.y)])

    nose = xy(1)
    left_eye = (xy(33) + xy(133)) / 2.0
    right_eye = (xy(362) + xy(263)) / 2.0
    eye_mid = (left_eye + right_eye) / 2.0
    eye_distance = float(np.linalg.norm(left_eye - right_eye))
    if eye_distance <= 1e-6:
        return {"yaw_proxy": 0.0, "roll_degrees": 99.0}
    yaw_proxy = float((nose[0] - eye_mid[0]) / eye_distance)
    roll = degrees(atan2(
        float(right_eye[1] - left_eye[1]),
        float(right_eye[0] - left_eye[0]),
    ))
    return {
        "yaw_proxy": round(yaw_proxy, 4),
        "roll_degrees": round(roll, 2),
    }


def _view_error(view_type: str | None, yaw_proxy: float) -> str | None:
    if view_type is None:
        return None
    if view_type == "front" and abs(yaw_proxy) > FRONT_MAX_YAW_PROXY:
        return "view_angle_mismatch"
    if view_type == "left" and yaw_proxy > -SIDE_MIN_YAW_PROXY:
        return "view_angle_mismatch"
    if view_type == "right" and yaw_proxy < SIDE_MIN_YAW_PROXY:
        return "view_angle_mismatch"
    return None


def _landmark_confidence(point: Any) -> float | None:
    values = [
        float(value)
        for value in (
            getattr(point, "visibility", None),
            getattr(point, "presence", None),
        )
        if value is not None
    ]
    return min(values) if values else None


def key_regions_are_occluded(face: Sequence[Any]) -> bool:
    """仅在模型确实提供置信度时保守报告关键区域遮挡。"""
    all_confidences = [
        confidence
        for point in face
        if (confidence := _landmark_confidence(point)) is not None
    ]
    if not all_confidences or max(all_confidences) < 0.5:
        return False
    key_confidences = [
        confidence
        for index in OCCLUSION_KEY_LANDMARKS
        if index < len(face)
        and (confidence := _landmark_confidence(face[index])) is not None
    ]
    return len(key_confidences) >= 4 and sum(
        confidence < 0.35 for confidence in key_confidences
    ) >= 3


def assess_photo_quality(
    raw_bytes: bytes,
    *,
    view_type: str | None,
) -> PhotoQualityResult:
    """检查一张照片是否达到标准打卡的最低质量要求。"""
    import mediapipe as mp

    rgb = _load_rgb(raw_bytes)
    metrics = _image_metrics(rgb)
    errors: list[str] = []
    warnings: list[str] = []
    landmarks: tuple[tuple[float, float, float], ...] | None = None

    if metrics["min_edge"] < MIN_IMAGE_EDGE_PX:
        errors.append("image_too_small")
    if metrics["laplacian_variance"] < MIN_LAPLACIAN_VARIANCE:
        errors.append("image_blurry")
    if metrics["mean_luma"] < 45 or metrics["mean_luma"] > 220:
        errors.append("lighting_extreme")
    if metrics["dark_fraction"] > 0.35 or metrics["bright_fraction"] > 0.35:
        errors.append("lighting_clipped")

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    with _landmarker_lock:
        landmarker = _get_landmarker(str(QUALITY_MODEL_PATH))
        result = landmarker.detect(mp_image)
    face_count = len(result.face_landmarks)
    metrics["face_count"] = face_count
    if face_count == 0:
        errors.append("face_not_detected")
    elif face_count > 1:
        errors.append("multiple_faces")
    else:
        face = result.face_landmarks[0]
        landmarks = tuple(
            (float(point.x), float(point.y), float(point.z)) for point in face
        )
        face_box = _face_box(face)
        pose = _pose_metrics(face)
        metrics["face_box"] = face_box
        metrics.update(pose)
        if (
            face_box["left"] < MIN_FACE_MARGIN
            or face_box["top"] < MIN_FACE_MARGIN
            or face_box["right"] > 1.0 - MIN_FACE_MARGIN
            or face_box["bottom"] > 1.0 - MIN_FACE_MARGIN
        ):
            errors.append("face_cut_off")
        if face_box["width"] < MIN_FACE_WIDTH_RATIO:
            errors.append("face_too_small")
        if face_box["height"] < MIN_FACE_HEIGHT_RATIO:
            errors.append("face_too_small")
        if (
            face_box["width"] > MAX_FACE_WIDTH_RATIO
            or face_box["height"] > MAX_FACE_HEIGHT_RATIO
        ):
            errors.append("face_too_large")
        if (
            abs(face_box["center_x"] - 0.5) > MAX_FACE_CENTER_X_OFFSET
            or face_box["center_y"] < MIN_FACE_CENTER_Y
            or face_box["center_y"] > MAX_FACE_CENTER_Y
        ):
            errors.append("face_off_center")
        if abs(pose["roll_degrees"]) > MAX_ROLL_DEGREES:
            errors.append("head_tilted")
        view_error = _view_error(view_type, pose["yaw_proxy"])
        if view_error:
            errors.append(view_error)
        if key_regions_are_occluded(face):
            errors.append("face_occluded")

    if metrics["p05_luma"] < 10 or metrics["p95_luma"] > 250:
        warnings.append("dynamic_range_extreme")

    return PhotoQualityResult(
        status="failed" if errors else "passed",
        view_type=view_type,
        errors=tuple(dict.fromkeys(errors)),
        warnings=tuple(dict.fromkeys(warnings)),
        metrics=metrics,
        landmarks=landmarks,
    )
