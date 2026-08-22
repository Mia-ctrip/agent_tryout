# AI Gateway 学习项目规格

> 状态：ACTIVE
>
> 日期：2026-08-22
>
> 范围：仅限 `ai_gateaway_proxy/`，不接入正式 `backend/`。

## 1. 学习目标

本项目用于让一名具有 Java 经验、处于 Python 入门阶段的开发者亲自实现一个可测试的 AI Gateway。完成后应能够解释并实现：

- Python package、类型标注、Pydantic、`Protocol`、异常和方法引用；
- 使用 `httpx.AsyncClient` 发出异步 HTTP 请求；
- OpenAI-compatible 与 Anthropic-compatible 两类协议适配；
- Provider 配置、Factory/Registry、Task Router；
- 超时、最多三次调用、退避、fallback、熔断和最终失败；
- 结构化输出解析、Schema 校验、调用记录和 FastAPI Demo。

## 2. 非目标

- 不实现正式 Skin Care MVP 的七字段业务契约；
- 不创建正式数据库模型、迁移、异步任务或移动端功能；
- 不从 `backend/app` 导入实现，也不让正式 Backend 依赖本目录；
- 不要求真实调用付费模型；所有核心行为必须先通过本地 Mock HTTP 测试；
- 不实现比较、趋势、聊天历史、Tool Use、流式输出或内容审核平台。

## 3. 示例消费者契约

虽然不实现正式业务，Gateway 仍需一个最小消费者证明结构化输出与 fallback 可用。示例任务固定为 `demo_vision_analysis`，示例结果只有：

- `summary: str`：1–200 字；
- `observations: list[str]`：1–5 项，每项非空。

该模型只用于测试 Gateway，不代表 Skin Care 产品契约。

## 4. 分层边界

| 组件 | 职责 | 禁止承担 |
|---|---|---|
| Demo Service | 构造 Prompt、图片请求和结果 Schema | Provider 选择、HTTP 重试 |
| Gateway | 执行 Router 结果、重试、fallback、解析回调和调用记录 | 厂商 JSON 拼装、FastAPI HTTP 契约 |
| Router | `TaskType + Capability` 到有序 `ModelBinding` | 网络调用、重试、业务解析 |
| Factory/Registry | 从配置创建 Provider 并按 ID 注册 | 每次请求动态路由 |
| Provider | 统一请求与厂商协议之间的转换、HTTP 调用和错误分类 | 业务字段和 fallback 链 |
| FastAPI Demo | 入站 HTTP 校验与调用 Demo Service | 模型协议细节 |

## 5. 核心契约

- `TaskType.DEMO_VISION_ANALYSIS`
- `Capability.TEXT`, `VISION`, `JSON_MODE`
- `WireProtocol.OPENAI_COMPATIBLE`, `ANTHROPIC_COMPATIBLE`, `MOCK`
- `UnifiedRequest`, `UnifiedResponse`, `TokenUsage`
- `ProviderConfig`, `ModelBinding`, `ModelRoute`
- `ProviderAttempt`, `GatewayResult[T]`
- `Provider.invoke(model, request, timeout) -> UnifiedResponse`
- `Router.resolve(task) -> tuple[ModelBinding, ...]`
- `Gateway.invoke(task, request, parser) -> GatewayResult[T]`

## 6. 错误与重试语义

`max_attempts=3` 表示单个 Provider/Model 最多总调用三次，不是首次调用加三次重试。

| 错误 | 示例 | 当前节点重试 | 切换下一节点 |
|---|---|---:|---:|
| `RetryableProviderError` | 超时、网络错误、429、5xx | 是 | 三次耗尽后是 |
| `UnavailableProviderError` | 401、403、402、无 Key | 否 | 是 |
| `FatalRequestError` | 无效请求、无法读取的图片 | 否 | 否 |
| `InvalidProviderResponseError` | 响应结构缺字段 | 可重试一次，受总次数限制 | 是 |
| `InvalidStructuredOutputError` | 非 JSON 或 Schema 不通过 | 否 | 是 |

所有节点耗尽后返回 `GatewayResult(ok=False)` 和稳定 `failure_code`；Gateway 不返回面向 Skin Care 用户的文案。

## 7. Provider 兼容策略

- 每种 wire protocol 只有一个主要 Adapter；
- 同协议供应商通过 `ProviderConfig` 创建不同实例；
- Provider 可通过 `default_headers`、`default_extra_body` 和小型 Hook 表达差异；
- 只有真实差异无法由配置表达时才增加子类；
- 模型是配置数据，不创建“一模型一方法”。

## 8. Router 规则

学习版只定义一条路由：

```text
demo_vision_analysis
  requires: vision + json_mode
  chain: qwen_vision -> glm_vision -> mock_vision
```

Router 在启动时验证：Provider 已注册、模型 ID 非空、能力满足任务要求。运行时只返回有序 Binding，不改变顺序，不访问网络。

## 9. 稳定性规则

- `httpx.AsyncClient` 由应用生命周期创建和关闭，不按请求反复创建；
- 分离 connect/read/write/pool timeout；
- 单节点最多三次调用，使用指数退避和随机抖动；
- Gateway 接受总体 deadline，剩余时间不足时停止；
- 熔断器以 `(provider_id, model)` 为键；
- 每次尝试记录 trace ID、序号、Provider、模型、状态、耗时、token 和脱敏错误；
- 日志和响应不得出现 API Key 或图片 Base64 原文。

## 10. 安全与配置

- API Key 只从环境变量读取；
- Git 只保存 `.env.example`；
- Provider 配置保存环境变量名，不保存 Key 值；
- FastAPI Demo 不提供任意 Base URL、任意 Prompt 或任意 Provider 的公开代理能力；
- 默认测试使用 `httpx.MockTransport`，真实调用必须由用户明确开启。

## 11. 完成标准

- OpenAI-compatible 与 Anthropic-compatible Adapter 均通过本地协议测试；
- Factory 能从配置生成 Registry；
- Router 能过滤不满足 `VISION + JSON_MODE` 的节点；
- Gateway 能证明成功、重试、fallback、非法 JSON、Schema 失败、熔断和最终失败；
- FastAPI Demo 能通过内存 ASGI 客户端完成一次结构化请求；
- `pytest`、Ruff 和类型检查通过；
- 删除整个 `ai_gateaway_proxy/` 不影响正式 Backend。
