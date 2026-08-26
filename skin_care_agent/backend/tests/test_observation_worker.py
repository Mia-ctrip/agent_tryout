from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any

import pytest
from PIL import Image

from app.models.ai_call_log import AICallLog
from app.models.observation import ObservationRecord, ObservationTarget
from app.models.photo import Photo
from app.services.ai_gateway.gateway import AIGateway, GatewayInvokeResult
from app.services.ai_gateway.observability import ProviderCallRecord
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.providers.mock import MockProvider
from app.services.ai_gateway.routes import ModelBinding, ModelRoute
from app.services.ai_gateway.types import Capability, UnifiedRequest, UnifiedResponse
from app.services.full_face_analysis_service import (
    FullFaceAnalysisOutcome,
    analyze_full_face_photo,
)
from app.services.full_face_prompt import FULL_FACE_OBSERVATION_MOCK
from app.services.observation_worker import run_observation_target
from app.services import observation_worker
from app.services.region_analysis_service import analyze_region_photo
from app.services.region_observation_prompt import region_mock_facts


def _jpeg_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (8, 8), color=(128, 128, 128)).save(output, format="JPEG")
    return output.getvalue()


class _Storage:
    def get(self, key: str) -> bytes:
        assert key == "observations/7/original.jpg"
        return _jpeg_bytes()


class _Gateway:
    def __init__(self, results: list[GatewayInvokeResult]) -> None:
        self.results = results
        self.requests: list[UnifiedRequest] = []

    async def invoke_detailed(self, _task: str, request: UnifiedRequest, **_kwargs: Any):
        self.requests.append(request)
        return self.results.pop(0)


class _AnalysisDB:
    def __init__(self) -> None:
        self.added: list[Any] = []
        self.commit_count = 0

    def add(self, row: Any) -> None:
        self.added.append(row)

    def commit(self) -> None:
        self.commit_count += 1

    def refresh(self, row: Any) -> None:
        if row.id is None:
            row.id = len(self.added)


def _photo_and_target() -> tuple[Photo, ObservationRecord, ObservationTarget]:
    photo = Photo(
        user_id=7,
        storage_key="observations/7/original.jpg",
        mime_type="image/jpeg",
        size_bytes=10,
    )
    photo.id = 31
    record = ObservationRecord(
        user_id=7,
        client_request_id="11111111-1111-4111-8111-111111111111",
        recorded_at=datetime(2026, 8, 21, tzinfo=timezone.utc),
        photo_id=31,
        status="saved",
    )
    record.id = 41
    target = ObservationTarget(
        record_id=41,
        user_id=7,
        scope_type="full_face",
        status="queued",
    )
    target.id = 51
    return photo, record, target


def _region_photo_and_target(
    region_id: str = "left_face",
) -> tuple[Photo, ObservationRecord, ObservationTarget]:
    photo, record, target = _photo_and_target()
    target.scope_type = "region"
    target.region_id = region_id
    return photo, record, target


@pytest.mark.asyncio
async def test_region_analysis_uses_stable_region_prompt_and_log_boundary(monkeypatch) -> None:
    photo, record, target = _region_photo_and_target()
    fixture = region_mock_facts("left_face")
    response = UnifiedResponse(
        text=json.dumps(fixture, ensure_ascii=False),
        provider="mock",
        model="mock-v1",
    )
    gateway = _Gateway(
        [
            GatewayInvokeResult(
                response=response,
                records=[
                    ProviderCallRecord(
                        trace_id="trace",
                        attempt_seq=1,
                        provider="mock",
                        model="mock-v1",
                        status="ok",
                        response_text=response.text,
                    )
                ],
            )
        ]
    )
    db = _AnalysisDB()
    monkeypatch.setattr("app.services.region_analysis_service.get_storage", lambda: _Storage())
    monkeypatch.setattr("app.services.region_analysis_service.get_gateway", lambda: gateway)

    outcome = await analyze_region_photo(db, target=target, record=record, photo=photo)

    assert outcome.success is True
    assert outcome.prompt_version == "region-observation-1.0.0"
    assert "region_id: left_face" in gateway.requests[0].messages[0].content
    log = next(row for row in db.added if isinstance(row, AICallLog))
    assert log.kind == "region_observation"
    assert log.input_meta["region_id"] == "left_face"


@pytest.mark.asyncio
async def test_mock_provider_returns_requested_json_fixture() -> None:
    provider = MockProvider(latency_ms=0)
    request = UnifiedRequest(messages=[], response_format="json", extra={"mock_json": {"ok": True}})

    response = await provider.invoke("mock-v1", request, timeout_s=1)

    assert json.loads(response.text) == {"ok": True}


@pytest.mark.asyncio
async def test_full_face_analysis_validates_result_and_persists_sanitized_attempt(monkeypatch) -> None:
    photo, record, target = _photo_and_target()
    response = UnifiedResponse(
        text=json.dumps(FULL_FACE_OBSERVATION_MOCK, ensure_ascii=False),
        provider="mock",
        model="mock-v1",
        latency_ms=12,
    )
    gateway = _Gateway(
        [
            GatewayInvokeResult(
                response=response,
                records=[
                    ProviderCallRecord(
                        trace_id="trace",
                        attempt_seq=1,
                        provider="mock",
                        model="mock-v1",
                        status="ok",
                        latency_ms=12,
                        response_text=response.text,
                    )
                ],
            )
        ]
    )
    db = _AnalysisDB()
    monkeypatch.setattr("app.services.full_face_analysis_service.get_storage", lambda: _Storage())
    monkeypatch.setattr("app.services.full_face_analysis_service.get_gateway", lambda: gateway)

    outcome = await analyze_full_face_photo(db, target=target, record=record, photo=photo)

    assert outcome.success is True
    assert outcome.facts is not None
    assert outcome.facts["summary"] == FULL_FACE_OBSERVATION_MOCK["summary"]
    assert gateway.requests[0].max_tokens == 1024
    log = next(row for row in db.added if isinstance(row, AICallLog))
    assert log.kind == "full_face_observation"
    assert log.status == "success"
    assert log.input_meta["target_id"] == 51
    logged_request = json.dumps(log.request_payload)
    assert "b64 chars" in logged_request
    assert "/9j/" not in logged_request


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response_text", "expected_code"),
    [
        ("not json", "invalid_json"),
        (json.dumps({"summary": "字段不足"}), "invalid_schema"),
        (json.dumps({**FULL_FACE_OBSERVATION_MOCK, "summary": "建议使用某产品"}, ensure_ascii=False), "unsafe_output"),
    ],
)
async def test_full_face_analysis_returns_specific_final_validation_code(
    monkeypatch, response_text: str, expected_code: str
) -> None:
    photo, record, target = _photo_and_target()
    response = UnifiedResponse(text=response_text, provider="mock", model="mock-v1")
    gateway = _Gateway(
        [
            GatewayInvokeResult(
                response=response,
                records=[
                    ProviderCallRecord(
                        trace_id="trace",
                        attempt_seq=1,
                        provider="mock",
                        model="mock-v1",
                        status="ok",
                        response_text=response_text,
                    )
                ],
            ),
            GatewayInvokeResult(response=None, records=[]),
        ]
    )
    db = _AnalysisDB()
    monkeypatch.setattr("app.services.full_face_analysis_service.get_storage", lambda: _Storage())
    monkeypatch.setattr("app.services.full_face_analysis_service.get_gateway", lambda: gateway)

    outcome = await analyze_full_face_photo(db, target=target, record=record, photo=photo)

    assert outcome.success is False
    assert outcome.failure_code == expected_code


class _SequenceProvider(Provider):
    name = "glm"
    capabilities = {Capability.TEXT, Capability.VISION, Capability.JSON_MODE}

    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.requests: list[UnifiedRequest] = []

    async def invoke(
        self, model: str, req: UnifiedRequest, timeout_s: float
    ) -> UnifiedResponse:
        self.requests.append(req)
        return UnifiedResponse(
            text=self.responses.pop(0),
            provider=self.name,
            model=model,
        )


@pytest.mark.asyncio
async def test_full_face_analysis_retries_same_provider_once_after_unsafe_output(
    monkeypatch,
) -> None:
    photo, record, target = _photo_and_target()
    unsafe = json.dumps(
        {**FULL_FACE_OBSERVATION_MOCK, "unknowns": ["无法判断是否有痤疮"]},
        ensure_ascii=False,
    )
    valid = json.dumps(FULL_FACE_OBSERVATION_MOCK, ensure_ascii=False)
    provider = _SequenceProvider([unsafe, valid])
    gateway = AIGateway(
        providers={"glm": provider},
        routes={
            "vision_analyze": ModelRoute(
                task="vision_analyze",
                chain=(ModelBinding("glm", "glm-4.6v"),),
                requires=frozenset(
                    {Capability.VISION, Capability.JSON_MODE}
                ),
                max_retries_per_node=0,
            )
        },
    )
    db = _AnalysisDB()
    monkeypatch.setattr("app.services.full_face_analysis_service.get_storage", lambda: _Storage())
    monkeypatch.setattr("app.services.full_face_analysis_service.get_gateway", lambda: gateway)

    outcome = await analyze_full_face_photo(db, target=target, record=record, photo=photo)

    assert outcome.success is True
    assert len(provider.requests) == 2
    assert provider.requests[1].messages[-1].content.startswith("上一个结果未通过展示安全校验")
    statuses = [row.status for row in db.added if isinstance(row, AICallLog)]
    assert statuses == ["unsafe_output", "success"]


@pytest.mark.asyncio
async def test_full_face_analysis_sanitizes_second_unsafe_response_instead_of_returning_empty(
    monkeypatch,
) -> None:
    photo, record, target = _photo_and_target()
    first = json.dumps(
        {**FULL_FACE_OBSERVATION_MOCK, "daily_appearance": ["可见红色丘疹"]},
        ensure_ascii=False,
    )
    second = json.dumps(
        {
            **FULL_FACE_OBSERVATION_MOCK,
            "daily_appearance": ["红色丘疹", "表面有颗粒感"],
            "summary": "两颊可见红色丘疹和颗粒感。",
        },
        ensure_ascii=False,
    )
    provider = _SequenceProvider([first, second])
    gateway = AIGateway(
        providers={"glm": provider},
        routes={
            "vision_analyze": ModelRoute(
                task="vision_analyze",
                chain=(ModelBinding("glm", "glm-4.6v"),),
                requires=frozenset({Capability.VISION, Capability.JSON_MODE}),
                max_retries_per_node=0,
            )
        },
    )
    db = _AnalysisDB()
    monkeypatch.setattr("app.services.full_face_analysis_service.get_storage", lambda: _Storage())
    monkeypatch.setattr("app.services.full_face_analysis_service.get_gateway", lambda: gateway)

    outcome = await analyze_full_face_photo(db, target=target, record=record, photo=photo)

    assert outcome.success is True
    assert outcome.facts is not None
    assert outcome.facts["daily_appearance"] == ["红色小范围凸起", "表面有颗粒感"]
    assert "丘疹" not in json.dumps(outcome.facts, ensure_ascii=False)
    logs = [row for row in db.added if isinstance(row, AICallLog)]
    assert [row.status for row in logs] == ["unsafe_output", "success"]
    assert logs[1].validation_warnings == {
        "sanitized": True,
        "warnings": [
            {
                "field": "daily_appearance",
                "action": "rewrite_medical_term",
                "term": "丘疹",
            },
            {
                "field": "summary",
                "action": "rebuild_from_sanitized_facts",
                "term": "丘疹",
            },
        ],
    }


class _ClaimResult:
    def __init__(self, value: int | None) -> None:
        self.value = value

    def scalar_one_or_none(self) -> int | None:
        return self.value


class _WorkerSession:
    def __init__(self, photo: Photo, record: ObservationRecord, target: ObservationTarget) -> None:
        self.photo, self.record, self.target = photo, record, target
        self.commit_count = 0

    def __enter__(self) -> "_WorkerSession":
        return self

    def __exit__(self, *_args: Any) -> None:
        pass

    def execute(self, _statement: Any) -> _ClaimResult:
        if self.target.status != "queued":
            return _ClaimResult(None)
        self.target.status = "processing"
        self.target.processing_started_at = datetime.now(tz=timezone.utc)
        return _ClaimResult(self.target.id)

    def get(self, model: Any, row_id: int) -> Any:
        for row in (self.target, self.record, self.photo):
            if isinstance(row, model) and row.id == row_id:
                return row
        return None

    def commit(self) -> None:
        self.commit_count += 1

    def rollback(self) -> None:
        pass


@pytest.mark.asyncio
async def test_worker_claims_queued_target_and_completes_success() -> None:
    photo, record, target = _photo_and_target()
    session = _WorkerSession(photo, record, target)

    async def analyze(**_kwargs: Any) -> FullFaceAnalysisOutcome:
        assert target.status == "processing"
        return FullFaceAnalysisOutcome(
            success=True,
            trace_id="trace-1",
            facts=dict(FULL_FACE_OBSERVATION_MOCK),
            provider="mock",
            model="mock-v1",
        )

    processed = await run_observation_target(target.id, lambda: session, analyze)

    assert processed is True
    assert target.status == "completed"
    assert target.result_source == "photo_analysis"
    assert target.failure_code is None
    assert session.commit_count == 2


@pytest.mark.asyncio
async def test_worker_marks_final_failure_needs_input_without_touching_raw_record() -> None:
    photo, record, target = _photo_and_target()
    session = _WorkerSession(photo, record, target)
    original_note = record.user_note

    async def analyze(**_kwargs: Any) -> FullFaceAnalysisOutcome:
        return FullFaceAnalysisOutcome(success=False, trace_id="trace-2", failure_code="invalid_json")

    processed = await run_observation_target(target.id, lambda: session, analyze)

    assert processed is True
    assert target.status == "needs_input"
    assert target.failure_code == "invalid_json"
    assert record.user_note == original_note


@pytest.mark.asyncio
async def test_worker_does_not_analyze_non_queued_target() -> None:
    photo, record, target = _photo_and_target()
    target.status = "completed"
    session = _WorkerSession(photo, record, target)
    calls = 0

    async def analyze(**_kwargs: Any) -> FullFaceAnalysisOutcome:
        nonlocal calls
        calls += 1
        return FullFaceAnalysisOutcome(success=False, failure_code="all_providers_failed")

    processed = await run_observation_target(target.id, lambda: session, analyze)

    assert processed is False
    assert calls == 0


@pytest.mark.asyncio
async def test_worker_dispatches_region_target_and_persists_region_versions(monkeypatch) -> None:
    photo, record, target = _region_photo_and_target("chin")
    session = _WorkerSession(photo, record, target)
    calls: list[str] = []

    async def analyze_region(**_kwargs: Any):
        calls.append("region")
        return observation_worker.ObservationAnalysisOutcome(
            success=True,
            prompt_version="region-observation-1.0.0",
            schema_version="region-observation-1.0.0",
            facts=region_mock_facts("chin"),
            provider="mock",
            model="mock-v1",
        )

    async def reject_full_face(**_kwargs: Any):
        raise AssertionError("region target used full-face analyzer")

    monkeypatch.setattr(observation_worker, "analyze_region_photo", analyze_region)
    monkeypatch.setattr(observation_worker, "analyze_full_face_photo", reject_full_face)

    processed = await run_observation_target(target.id, lambda: session)

    assert processed is True
    assert calls == ["region"]
    assert target.prompt_version == "region-observation-1.0.0"
    assert target.schema_version == "region-observation-1.0.0"
