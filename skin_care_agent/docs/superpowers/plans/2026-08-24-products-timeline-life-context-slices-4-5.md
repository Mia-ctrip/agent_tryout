# Slice 4–5 Products, Timeline, and Life Context Implementation Plan

> **Status:** COMPLETED 2026-08-24。Slice 4 与 Slice 5 已完成；当前结果以 `docs/current_status.md` 为准，历史过程由 Git 保存。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use Markdown checkboxes for tracking.

**Goal:** 实现并验证实际产品使用、个人产品柜、统一历程和生活背景贴纸两个连续纵向切片。

**Architecture:** 新增独立 Product/ProductUse 领域，保持产品使用与 Observation 解耦；LifeContext 只关联 Observation；Timeline 是跨领域只读聚合层。所有写操作复用认证、账号隔离、PostgreSQL 事务和客户端 UUID 幂等模式，移动端复用 Expo Router、SessionProvider 与现有语义主题。

**Tech Stack:** FastAPI、Pydantic v2、SQLAlchemy 2、PostgreSQL 16、Alembic、pytest；React Native 0.86、Expo SDK 57、Expo Router、TypeScript、`@expo/ui`。

**Spec:** `docs/superpowers/specs/2026-08-24-products-timeline-life-context-design.md`

## Global Constraints

- 产品事实以 `design/product/skin_care_app_mvp_spec.md` 2026-08-23 ACTIVE 版为准。
- 不建设平台总产品池，不保存品牌、规格、浓度、包装或标准产品 ID。
- “未注明产品”必须是零产品关联的显示语义，不创建伪产品。
- 产品使用、观察和生活背景是独立事实，不生成相关性、疗效、推荐或因果。
- 生活背景固定为睡眠、压力、饮食、情绪、生理期、护理变化，可以全部跳过。
- 不修改 legacy CheckInDiary、医学化 Analysis、旧趋势或聊天。
- 不向第三方提交本地数据，不执行 Git push、PR、部署或远端写操作。

---

### Task 1: Product and ProductUse persistence contract

**Files:**
- Create: `backend/app/models/product.py`
- Create: `backend/app/db/migrations/versions/0016_products_and_uses.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_product_models.py`
- Test: `backend/tests/integration/test_product_persistence.py`

**Interfaces:**
- Produces `PersonalProduct`, `ProductUse`, `ProductUseProduct` ORM classes.
- Enforces `(user_id, client_request_id)` uniqueness independently for products and uses.
- Preserves zero junction rows as an unnamed use.

- [x] Write model tests for table names, columns, FK actions, UUID uniqueness, note/timezone checks and zero-product semantics.
- [x] Run `pytest tests/test_product_models.py -q` and verify RED because the models do not exist.
- [x] Add the three focused ORM models and export them from `app.models`.
- [x] Add migration `0016_products_and_uses` with reversible tables, indexes and constraints.
- [x] Run model tests and Ruff; verify GREEN.
- [x] Add PostgreSQL persistence and 0015→0016→0015→0016 roundtrip assertions; verify no existing Observation/RegionEvent rows change.

### Task 2: Slice 4 product and product-use API

**Files:**
- Create: `backend/app/schemas/product.py`
- Create: `backend/app/services/product_service.py`
- Create: `backend/app/api/products.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_products.py`

**Interfaces:**
- `POST /products`, `GET /products`, `GET /products/{id}`.
- `POST /product-uses`, `GET /product-uses`, `GET /product-uses/{id}`.
- `create_product(...) -> (ProductOut, created: bool)` and `create_product_use(...) -> (ProductUseOut, created: bool)`.

- [x] Write API tests for trimmed manual name, blank/oversized rejection, first 201 and retry 200.
- [x] Run focused tests and verify RED because routes are absent.
- [x] Implement strict Pydantic DTOs, service queries and router registration.
- [x] Write RED tests for multiple products, zero-product “未注明”, duplicate/foreign product rejection, note/timezone validation and atomic rollback.
- [x] Implement idempotent ProductUse creation in one transaction and stable output ordering.
- [x] Write RED tests for list/detail, product use count/history and cross-account 404.
- [x] Implement list/detail/history queries and run focused tests, full backend tests and Ruff.

### Task 3: Slice 4 mobile API, form rules, and navigation

**Files:**
- Create: `mobile/src/lib/product-api.ts`
- Create: `mobile/src/lib/product-use-flow.ts`
- Create: `mobile/src/components/product-use-card.tsx`
- Create: `mobile/src/app/product-use/new.tsx`
- Create: `mobile/src/app/product/[productId].tsx`
- Modify: `mobile/src/app/_layout.tsx`
- Modify: `mobile/src/app/(tabs)/products.tsx`
- Modify: `mobile/src/app/(tabs)/observe.tsx`
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Test: `mobile/tests/product-api.test.mjs`
- Test: `mobile/tests/product-use-flow.test.mjs`

**Interfaces:**
- `createProduct`, `listProducts`, `getProduct`, `createProductUse`, `listProductUses`, `getProductUse` mirror exact backend DTOs.
- `validateProductName`, `buildProductUseInput`, `toggleProductSelection`, `formatUsedAt` own pure form behavior.

- [x] Write mobile API contract tests and verify RED due to missing module.
- [x] Implement exact product/use types and authenticated request functions; verify GREEN.
- [x] Write form tests for fixed UUID, multi-select, no selection, trim/limits, local date/time and retry identity; verify RED.
- [x] Implement pure form helpers; verify GREEN.
- [x] Replace the product tab placeholder with real cabinet loading, inline manual add and truthful empty/error states.
- [x] Add product detail and product-use routes, register protected Stack screens, and add observation quick entry.
- [x] Use Expo 57 community DateTimePicker for editable date/time and retain the same client UUID across retries.
- [x] Add product-use facts to History as an explicit section and run unit/typecheck/lint.

### Task 4: Slice 4 PostgreSQL and real local HTTP closure

**Files:**
- Create: `backend/tests/integration/test_product_http_closure.py`
- Create: `backend/scripts/verify_product_life_context_flow.py` (extended in Task 7)
- Modify: `docs/current_status.md`

**Interfaces:**
- Runs FastAPI against migrated local PostgreSQL with real auth and user isolation; no remote AI call.

- [x] Write integration closure: register two users, accept consents, add products, create multi-product and unnamed uses, retry UUIDs, reload through a new client, read product history and verify cross-account 404.
- [x] Run forced PostgreSQL test and verify all persisted IDs/times/notes survive restart.
- [x] Run Slice 4 mobile and backend full checks.
- [x] Record exact commands/results and mark Slice 4 complete before starting Task 5.

### Task 5: Slice 5 life-context persistence and Observation contract

**Files:**
- Create: `backend/app/domain/life_context_catalog.py`
- Create: `backend/app/models/life_context.py`
- Create: `backend/app/db/migrations/versions/0017_life_contexts.py`
- Modify: `backend/app/models/observation.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/observation.py`
- Modify: `backend/app/api/observations.py`
- Modify: `backend/app/services/observation_service.py`
- Test: `backend/tests/test_life_contexts.py`
- Test: `backend/tests/integration/test_life_context_persistence.py`

**Interfaces:**
- Fixed `LifeContextId` catalog in stable display order.
- `PUT /observations/{id}/life-contexts` returns Observation with `life_context_ids` and `life_context_completed_at`.

- [x] Write catalog tests for exactly six stable IDs and Chinese labels; verify RED.
- [x] Implement catalog and validation; verify GREEN.
- [x] Write model/migration tests for composite uniqueness, observation cascade and explicit skipped state; verify RED.
- [x] Add `life_context_completed_at`, association model and migration `0017`; verify GREEN.
- [x] Write API tests for selected IDs, empty skip, unknown/duplicate rejection, replacement semantics and cross-account 404; verify RED.
- [x] Implement transactional replacement and extend every Observation/Event timepoint serialization path.
- [x] Add PostgreSQL persistence/roundtrip tests and verify 0015→head→0015→head preserves old rows.

### Task 6: Slice 5 timeline API and mobile integration

**Files:**
- Create: `backend/app/schemas/timeline.py`
- Create: `backend/app/services/timeline_service.py`
- Create: `backend/app/api/timeline.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_timeline.py`
- Create: `mobile/src/lib/life-context.ts`
- Create: `mobile/src/lib/timeline-api.ts`
- Create: `mobile/src/components/life-context-selector.tsx`
- Create: `mobile/src/components/timeline-item-card.tsx`
- Modify: `mobile/src/lib/observation-api.ts`
- Modify: `mobile/src/app/observation/[observationId].tsx`
- Modify: `mobile/src/app/region-event/[eventId].tsx`
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Test: `mobile/tests/life-context.test.mjs`
- Test: `mobile/tests/timeline-api.test.mjs`

**Interfaces:**
- `GET /timeline` returns discriminated `region_event`, `full_face_observation`, `product_use` entries with stable IDs/times/sources.
- Mobile life-context and timeline modules mirror exact API unions.

- [x] Write backend RED tests for mixed chronological order, full-face-only observation inclusion, event de-duplication, source labels, product zero-list and account isolation.
- [x] Implement the read-only timeline service/router without AI imports or writes; verify GREEN.
- [x] Write mobile RED tests for six stickers, stable order, API payloads, skip semantics, timeline union and non-causal copy.
- [x] Implement life-context/timeline libraries and focused components; verify GREEN.
- [x] Add choose/save/skip UI to Observation detail and display saved contexts in Observation and RegionEvent timepoints.
- [x] Replace History sections with the unified timeline while keeping event drill-down and full-face detail navigation.
- [x] Run mobile unit/typecheck/lint and focused backend tests.

### Task 7: Full closure, regression, and documentation

**Files:**
- Modify: `backend/tests/integration/test_product_http_closure.py`
- Modify: `backend/scripts/verify_product_life_context_flow.py`
- Modify: `docs/current_status.md`
- Modify: `project_background.md`
- Modify: this plan (checkboxes and completion status)

- [x] Extend real local HTTP closure through an Observation with selected contexts and another with explicit skip; reload Timeline/Event/Observation through a new client.
- [x] Verify products, uses, life contexts and timeline are account-isolated and no remote AI/provider is invoked.
- [x] Run all backend unit tests, forced PostgreSQL integration, migration roundtrips and Ruff.
- [x] Run all mobile unit tests, TypeScript and Expo lint.
- [x] Re-run Slice 2–3 region regression including catalog directions, multi-target idempotency, independent states, AI boundary and event history.
- [x] Inspect OpenAPI, final diff and `git diff --check`; scan for platform product pool, causal wording, TODO/Mock placeholders and legacy route exposure.
- [x] Update current status with exact evidence, remaining external/GUI validation boundaries and next ACTIVE plan state.
- [x] Re-read the user goal and MVP acceptance criteria; only mark the goal complete when every locally executable condition has fresh evidence.
