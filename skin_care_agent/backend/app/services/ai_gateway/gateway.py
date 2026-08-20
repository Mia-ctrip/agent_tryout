from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field

from app.services.ai_gateway.errors import (
    AllProvidersFailedError,
    DeadProviderError,
    FatalRequestError,
    RetryableError,
)
from app.services.ai_gateway.observability import ProviderCallRecord, trace_log
from app.services.ai_gateway.providers.base import Provider
from app.services.ai_gateway.routes import ModelBinding, ModelRoute
from app.services.ai_gateway.types import UnifiedRequest, UnifiedResponse


@dataclass
class _NodeHealth:
    fail_streak: int = 0
    dead_until_ts: float = 0.0  # monotonic seconds


@dataclass
class HealthTracker:
    """In-memory per-binding failure tracker. MVP only; multi-instance → move to Redis."""

    fail_threshold: int = 5
    cool_down_s: float = 60.0
    dead_provider_cool_down_s: float = 3600.0  # 1h for auth/quota
    _states: dict[tuple[str, str], _NodeHealth] = field(default_factory=dict)

    def _key(self, b: ModelBinding) -> tuple[str, str]:
        return (b.provider, b.model)

    def is_open(self, b: ModelBinding) -> bool:
        st = self._states.get(self._key(b))
        if not st:
            return True
        return time.monotonic() >= st.dead_until_ts

    def record_ok(self, b: ModelBinding) -> None:
        self._states[self._key(b)] = _NodeHealth()

    def record_fail(self, b: ModelBinding) -> None:
        st = self._states.setdefault(self._key(b), _NodeHealth())
        st.fail_streak += 1
        if st.fail_streak >= self.fail_threshold:
            st.dead_until_ts = time.monotonic() + self.cool_down_s

    def kill(self, b: ModelBinding, ttl_s: float | None = None) -> None:
        st = self._states.setdefault(self._key(b), _NodeHealth())
        st.dead_until_ts = time.monotonic() + (ttl_s or self.dead_provider_cool_down_s)


@dataclass
class GatewayInvokeResult:
    """gateway.invoke 的完整返回：包含最终 response 和所有尝试的详细记录。

    调用方（analysis_service）用 records 落库到 ai_call_logs，一次一条。
    """

    response: UnifiedResponse | None
    records: list[ProviderCallRecord]

    @property
    def ok(self) -> bool:
        return self.response is not None


class AIGateway:
    def __init__(
        self,
        providers: dict[str, Provider],
        routes: dict[str, ModelRoute],
        health: HealthTracker | None = None,
    ):
        self._providers = providers
        self._routes = routes
        self._health = health or HealthTracker()

    def has_task(self, task: str) -> bool:
        return task in self._routes

    def get_route(self, task: str) -> ModelRoute | None:
        return self._routes.get(task)

    async def invoke(self, task: str, req: UnifiedRequest) -> UnifiedResponse:
        """Backwards-compatible: 返回最终 response 或抛 AllProvidersFailedError。

        新代码建议用 invoke_detailed 以拿到全量 attempts。
        """
        result = await self.invoke_detailed(task, req)
        if result.response is None:
            raise AllProvidersFailedError(
                task=task,
                attempts=[r.__dict__ for r in result.records],
            )
        return result.response

    async def invoke_detailed(
        self,
        task: str,
        req: UnifiedRequest,
        *,
        trace_id: str | None = None,
        start_attempt_seq: int = 1,
        skip_bindings: set[tuple[str, str]] | None = None,
    ) -> GatewayInvokeResult:
        """完整版：返回 GatewayInvokeResult，含每次 provider 调用的 ProviderCallRecord。

        参数：
        - trace_id：外部传入的业务 trace，写进每条 record；不传则调用方拿不到
        - start_attempt_seq：service 层做 parse fallback 时二次调用起始序号
        - skip_bindings：{(provider, model)} 跳过（parse fallback 用于绕开上次已试过的家）
        """
        route = self._routes.get(task)
        if not route:
            raise FatalRequestError(f"unknown task: {task}")

        records: list[ProviderCallRecord] = []
        seq = start_attempt_seq
        skip = skip_bindings or set()
        trace = trace_id or "-"

        for binding in route.chain:
            key = (binding.provider, binding.model)
            provider = self._providers.get(binding.provider)

            if provider is None:
                records.append(self._skip_record(trace, seq, binding, "provider not registered"))
                seq += 1
                continue
            if key in skip:
                records.append(self._skip_record(trace, seq, binding, "explicitly skipped"))
                seq += 1
                continue
            if route.requires and not route.requires.issubset(provider.capabilities):
                records.append(self._skip_record(trace, seq, binding, "capability mismatch"))
                seq += 1
                continue
            if not self._health.is_open(binding):
                records.append(self._skip_record(trace, seq, binding, "circuit open"))
                seq += 1
                continue

            trace_log.info(
                "gateway.provider.request",
                seq=seq,
                provider=binding.provider,
                model=binding.model,
                task=task,
            )
            t_start = time.monotonic()
            try:
                resp = await self._call_with_retry(provider, binding, req, route)
            except DeadProviderError as e:
                latency = int((time.monotonic() - t_start) * 1000)
                self._health.kill(binding)
                trace_log.warning(
                    "gateway.provider.dead",
                    seq=seq,
                    provider=binding.provider,
                    latency_ms=latency,
                    error=str(e),
                )
                records.append(
                    ProviderCallRecord(
                        trace_id=trace,
                        attempt_seq=seq,
                        provider=binding.provider,
                        model=binding.model,
                        status="dead",
                        latency_ms=latency,
                        error_message=str(e)[:2000],
                    )
                )
                seq += 1
                continue
            except RetryableError as e:
                latency = int((time.monotonic() - t_start) * 1000)
                self._health.record_fail(binding)
                trace_log.warning(
                    "gateway.provider.retryable_exhausted",
                    seq=seq,
                    provider=binding.provider,
                    latency_ms=latency,
                    error=str(e),
                )
                records.append(
                    ProviderCallRecord(
                        trace_id=trace,
                        attempt_seq=seq,
                        provider=binding.provider,
                        model=binding.model,
                        status="retryable_exhausted",
                        latency_ms=latency,
                        error_message=str(e)[:2000],
                    )
                )
                seq += 1
                continue
            except FatalRequestError:
                raise

            self._health.record_ok(binding)
            trace_log.info(
                "gateway.provider.ok",
                seq=seq,
                provider=binding.provider,
                model=binding.model,
                latency_ms=resp.latency_ms,
                tokens_in=resp.usage.input_tokens,
                tokens_out=resp.usage.output_tokens,
                text_preview=resp.text[:100],
            )
            records.append(
                ProviderCallRecord(
                    trace_id=trace,
                    attempt_seq=seq,
                    provider=binding.provider,
                    model=binding.model,
                    status="ok",
                    latency_ms=resp.latency_ms,
                    input_tokens=resp.usage.input_tokens,
                    output_tokens=resp.usage.output_tokens,
                    response_text=resp.text,
                    raw_response=resp.raw,
                )
            )
            return GatewayInvokeResult(response=resp, records=records)

        trace_log.warning("gateway.all_failed", task=task, attempts=len(records))
        return GatewayInvokeResult(response=None, records=records)

    @staticmethod
    def _skip_record(
        trace: str, seq: int, binding: ModelBinding, reason: str
    ) -> ProviderCallRecord:
        return ProviderCallRecord(
            trace_id=trace,
            attempt_seq=seq,
            provider=binding.provider,
            model=binding.model,
            status="skipped",
            skip_reason=reason,
        )

    async def _call_with_retry(
        self,
        provider: Provider,
        binding: ModelBinding,
        req: UnifiedRequest,
        route: ModelRoute,
    ) -> UnifiedResponse:
        last_exc: Exception | None = None
        for attempt in range(route.max_retries_per_node + 1):
            try:
                return await provider.invoke(binding.model, req, route.timeout_s)
            except RetryableError as e:
                last_exc = e
                if attempt < route.max_retries_per_node:
                    backoff = (0.4 * (2**attempt)) + random.random() * 0.2
                    await asyncio.sleep(backoff)
                continue
        assert last_exc is not None
        raise last_exc
