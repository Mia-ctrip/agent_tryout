from __future__ import annotations

from app.services.vision.quality import _view_error


def test_view_angle_rules_accept_expected_views() -> None:
    assert _view_error("front", 0.02) is None
    assert _view_error("left", -0.62) is None
    assert _view_error("right", 0.75) is None


def test_view_angle_rules_reject_wrong_views() -> None:
    assert _view_error("front", 0.75) == "view_angle_mismatch"
    assert _view_error("left", 0.02) == "view_angle_mismatch"
    assert _view_error("right", -0.62) == "view_angle_mismatch"