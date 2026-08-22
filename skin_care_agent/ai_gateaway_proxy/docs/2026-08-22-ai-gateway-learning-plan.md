# AI Gateway Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不接入正式 Backend、无需真实付费调用的前提下，由用户亲自实现一个支持两类协议、Provider 注册、能力路由、结构化输出、重试/fallback、熔断和 FastAPI Demo 的可测试 AI Gateway。

**Architecture:** 在 `src/ai_gateway_lab/` 建立独立 Python package。Factory 根据配置创建 Provider 并写入 Registry，Router 根据任务与能力返回有序 Binding，Gateway 执行 Provider 调用、解析回调、重试和 fallback；FastAPI 只作为最外层 Demo。现有根目录草稿保留作为学习快照，不被新 package 导入。

**Tech Stack:** Python 3.12、Pydantic 2、pydantic-settings、httpx、FastAPI、pytest、pytest-asyncio、Ruff。

**Spec:** `ai_gateaway_proxy/docs/2026-08-22-ai-gateway-learning-spec.md`

## Global Constraints

- 所有新增代码、测试、指南和配置均位于 `ai_gateaway_proxy/`。
- 不修改、不导入 `backend/app`，正式 Backend 不依赖本学习目录。
- 用户亲自编写实现；Agent 每个任务只解释、审查和给下一步，不提前替用户完成后续任务。
- 先用 `httpx.MockTransport` 验证，不真实调用供应商；真实调用另获用户确认。
- API Key 只能来自环境变量，禁止写入 Python、测试、日志和 Git。
- `max_attempts=3` 表示单节点总调用次数最多为三次。
- OpenAI-compatible 完整链路通过后才实现 Anthropic-compatible。
- FastAPI 是入站 Demo；模型出站 HTTP 使用 `httpx.AsyncClient`。
- 不实现正式 Skin Care 业务契约，只使用 Spec 第 3 节的 Demo Schema。
- 未获用户明确授权时不执行 `git add`、`git commit` 或 `git push`。

---

## File Map

| Path | Responsibility |
|---|---|
| `pyproject.toml` | 独立依赖、pytest 和 Ruff 配置 |
| `.env.example` | 不含密钥的配置示例 |
| `src/ai_gateway_lab/contracts.py` | 通用请求、响应、Task、Capability、Binding 和结果 |
| `src/ai_gateway_lab/errors.py` | 完整错误分类 |
| `src/ai_gateway_lab/provider.py` | Provider `Protocol` 接口 |
| `src/ai_gateway_lab/providers/mock.py` | 可编排的纯内存 Provider |
| `src/ai_gateway_lab/providers/openai_compatible.py` | OpenAI-compatible HTTP Adapter |
| `src/ai_gateway_lab/providers/anthropic_compatible.py` | Anthropic-compatible HTTP Adapter |
| `src/ai_gateway_lab/config.py` | Provider/Route 设置和环境变量读取 |
| `src/ai_gateway_lab/registry.py` | Provider 注册与查找 |
| `src/ai_gateway_lab/factory.py` | 配置到 Provider/Registry 的装配 |
| `src/ai_gateway_lab/router.py` | Task 到有序 ModelBinding 的解析 |
| `src/ai_gateway_lab/retry.py` | 重试策略、退避和抖动 |
| `src/ai_gateway_lab/circuit_breaker.py` | 单节点熔断状态 |
| `src/ai_gateway_lab/gateway.py` | 重试、fallback、解析和尝试记录 |
| `src/ai_gateway_lab/demo.py` | 示例 Vision Schema、Parser 和 Service |
| `src/ai_gateway_lab/api.py` | FastAPI Demo 与生命周期 |
| `tests/` | 每个组件的独立测试和端到端测试 |

现有 `ai_gateaway.py`、`factory.py`、`main.py`、`open_ai_api_protocol.py`、`anthropic_api_protocol.py` 保留，不被新 package 导入；完成全部任务后再由用户决定是否删除。

---

### Task 0: Repair the Python Learning Environment and Package Boundary

**Files:**
- Create: `ai_gateaway_proxy/pyproject.toml`
- Create: `ai_gateaway_proxy/.env.example`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/__init__.py`
- Create: `ai_gateaway_proxy/tests/test_package.py`

**Interfaces:**
- Produces: 可通过 `import ai_gateway_lab` 导入的独立 package。

- [ ] **Step 1: 安装或修复 Python 3.12**

当前机器没有可执行的 `python`/`py`，旧 Backend venv 指向已不存在的 Python。先安装 Python 3.12，并验证：

```powershell
python --version
```

Expected: `Python 3.12.x`。

- [ ] **Step 2: 创建本目录专用虚拟环境**

```powershell
cd D:\Mia\agent_tryout\skin_care_agent\ai_gateaway_proxy
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

- [ ] **Step 3: 写 package 配置**

`pyproject.toml` 至少包含：

```toml
[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[project]
name = "ai-gateway-lab"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115,<1",
  "httpx>=0.28,<1",
  "pydantic>=2.10,<3",
  "pydantic-settings>=2.7,<3",
  "uvicorn>=0.34,<1",
]

[project.optional-dependencies]
dev = ["pytest>=8.3,<9", "pytest-asyncio>=0.25,<1", "ruff>=0.11,<1"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] **Step 4: 安装 editable package**

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

- [ ] **Step 5: 写并运行 import 测试**

```python
def test_package_imports() -> None:
    import ai_gateway_lab

    assert ai_gateway_lab.__name__ == "ai_gateway_lab"
```

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_package.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

Expected: tests PASS，Ruff PASS。

- [ ] **Step 6: Checkpoint**

```powershell
git diff --check -- ai_gateaway_proxy
```

若用户另行授权提交：`chore: initialize isolated ai gateway lab`。

---

### Task 1: Unified Contracts and the Small Demo Schema

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/contracts.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/demo.py`
- Create: `ai_gateaway_proxy/tests/test_contracts.py`

**Interfaces:**
- Produces: `TaskType`, `Capability`, `WireProtocol`, `Message`, `UnifiedRequest`, `TokenUsage`, `UnifiedResponse`, `ProviderConfig`, `ModelBinding`, `ModelRoute`, `ProviderAttempt`, `GatewayResult[T]`, `DemoVisionResult`, `parse_demo_vision_result`。

- [ ] **Step 1: 写契约失败测试**

```python
import pytest
from pydantic import ValidationError

from ai_gateway_lab.contracts import Capability, Message, UnifiedRequest
from ai_gateway_lab.demo import DemoVisionResult


def test_vision_request_requires_an_image() -> None:
    request = UnifiedRequest(
        messages=[Message(role="user", content="describe")],
        image_urls=[],
        response_format="json",
    )
    assert request.image_urls == []


def test_demo_result_rejects_blank_observation() -> None:
    with pytest.raises(ValidationError):
        DemoVisionResult(summary="visible state", observations=[""])


def test_capability_is_explicit() -> None:
    assert Capability.VISION.value == "vision"
```

- [ ] **Step 2: 运行并观察缺少模块**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_contracts.py -q
```

Expected: FAIL with `ModuleNotFoundError` 或缺少类型。

- [ ] **Step 3: 实现不可变契约**

使用 Pydantic `BaseModel` 定义输入输出；使用 `Enum` 定义 Task、Capability 和 WireProtocol；使用 `dataclass(frozen=True)` 定义 Binding/Route/Attempt；使用 `TypeVar` 和 `Generic` 定义 `GatewayResult[T]`。关键签名固定为：

```python
class UnifiedRequest(BaseModel):
    messages: list[Message]
    image_urls: list[str] = []
    response_format: Literal["text", "json"] = "text"
    temperature: float | None = None
    max_tokens: int | None = None
    request_id: str | None = None
    extra: dict[str, object] = {}


class UnifiedResponse(BaseModel):
    text: str
    provider_id: str
    model: str
    usage: TokenUsage
    latency_ms: int
    raw: dict[str, object]


def parse_demo_vision_result(text: str) -> DemoVisionResult:
    return DemoVisionResult.model_validate_json(text)
```

使用 `Field(default_factory=list)` 和 `Field(default_factory=dict)`，不要直接复用可变默认对象。

- [ ] **Step 4: 运行契约测试和 Ruff**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_contracts.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 5: Checkpoint**

运行 `git diff --check -- ai_gateaway_proxy`；若获授权提交：`feat: define gateway contracts`。

---

### Task 2: Error Taxonomy, Provider Interface, and Mock Provider

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/errors.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/provider.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/providers/__init__.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/providers/mock.py`
- Create: `ai_gateaway_proxy/tests/test_mock_provider.py`

**Interfaces:**
- Produces: `GatewayError`, `RetryableProviderError`, `UnavailableProviderError`, `FatalRequestError`, `InvalidProviderResponseError`, `InvalidStructuredOutputError`, `Provider` Protocol, `MockProvider`。

- [ ] **Step 1: 写 Mock Provider 行为测试**

```python
import pytest

from ai_gateway_lab.contracts import UnifiedRequest
from ai_gateway_lab.errors import RetryableProviderError
from ai_gateway_lab.providers.mock import MockProvider


@pytest.mark.asyncio
async def test_mock_provider_returns_scripted_response() -> None:
    provider = MockProvider.success(provider_id="mock", text='{"summary":"ok","observations":["x"]}')
    response = await provider.invoke("mock-v1", UnifiedRequest(messages=[]), timeout_s=1.0)
    assert response.provider_id == "mock"


@pytest.mark.asyncio
async def test_mock_provider_raises_scripted_error() -> None:
    provider = MockProvider.fail(provider_id="mock", error=RetryableProviderError("busy"))
    with pytest.raises(RetryableProviderError):
        await provider.invoke("mock-v1", UnifiedRequest(messages=[]), timeout_s=1.0)
```

- [ ] **Step 2: 定义错误层次**

所有异常继承 `GatewayError`，只保存脱敏后的 `message` 和可选 `status_code`。禁止裸 `except:`。

- [ ] **Step 3: 定义 Java Interface 对应的 Python Protocol**

```python
class Provider(Protocol):
    provider_id: str
    capabilities: frozenset[Capability]

    async def invoke(
        self,
        model: str,
        request: UnifiedRequest,
        timeout_s: float,
    ) -> UnifiedResponse: ...
```

- [ ] **Step 4: 实现可编排 MockProvider**

Mock Provider 持有一个 response/error 队列，每次 `invoke()` 消费一项，并记录 `call_count`；这为后续三次重试和 fallback 提供确定性测试。

- [ ] **Step 5: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_mock_provider.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 6: Checkpoint**

运行 `git diff --check -- ai_gateaway_proxy`；若获授权提交：`feat: add provider contract and gateway errors`。

---

### Task 3: OpenAI-Compatible HTTP Adapter

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/providers/openai_compatible.py`
- Create: `ai_gateaway_proxy/tests/test_openai_compatible.py`

**Interfaces:**
- Consumes: `Provider`, `UnifiedRequest`, `UnifiedResponse` 和 Task 2 错误类型。
- Produces: `OpenAICompatibleProvider(provider_id, base_url, api_key, capabilities, client, default_extra_body)`。

- [ ] **Step 1: 用 MockTransport 写标准响应测试**

```python
import httpx
import pytest


@pytest.mark.asyncio
async def test_openai_adapter_encodes_and_parses_chat_completion() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        body = __import__("json").loads(request.content)
        assert request.url.path.endswith("/chat/completions")
        assert body["model"] == "vision-v1"
        assert body["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '{"summary":"ok","observations":["x"]}'}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            },
        )
```

- [ ] **Step 2: 写错误映射测试**

参数化断言：429/500/503 → `RetryableProviderError`；401/402/403 → `UnavailableProviderError`；400/422 → `FatalRequestError`；200 但缺少 `choices` → `InvalidProviderResponseError`。

- [ ] **Step 3: 实现请求编码**

统一生成：

```text
POST {base_url}/chat/completions
Authorization: Bearer <key>
Content-Type: application/json
model/messages/temperature/max_completion_tokens/response_format
```

图片消息编码为 OpenAI `content` parts：`text` + `image_url`。供应商扩展字段通过 `default_extra_body | request.extra` 合并；禁止为 Qwen、GLM、豆包分别复制完整方法。

- [ ] **Step 4: 实现响应解析和耗时**

从标准位置读取 content 和 usage；保留原始 JSON；使用 `time.monotonic()` 计算耗时；日志不得包含 Authorization 或图片 Base64。

- [ ] **Step 5: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_openai_compatible.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 6: Checkpoint**

若获授权提交：`feat: add openai compatible provider`；否则只运行 `git diff --check`。

---

### Task 4: Provider Configuration, Registry, and Factory

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/config.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/registry.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/factory.py`
- Create: `ai_gateaway_proxy/tests/test_factory.py`
- Modify: `ai_gateaway_proxy/.env.example`

**Interfaces:**
- Produces: `GatewaySettings`, `ProviderRegistry.register/get`, `build_registry(settings, client)`。

- [ ] **Step 1: 写 Factory 测试**

```python
def test_factory_builds_two_instances_of_one_protocol() -> None:
    settings = settings_with_qwen_and_glm_fake_keys()
    registry = build_registry(settings, client=fake_client())
    assert registry.get("qwen").provider_id == "qwen"
    assert registry.get("glm").provider_id == "glm"
    assert type(registry.get("qwen")) is type(registry.get("glm"))
```

再测试重复 ID 抛 `ValueError`、缺 Key 的 Provider 不注册、未知 wire protocol 启动失败。

- [ ] **Step 2: 用 pydantic-settings 读取环境变量**

`.env.example` 只保存：

```dotenv
QWEN_API_KEY=
GLM_API_KEY=
MINIMAX_API_KEY=
DOUBAO_API_KEY=
DEEPSEEK_API_KEY=
```

Provider 配置包含 `provider_id/base_url/model/wire_protocol/capabilities/api_key_env/default_extra_body`。

- [ ] **Step 3: 实现 Registry**

`register()` 拒绝重复 ID；`get()` 对未知 ID 抛带名称的 `KeyError`；提供只读 `provider_ids`，不暴露可修改字典。

- [ ] **Step 4: 实现 Factory**

Factory 只根据 `wire_protocol` 创建 Provider 实例并注册。它不根据模型名调用方法，不选择 fallback 顺序，不做重试。

- [ ] **Step 5: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_factory.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 6: Checkpoint**

若获授权提交：`feat: build provider registry from config`。

---

### Task 5: Task Router and Capability Filtering

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/router.py`
- Create: `ai_gateaway_proxy/tests/test_router.py`

**Interfaces:**
- Consumes: `ProviderRegistry`, `TaskType`, `ModelRoute`, `ModelBinding`。
- Produces: `Router.resolve(task) -> tuple[ModelBinding, ...]`。

- [ ] **Step 1: 写路由测试**

```python
def test_router_keeps_order_and_filters_text_only_provider() -> None:
    route = ModelRoute(
        task=TaskType.DEMO_VISION_ANALYSIS,
        required=frozenset({Capability.VISION, Capability.JSON_MODE}),
        chain=(
            ModelBinding("deepseek", "text-model"),
            ModelBinding("qwen", "vision-model"),
            ModelBinding("mock", "mock-vision"),
        ),
    )
    assert router.resolve(route.task) == (
        ModelBinding("qwen", "vision-model"),
        ModelBinding("mock", "mock-vision"),
    )
```

- [ ] **Step 2: 定义学习版唯一 Route**

```text
DEMO_VISION_ANALYSIS
requires VISION + JSON_MODE
qwen/vision-model -> glm/vision-model -> mock/mock-vision
```

- [ ] **Step 3: 实现 Router**

Router 构造时接收 Registry 和 Route 字典；`resolve()` 检查 task 存在、Provider 已注册、能力满足。它不发送 HTTP，不捕获 Provider 异常。

- [ ] **Step 4: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_router.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 5: Checkpoint**

若获授权提交：`feat: route gateway tasks by capability`。

---

### Task 6: Gateway Retry, Parser Callback, and Fallback

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/retry.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/gateway.py`
- Create: `ai_gateaway_proxy/tests/test_gateway.py`

**Interfaces:**
- Consumes: Registry、Router、Provider、错误类型和 `Callable[[str], T]` Parser。
- Produces: `RetryPolicy(max_attempts=3, base_delay_s=0.4)`, `Gateway.invoke(task, request, parser) -> GatewayResult[T]`。

- [ ] **Step 1: 写成功与三次重试测试**

```python
@pytest.mark.asyncio
async def test_retryable_error_is_attempted_three_times_then_falls_back() -> None:
    primary = scripted_provider(retryable(), retryable(), retryable())
    fallback = scripted_provider(success_json())
    result = await gateway(primary, fallback).invoke(task(), request(), parse_demo_vision_result)
    assert result.ok is True
    assert primary.call_count == 3
    assert fallback.call_count == 1
    assert [attempt.attempt_seq for attempt in result.attempts] == [1, 2, 3, 4]
```

- [ ] **Step 2: 写错误决策矩阵测试**

覆盖：Unavailable 立即切下一家；Fatal 立即终止整条 Route；invalid JSON/Schema 切下一家；所有失败返回 `ok=False`；成功后不继续调用。

- [ ] **Step 3: 实现 RetryPolicy**

`delay_for(retry_index)` 返回 `base_delay_s * 2**retry_index`；Gateway 构造函数注入 `sleep: Callable[[float], Awaitable[None]]`，测试用 no-op，避免真实等待。

- [ ] **Step 4: 实现 Gateway 主循环**

固定流程：

```text
Router.resolve
→ 遍历 Binding
→ 每个 Binding 最多三次
→ Provider.invoke
→ parser(response.text)
→ 成功立即返回
→ 按错误类型决定 retry/fallback/fatal
→ 汇总 ProviderAttempt
→ 返回 GatewayResult(ok=False)
```

Parser 抛出的 Pydantic `ValidationError` 和 JSON 错误统一包装成 `InvalidStructuredOutputError`。

- [ ] **Step 5: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_gateway.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 6: Checkpoint**

若获授权提交：`feat: add retrying fallback gateway`。

---

### Task 7: Anthropic-Compatible Adapter

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/providers/anthropic_compatible.py`
- Create: `ai_gateaway_proxy/tests/test_anthropic_compatible.py`
- Modify: `ai_gateaway_proxy/src/ai_gateway_lab/factory.py`

**Interfaces:**
- Produces: `AnthropicCompatibleProvider`，实现与 OpenAI Adapter 相同的 `Provider` Protocol。

- [ ] **Step 1: 写 Anthropic 请求/响应测试**

MockTransport 断言：URL 为 `/v1/messages`；Header 使用 `x-api-key`、`anthropic-version`；system 与 messages 分离；图片为 Anthropic base64 source；响应从 `content[].type == "text"` 提取；usage 使用 `input_tokens/output_tokens`。

- [ ] **Step 2: 写相同错误分类测试**

使用 Task 3 相同决策矩阵，确认协议差异不会泄漏到 Gateway。

- [ ] **Step 3: 实现 Adapter**

只负责 Anthropic wire payload/response。它不得引用 TaskType、Router、DemoVisionResult 或 fallback 顺序。

- [ ] **Step 4: Factory 支持第二种协议**

Factory 根据每个 `ProviderConfig.wire_protocol` 创建 OpenAI 或 Anthropic Provider；删除任何全局 `DEFAULT_PROTOCOL` 判断。

- [ ] **Step 5: 运行协议与 Gateway 回归**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_anthropic_compatible.py tests/test_gateway.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 6: Checkpoint**

若获授权提交：`feat: add anthropic compatible provider`。

---

### Task 8: FastAPI Demo Service

**Files:**
- Modify: `ai_gateaway_proxy/src/ai_gateway_lab/demo.py`
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/api.py`
- Create: `ai_gateaway_proxy/tests/test_api.py`

**Interfaces:**
- Produces: `create_app() -> FastAPI`, `POST /demo/vision`。

- [ ] **Step 1: 写 ASGI 测试**

```python
@pytest.mark.asyncio
async def test_demo_endpoint_returns_structured_gateway_result() -> None:
    app = create_app(gateway=fake_success_gateway())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/demo/vision",
            json={"image_url": "data:image/jpeg;base64,AA=="},
        )
    assert response.status_code == 200
    assert response.json()["result"]["summary"] == "ok"
```

- [ ] **Step 2: 定义入站 DTO**

请求只接受 `image_url` 和可选 `request_id`；响应只返回 Demo 结果、最终 Provider、模型和 attempts 摘要。禁止调用者传 Base URL、API Key、任意 system prompt 或 Router 配置。

- [ ] **Step 3: 实现生命周期**

FastAPI lifespan 创建一个共享 `httpx.AsyncClient`、Factory、Registry、Router 和 Gateway；关闭时 `await client.aclose()`。测试继续通过注入 fake Gateway，完全不访问公网。

- [ ] **Step 4: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_api.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 5: 本地启动 Demo**

```powershell
.\.venv\Scripts\python.exe -m uvicorn ai_gateway_lab.api:create_app --factory --reload
```

访问 `/docs`，仅确认 OpenAPI 和请求校验；默认配置必须使用 Mock Provider。

- [ ] **Step 6: Checkpoint**

若获授权提交：`feat: expose isolated gateway demo api`。

---

### Task 9: Circuit Breaker, Jitter, Deadline, and Observability

**Files:**
- Create: `ai_gateaway_proxy/src/ai_gateway_lab/circuit_breaker.py`
- Modify: `ai_gateaway_proxy/src/ai_gateway_lab/retry.py`
- Modify: `ai_gateaway_proxy/src/ai_gateway_lab/gateway.py`
- Create: `ai_gateaway_proxy/tests/test_resilience.py`

**Interfaces:**
- Produces: `CircuitBreaker`, jittered `RetryPolicy`, Gateway overall deadline 和结构化 attempt 日志。

- [ ] **Step 1: 写熔断状态测试**

断言同一 `(provider_id, model)` 连续五次节点失败后进入 OPEN；冷却结束只放行一次 HALF_OPEN；成功关闭；另一模型不受影响。

- [ ] **Step 2: 写 deadline 测试**

注入 fake monotonic clock，证明总体剩余时间不足时不开始下一次 Provider 调用，并返回 `failure_code="deadline_exceeded"`。

- [ ] **Step 3: 实现退避抖动**

公式固定：

```text
delay = min(max_delay_s, base_delay_s * 2**retry_index)
jittered = delay * random.uniform(0.8, 1.2)
```

注入 random 函数，使测试结果确定。

- [ ] **Step 4: 实现 CircuitBreaker**

状态和时间只保存在内存；key 为 `(provider_id, model)`；Router 顺序不变，Gateway 在调用前检查 breaker。

- [ ] **Step 5: 增加脱敏日志**

每次 attempt 记录 trace ID、序号、Provider、模型、状态、耗时、token 和错误类型；测试使用 `caplog` 断言日志不包含 `Authorization`、API Key 和 `data:image`。

- [ ] **Step 6: 运行验证**

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_resilience.py tests/test_gateway.py -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

- [ ] **Step 7: Checkpoint**

若获授权提交：`feat: harden gateway resilience`。

---

### Task 10: Final Verification and Learning Summary

**Files:**
- Create: `ai_gateaway_proxy/docs/learning-summary.md`
- Create: `ai_gateaway_proxy/README.md`

**Interfaces:**
- Produces: 可复现的运行说明、架构说明和个人学习总结。

- [ ] **Step 1: 运行完整自动化检查**

```powershell
cd D:\Mia\agent_tryout\skin_care_agent\ai_gateaway_proxy
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src tests
git diff --check -- ai_gateaway_proxy
```

Expected: 全部测试通过、Ruff 通过、无 whitespace error。

- [ ] **Step 2: 检查覆盖矩阵**

确认测试能分别证明：OpenAI 编解码、Anthropic 编解码、Factory 注册、Router 能力过滤、成功、三次重试、fallback、Fatal、非法 JSON、Schema 失败、最终失败、熔断、deadline、脱敏日志和 FastAPI Demo。

- [ ] **Step 3: 写 README**

README 必须包含组件职责图、安装命令、测试命令、Demo 启动命令、`.env` 安全规则，以及“本目录不接入正式 Backend”的声明。

- [ ] **Step 4: 写学习总结**

按以下固定问题作答：

```text
1. Provider Protocol 与 wire protocol 有什么区别？
2. Factory、Registry、Router、Gateway 各负责什么？
3. 为什么 max_attempts=3 不是 retry=3？
4. 哪些错误应该 retry、fallback 或 fatal？
5. FastAPI 与 httpx 分别处于调用链哪一侧？
6. 如何新增一个 OpenAI-compatible Provider 而不复制调用代码？
7. 如何证明 API Key 和图片内容没有进入日志？
```

- [ ] **Step 5: 最终 Checkpoint**

报告测试证据和仍未做的真实 Provider 联调。若用户明确授权，再提交：`feat: complete isolated ai gateway lab`。

---

## Recommended Execution Order

严格按 Task 0 → 10 执行。不要交换 Task 3 与 Task 4：先用固定配置证明一个 OpenAI Adapter，再抽象 Factory；不要把 Task 7 提前：第二协议用于验证前面抽象是否真实成立；不要把 Task 8 提前：FastAPI 只是最外层消费者；Task 9 只有在基础 Gateway 测试全绿后才开始。

## Learning Checkpoint Rhythm

每个 Task 使用同一节奏：

```text
我解释本 Task 的 Python/Java 对照
→ 你先写测试
→ 我只审查测试
→ 你写最小实现
→ 我审查实现与错误信息
→ 自动化检查通过
→ 你用自己的话写 5–10 行总结
→ 进入下一 Task
```

第一个执行任务固定为 Task 0；在 Python 可执行环境修复前不开始业务代码。
