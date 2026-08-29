# Full-Face Observation Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Status:** COMPLETED / FROZEN
>
> **Scope:** MVP 准备阶段＋切片 1。非阻塞遗留见 `docs/frozen/2026-08-23-slice-1-deferred.md`。

**Goal:** 交付“单张全脸照片或文字记录 → 可靠保存 → 异步 AI 中性整理 → 离开后重新进入可查看 → AI 失败文字降级”的真实闭环。

**Architecture:** 新建与 legacy CheckIn 分离的 `ObservationRecord → ObservationTarget`，固定 `full_face`，复用 `Photo`、认证、存储、幂等和 AI gateway。API 先提交原始记录，再用 FastAPI `BackgroundTasks` 调用独立 Session worker；移动端根据服务端状态轮询恢复。

**Tech Stack:** Python 3.11、FastAPI、SQLAlchemy 2、PostgreSQL、Alembic、Pydantic 2、pytest、React Native 0.86、Expo SDK 57、Expo Router、TypeScript 6。

**Spec:** `design/product/skin_care_app_mvp_spec.md`

## Global Constraints

- 固定 `scope_type=full_face`、`region_id=null`，不显示范围选择。
- 原始照片/时间/原文先保存；AI 结果带版本且不覆盖原始数据。
- 只检查 MIME、大小、可读取性；不调用质量门槛、标准化或三视角检查。
- AI 仅输出规格的七类中性事实；禁止诊断、严重度、评分、建议、疗效和因果。
- 状态仅 `queued/processing/completed/needs_input`；请求按用户 UUID 幂等。
- 新导航恰好四栏且不链接 legacy；不增加依赖、不改历史迁移。
- Git 提交必须另获用户授权；未授权时跳过所有 commit 命令。

## File Map

| Unit | Responsibility |
|---|---|
| `models/observation.py` + revision 0013 | 原始观察、通用观察目标、状态和约束 |
| `schemas/observation.py` | 稳定的 HTTP 请求/响应契约 |
| `schemas/full_face_observation.py` + `services/full_face_prompt.py` | 非医学 AI Schema、安全校验和版本化 prompt |
| `services/observation_service.py` | 原图保存、幂等、查询和文字降级 |
| `services/full_face_analysis_service.py` + `observation_worker.py` | gateway 调用、日志、原子状态流转 |
| `api/observations.py` | 创建、列表、详情和文字降级端点 |
| `mobile/src/lib/observation-*.ts` | 客户端契约、草稿、轮询和展示派生 |
| `mobile/src/app/(tabs)/*` | 四栏壳层、观察入口和真实历程 |
| `mobile/src/app/observation/*` | 单照片保存与异步结果恢复 |

## Checkpoint Procedure

每个任务完成后先运行该任务列出的测试，再运行 `git diff --check`。只有用户明确授权提交时，才对该任务 **Files** 中的路径执行 `git add`、检查 `git diff --cached`，并使用任务给出的提交信息；未授权时保留未提交 diff，继续前必须向用户报告验证证据。

---

### Task 1: Observation domain and migration

**Files:** create `backend/app/models/observation.py`, revision `0013_full_face_observations.py`, `backend/tests/test_observation_models.py`; modify `models/__init__.py`.

**Interfaces:** `ObservationRecord(user_id, client_request_id, recorded_at, photo_id, user_note, status)`; `ObservationTarget(record_id, user_id, scope_type, region_id, status, result_source, facts, provider, model, trace_id, prompt_version, schema_version, failure_code, processing_started_at, completed_at)`.

- [ ] Test non-null UUID/scope and named idempotency/full-face/region unique indexes; run test and observe missing model.
- [ ] Implement JSONB facts, Text note, user/record FKs, unique photo FK and scope check: full_face requires null region; region requires non-null region.
- [ ] Add revision after 0012; create record before target, downgrade in reverse, touch no legacy table.
- [ ] On verified disposable `TEST_DATABASE_URL`, run Alembic upgrade → downgrade 0012 → upgrade, then model pytest and Ruff.
- [ ] If authorized commit `feat: add full-face observation domain`; otherwise run `git diff --check`.

### Task 2: HTTP and neutral AI contracts

**Files:** create `schemas/observation.py`, `schemas/full_face_observation.py`, `services/full_face_prompt.py`, `tests/test_full_face_observation.py`.

**Interfaces:** `FullFaceObservationFacts`, `validate_full_face_display()`, HTTP DTOs, prompt/schema version `full-face-observation-1.0.0`.

- [ ] Red tests accept seven neutral fields and reject extra `skin_score`, summary over 200 chars, and unsafe medical/advice language.
- [ ] Implement strict fields: main_locations ≤8, estimated_amount ≤80, distribution/coverage ≤120, daily_appearance/unknowns ≤8, summary 1–200; strip strings and reject blank items.
- [ ] Safety rejects diagnosis/痤疮/丘疹/脓疱/严重/炎症程度/治疗/用药/建议使用/推荐产品/疗效; reject, never rewrite.
- [ ] Define `ObservationOut`: identity/time/note/photo/target; source `photo_analysis|user_record|null`; region always null. Note replacement trims 1–500 chars.
- [ ] Add exact seven-key prompt, user prompt “请只整理这张全脸照片能够直接支持的可见外观事实。” and deterministic neutral mock.
- [ ] Run focused pytest/Ruff; authorized commit `feat: define neutral full-face contract`.

### Task 3: Idempotent photo-or-text creation API

**Files:** create `services/observation_service.py`, `api/observations.py`, `tests/test_observations.py`; modify `main.py`, `tests/test_app.py`.

**Produces:** `create_observation(...) -> (record, target, created)`; multipart `POST /api/v1/observations`.

- [ ] Red tests: photo → 201/saved/queued/full_face; trimmed text → 201/completed/user_record; blank photo+note → 422.
- [ ] Lookup user+UUID first. Validate MIME, non-empty/size and Pillow readability only; store `observations/{user}/{YYYY}/{MM}/{DD}/{uuid}.{ext}`.
- [ ] Create `Photo` without check-in/view/quality/processed key, then record+target in one transaction. Photo starts queued; text-only completed/user_record.
- [ ] DB failure deletes new object. Integrity race deletes only duplicate object, returns existing bundle 200; first create 201.
- [ ] Sign URL at response time. Test duplicate stores once, bytes 400, MIME 415, size 413, readable low-quality accepted, storage/DB rollback.
- [ ] Mount/OpenAPI, run observation/app pytest and Ruff; authorized commit `feat: persist idempotent observations`.

### Task 4: Async full-face gateway worker

**Files:** create `services/full_face_analysis_service.py`, `services/observation_worker.py`; modify observation API, gateway mock and AI tests.

**Produces:** `analyze_full_face_photo(...) -> FullFaceAnalysisOutcome`; `run_observation_target(target_id, session_factory, analyze)`.

- [ ] Async red tests: queued success → completed/photo_analysis; final failure → needs_input; non-queued is not analyzed.
- [ ] Make mock JSON generic via `json.dumps(req.extra.get(mock_json, default))`; keep domain logic outside provider.
- [ ] Prepare original with `prepare_for_llm`; invoke existing `vision_analyze` route with new prompt/JSON/mock extra.
- [ ] Persist each attempt as `AICallLog(kind=full_face_observation)` with sanitized request, target/photo/version metadata, provider status, tokens, latency and error.
- [ ] Parse, strict-validate and safety-check. Skip failed binding; final codes: `all_providers_failed/invalid_json/invalid_schema/unsafe_output`.
- [ ] Atomically claim queued → processing before AI. Success stores facts/source/provider/model/trace/versions/time; failure stores needs_input/code without touching raw record.
- [ ] Schedule BackgroundTask only after commit; text-only does not schedule. Run focused pytest/Ruff; authorized commit `feat: process observations asynchronously`.

### Task 5: History, ownership and manual fallback API

**Files:** modify observation service/API/tests and `backend/tests/test_app.py`.

**Produces:** `GET /observations?limit&before_id`, `GET /observations/{id}`, `PUT /observations/{id}/note`.

- [ ] Red tests: newest-first list, signed detail, Bearer auth, other-user 404, blank note 422, queued/completed note 409, needs_input note → completed/user_record.
- [ ] Query current user/non-deleted only; order recorded_at/id descending; clamp 1–50; apply id cursor; avoid N+1. Wrong owner and missing both 404.
- [ ] Only needs_input accepts note. Preserve trimmed exact text, set completed/user_record, clear failure code, retain audit logs/trace, expose no raw response.
- [ ] Verify three route shapes/auth; run observation/app pytest and Ruff.
- [ ] Authorized commit `feat: expose observation history and fallback`.

### Task 6: PostgreSQL persistence proof

**Files:** create `backend/tests/integration/conftest.py`, `test_observations_persistence.py`; modify `docs/environment_setup.md`.

- [ ] Fixture skips without `TEST_DATABASE_URL`; otherwise binds rollback transaction to a disposable migrated PostgreSQL DB.
- [ ] Session A commits user/photo observation; fresh Session B loads same UUID/ID/full_face target. Prove duplicate UUID has one row and another user is hidden.
- [ ] Document and run:

```powershell
$env:DATABASE_URL = $env:TEST_DATABASE_URL
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m pytest tests/integration/test_observations_persistence.py -q
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check app tests
```

- [ ] Require integration test to run, not skip. Authorized commit `test: verify observation persistence`.

### Task 7: Mobile API and pure state flow

**Files:** create `mobile/src/lib/observation-api.ts`, `observation-flow.ts` and tests; modify camera capture/tests.

**Produces:** exact snake_case Observation types, form/request functions, `shouldPollObservation`, `nextObservationPollDelay`, status copy.

- [ ] Red test FormData has UUID/time/file but no region/view/check-in. Assert POST create, GET list/detail, PUT note paths.
- [ ] Red test only queued/processing poll and delays are 2000/3000/4500/6750/10000 ms capped.
- [ ] Match every backend field and reuse authenticated `request`; add no token layer.
- [ ] Rename implementation `takeCameraPhoto`, preserve `export const takeCheckInPhoto = takeCameraPhoto`; test alias and unchanged emulator/device behavior.
- [ ] Run `npm run test:unit`, `typecheck`, `lint`; authorized commit `feat: add mobile observation contracts`.

### Task 8: MVP theme and four-tab shell

**Files:** modify theme, root layout/index/app.json; create `mobile/src/app/(tabs)/_layout.tsx` and observe/history/products/me.

- [ ] Add the sage palette `#9BAD50/#71813C/#F8F0DD/#E8C76A/#46502C/#FFFDF7` as semantic tokens: brand/selected, actionPrimary/focus, background/surfaceMuted, context/highlight, textPrimary/iconStrong, and surface/photoSurface. Preserve legacy semantic keys; press uses opacity; splash/adaptive background uses `#F8F0DD` and content surfaces use `#FFFDF7`.
- [ ] Authenticated index redirects `/(tabs)/observe`. Protect tab group and observation new/detail; keep legacy routes unlinked.
- [ ] Configure exactly four labels 观察/历程/产品/我的 with installed expo-symbols: camera.viewfinder/photo_camera, clock.arrow.circlepath/history, shippingbox/inventory_2, person.crop.circle/person.
- [ ] “我的” uses existing user/signOut. “产品” truthfully states cabinet arrives in Slice 2, with no fake data/action.
- [ ] Run mobile tests/typecheck/lint; authorized commit `feat: add four-tab mvp shell`.

### Task 9: Single-photo and text-only record screen

**Files:** create `mobile/src/app/observation/new.tsx`; modify observe tab, observation flow/test.

- [ ] Red test retry preserves UUID; photo may save with blank note; text-only requires trimmed note.
- [ ] Use `SavePhase = idle|capturing|saving|save_failed` and Draft with request ID, recorded time, photo URI, taken time and note.
- [ ] Ask permission only when photographing. Capture one front image; preview/retake/save; offer “暂时不拍，直接记录” max 500 chars.
- [ ] Retry retains UUID/draft. Announce success only after server saved. Success replaces route with observation ID; failure retains input/photo.
- [ ] Observe CTA is “记录现在的变化”; no three-view/score/old trend/demo links.
- [ ] Run tests/typecheck/lint. Verify Android+iOS deny/grant, cancel, photo, network retry, text, no region step; record evidence.
- [ ] Authorized commit `feat: add single-photo observation capture`.

### Task 10: Async detail, history and slice verification

**Files:** create observation detail; modify observe/history, flow/tests, `docs/current_status.md`, `backend/README.md`.

- [ ] Red presenter tests: photo has seven neutral sections/source and no score; manual preserves exact text; needs_input title “照片暂时无法整理”.
- [ ] On focus GET immediately. Poll queued/processing with capped delay; cancellation/generation guard blocks stale responses after blur.
- [ ] Fixed UI for queued/processing/completed photo/completed user/needs_input/request failure. Never show failure code, raw response, trace ID, score, severity or advice.
- [ ] History loads real server order with time/source/status/masked thumbnail; observe loads latest three; no fixtures.
- [ ] Run full backend pytest/Ruff and mobile tests/typecheck/lint.
- [ ] E2E: create photo; leave; return via 历程 to same completed ID; restart; force AI failure then note; repeat UUID unchanged; other account 404.
- [ ] Update status only from evidence; set migration head 0013 only after applied; document endpoints and legacy labels.
- [ ] Final `git diff --check` and grep new files for medical/check-in/view/region leakage.
- [ ] Authorized commit `feat: complete full-face observation slice`.

## Slice 1 Exit Criteria

- photo or non-blank text creates one idempotent record before AI;
- only full_face is exposed; gateway uses the new non-medical Schema;
- leaving does not cancel processing; history restores state/result;
- failure preserves photo and accepts exact user text; wrong account gets 404;
- legacy flows are absent from tabs;
- PostgreSQL, backend tests/Ruff, mobile tests/typecheck/lint and Android/iOS evidence pass;
- current status records facts.

## Slice 1 → Slice 2 Acceptance Gate

- All 10 tasks and every Slice 1 exit criterion must be complete as one frontend/backend/database/AI deliverable.
- Technical verification alone changes the status to `WAITING FOR USER ACCEPTANCE`; it does not open Slice 2.
- Slice 2 may receive an ACTIVE detailed plan or implementation only after the user explicitly confirms Slice 1 acceptance.
- Until then, the product tab may show only the truthful Slice 2 empty state defined in Task 8; no product business logic, fixtures or mock completion claims are allowed.

## Explicitly Deferred

Slice 2 products; Slice 3 stickers; Slice 4 comparison/trend; Slice 5 external durable queue, multi-instance recovery, export/release hardening; post-MVP region selection/events/trends.
