from __future__ import annotations

from sqlalchemy import CheckConstraint, Index

from app.models.observation import ObservationRecord, ObservationTarget


def _index(table: object, name: str) -> Index:
    return next(index for index in table.indexes if index.name == name)  # type: ignore[attr-defined]


def test_observation_record_requires_idempotency_identity_and_unique_photo() -> None:
    table = ObservationRecord.__table__

    assert table.c.client_request_id.nullable is False
    assert table.c.photo_id.unique is True
    index = _index(table, "uq_observation_records_user_client_request_id")
    assert index.unique is True
    assert [column.name for column in index.columns] == ["user_id", "client_request_id"]


def test_observation_target_requires_scope_and_has_named_scope_indexes() -> None:
    table = ObservationTarget.__table__

    assert table.c.scope_type.nullable is False
    full_face = _index(table, "uq_observation_targets_record_full_face")
    region = _index(table, "uq_observation_targets_record_region")
    assert full_face.unique is True
    assert region.unique is True
    assert [column.name for column in full_face.columns] == ["record_id"]
    assert [column.name for column in region.columns] == ["record_id", "region_id"]

    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "ck_observation_targets_scope_region" in checks
    assert "full_face" in checks["ck_observation_targets_scope_region"]
    assert "region_id IS NULL" in checks["ck_observation_targets_scope_region"]


def test_region_observation_columns_preserve_device_date_and_target_note() -> None:
    record_table = ObservationRecord.__table__
    target_table = ObservationTarget.__table__

    assert record_table.c.recorded_timezone_offset_minutes.nullable is True
    assert record_table.c.recorded_local_date.nullable is True
    assert target_table.c.user_note.nullable is True

    record_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in record_table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    target_checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in target_table.constraints
        if isinstance(constraint, CheckConstraint)
    }
    assert "ck_observation_records_timezone_offset" in record_checks
    assert "-840" in record_checks["ck_observation_records_timezone_offset"]
    assert "840" in record_checks["ck_observation_records_timezone_offset"]
    assert "ck_observation_targets_region_id" in target_checks
    for region_id in (
        "forehead",
        "left_face",
        "right_face",
        "nose_area",
        "mouth_area",
        "chin",
    ):
        assert region_id in target_checks["ck_observation_targets_region_id"]
