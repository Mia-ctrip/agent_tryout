# Daily Face Capture and AI Skin Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Expo/FastAPI 纵向闭环内完成每日正脸拍摄、真实拍后质量检查、关键点区域选择、阶段式 AI 扫描和结论优先结果页。

**Architecture:** 保留现有 ObservationRecord/Target、幂等保存和异步 worker；新增无副作用照片质量预检端点，并将同一质量与区域几何结果写入已有 Photo JSONB。移动端以单一 reducer 状态机编排流程，将相机引导、区域图、扫描和结果拆成复用组件。

**Tech Stack:** React Native 0.86、Expo SDK 57、Expo Router、TypeScript、Reanimated 4.5.1；FastAPI、Pydantic v2、SQLAlchemy 2、MediaPipe、OpenCV、Pillow、pytest。

**Spec:** `docs/superpowers/specs/2026-08-30-daily-face-capture-analysis-design.md`

## Global Constraints

- 本任务与 `design/product/skin_care_app_mvp_spec.md` 冲突时按用户授权优先满足 `docs/prompt.md` 与本次原始 prompt，并在最终报告列出差异。
- 不改变认证、账号隔离、对象存储、Observation 幂等 UUID、区域 ID、异步 AI gateway 或现有创建接口字段。
- 原图不做美颜、调色、锐化、裁切覆盖或生成式修改。
- 新增依赖前必须证明现有依赖不能满足；任意人脸多边形需要 Expo 57 官方兼容且 Expo Go 已包含的 `react-native-svg@15.15.4`，除此之外不新增移动端原生依赖。
- 不宣称实时关键点已接入。Expo Go 生产适配器只提供构图状态，真实判断发生在拍后后端 MediaPipe。
- 六区保持 `forehead/left_face/right_face/nose_area/mouth_area/chin`，左右以用户本人真实方向为准。
- 每个视口只有一个视觉主操作；点击目标至少 44pt；状态不只依赖颜色；支持安全区和减少动态。
- 所有可观察行为按 RED、GREEN、REFACTOR 执行；未授权 Git commit，计划中的提交步骤改为 `git diff --check` 检查点。

---

### Task 1: Observation Photo Quality and Region Geometry Contract

**Files:**
- Create: `backend/app/schemas/observation_quality.py`
- Create: `backend/app/services/observation_quality_service.py`
- Modify: `backend/app/services/vision/quality.py`
- Modify: `backend/app/api/observations.py`
- Test: `backend/tests/test_observation_quality.py`

**Interfaces:**
- Consumes: `assess_photo_quality(raw_bytes, view_type="front")` and the existing MediaPipe model asset.
- Produces: `ObservationQualityOut`, `ObservationRegionGeometry`, `assess_observation_photo(raw_bytes)`, and `POST /api/v1/observations/photo-quality`.

- [ ] Write failing tests proving one-face quality output contains ordered issues and six normalized non-empty polygons, user-left maps to the image-right cheek, and the endpoint performs no DB/storage write.
- [ ] Run `.\.venv\Scripts\python.exe -m pytest tests\test_observation_quality.py -q` and verify failures are caused by missing schema/service/route.
- [ ] Extend the quality calculation with `face_too_close`, off-center, issue priority, selected landmark extraction and conservative occlusion reporting.
- [ ] Generate six polygons from MediaPipe landmarks and validate every point is finite and within `[0, 1]`.
- [ ] Implement the multipart preflight route with existing MIME/size/readability validation and no persistence.
- [ ] Re-run focused tests and Ruff for the new backend files.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 2: Enforce and Persist Quality on Observation Creation

**Files:**
- Modify: `backend/app/services/observation_service.py`
- Modify: `backend/app/schemas/observation.py`
- Modify: `backend/tests/test_observations.py`
- Modify: `backend/tests/integration/test_region_http_closure.py`

**Interfaces:**
- Consumes: `assess_observation_photo(raw_bytes)` from Task 1.
- Produces: `ObservationPhotoOut.quality_status`, `ObservationPhotoOut.quality_meta`, server-side rejection with stable `quality_issues`, and persisted region geometry.

- [ ] Replace the prior low-quality acceptance expectation with failing tests for specific quality rejection, no object/record write on rejection, and passed metadata persistence.
- [ ] Run focused tests and verify RED against the current `quality_status=None` behavior.
- [ ] Call quality assessment before storage, reject failed photos with actionable 422 detail, and persist passed `quality_meta` on Photo.
- [ ] Add backward-compatible quality fields to observation photo output.
- [ ] Run observation unit/integration tests and Ruff; confirm text-only observation behavior is unchanged.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 3: Mobile State Machine, Quality API, and Geometry Mapping

**Files:**
- Create: `mobile/src/lib/face-analysis-flow.ts`
- Create: `mobile/src/lib/observation-quality-api.ts`
- Create: `mobile/src/lib/face-region-layout.ts`
- Modify: `mobile/src/lib/observation-api.ts`
- Test: `mobile/tests/face-analysis-flow.test.mjs`
- Test: `mobile/tests/observation-quality-api.test.mjs`
- Test: `mobile/tests/face-region-layout.test.mjs`

**Interfaces:**
- Produces: `FaceAnalysisState`, `faceAnalysisReducer()`, `captureGuidanceCopy()`, `analysisStageForTargets()`, `checkObservationPhotoQuality()`, `mapNormalizedPolygonToCoverLayout()`.

- [ ] Write failing table tests for every required state, legal transitions, quality issue priority, retake preservation, duplicate-submit blocking and real target-to-stage mapping.
- [ ] Write failing API tests for exact multipart path and complete response shape.
- [ ] Write failing geometry tests for cover-scale/crop on portrait and landscape sources, minimum hit bounds and physical left/right semantics.
- [ ] Run the three focused test files and verify RED.
- [ ] Implement the reducer, pure copy/stage helpers, API types/builder and coordinate mapping without React dependencies.
- [ ] Re-run focused tests, typecheck and lint.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 4: Quiet Botanical Camera and Region Components

**Files:**
- Create: `mobile/src/constants/observation-theme.ts`
- Create: `mobile/src/components/camera-start-panel.tsx`
- Create: `mobile/src/components/camera-guide-overlay.tsx`
- Create: `mobile/src/components/face-region-map.tsx`
- Create: `mobile/src/components/region-choice-bar.tsx`
- Create: `mobile/src/components/observation-action-bar.tsx`
- Modify: `mobile/src/components/region-selector.tsx`
- Test: `mobile/tests/face-analysis-components.test.mjs`

**Interfaces:**
- Consumes: Task 3 state, region geometry and existing `AppButton`, Safe Area and product palette.
- Produces: accessible visual primitives used by observation screens.

- [ ] Write failing component behavior tests using exported pure view-model helpers for selected/unselected/required states, dynamic CTA labels and one active callout.
- [ ] Run focused tests and verify RED.
- [ ] Install `react-native-svg@15.15.4` with Expo using a workspace-local npm cache, then verify it appears in `package.json` and `package-lock.json`.
- [ ] Add semantic observation tokens mapped to the existing MVP product palette.
- [ ] Implement the start panel, guide overlay with an SVG even-odd oval mask, SVG region map, synced text choices and safe-area action bar.
- [ ] Ensure all Pressables expose roles, labels, checked/disabled state and at least 44pt hit targets.
- [ ] Re-run focused tests, typecheck and lint.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 5: Refactor New Observation Orchestration

**Files:**
- Modify: `mobile/src/app/observation/new.tsx`
- Modify: `mobile/src/lib/camera-capture.ts`
- Modify: `mobile/tests/camera-capture.test.mjs`
- Modify: `mobile/tests/observation-flow.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-4 and existing event preview/save functions.
- Produces: intro, permission, camera, quality, region, event and save flow driven by one reducer.

- [ ] Write failing tests for temporary photo preservation during quality failure/network retry, fixed client UUID, retake reset, double capture/save prevention and dynamic region CTA labels.
- [ ] Run focused tests and verify RED.
- [ ] Replace `ScreenMode` and scattered flow booleans with reducer dispatch while retaining form draft and existing 30-day event confirmation.
- [ ] Run quality preflight immediately after capture, enter region selection only on pass, and retain explicit retry/retake recovery.
- [ ] Make permission copy truthful: temporary photo is uploaded for quality checking; confirmed original is stored for the record and selected-region AI.
- [ ] Re-run camera/observation tests, typecheck and lint.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 6: Scanning and Result Presentation

**Files:**
- Create: `mobile/src/components/analysis-scanner.tsx`
- Create: `mobile/src/components/observation-result.tsx`
- Modify: `mobile/src/lib/observation-flow.ts`
- Modify: `mobile/src/app/observation/[observationId].tsx`
- Test: `mobile/tests/observation-result.test.mjs`
- Modify: `mobile/tests/observation-flow.test.mjs`

**Interfaces:**
- Consumes: saved photo quality geometry and independent ObservationTarget statuses/facts.
- Produces: `buildObservationResultModel()`, staged scan view and conclusion-first result.

- [ ] Write failing tests for ordered multi-region scan stages, failed sibling preservation, conclusion before detail, maximum two findings, no score/advice/product language and disabled yesterday-comparison placeholder.
- [ ] Run focused tests and verify RED.
- [ ] Implement deterministic result presenter from existing seven neutral fact fields.
- [ ] Implement Reanimated grid/scan/outline motion with system reduced-motion fallback and cleanup.
- [ ] Refactor observation detail to show scanner while any target is queued/processing and result when terminal, preserving note fallback and life context controls.
- [ ] Re-run result/flow tests, typecheck and lint.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 7: End-to-End Error and Recovery Coverage

**Files:**
- Modify: `backend/tests/integration/test_region_http_closure.py`
- Create: `backend/scripts/verify_daily_face_observation_flow.py`
- Modify: `mobile/tests/observation-api.test.mjs`
- Modify: `mobile/tests/observation-navigation.test.mjs`

**Interfaces:**
- Consumes: complete quality, save, target worker and detail contracts.
- Produces: a deterministic local flow verifier using synthetic images and mock AI provider only.

- [ ] Write a failing integration scenario: quality pass, six-zone geometry, multi-region save, idempotent retry, independent target completion/failure and state reload.
- [ ] Run the scenario and verify RED at the first missing behavior.
- [ ] Implement a local verifier that never calls an external provider and cleans temporary data/storage in `finally`.
- [ ] Add mobile API/navigation recovery tests for network failure, retake and reload.
- [ ] Run focused backend integration and mobile tests until GREEN.
- [ ] Run `git diff --check` as the task checkpoint.

### Task 8: Full Verification, Visual Preflight, and Current Status

**Files:**
- Modify: `docs/current_status.md`

**Interfaces:**
- Consumes: every prior task and the design acceptance list.
- Produces: current verified evidence and honest remaining device/provider gaps.

- [ ] Run `backend/.venv/Scripts/python.exe -m pytest backend/tests -q`.
- [ ] Run `backend/.venv/Scripts/python.exe -m ruff check backend/app backend/tests backend/scripts`.
- [ ] Run `mobile/npm run test:unit`, `npm run typecheck`, and `npm run lint`.
- [ ] Run `backend/.venv/Scripts/python.exe backend/scripts/verify_daily_face_observation_flow.py`.
- [ ] Render or launch only the project-local Expo web target if feasible without GUI automation, inspect generated layout artifacts at common mobile sizes, and document any physical-device-only checks honestly.
- [ ] Review against quiet botanical anti-patterns, safe areas, 44pt targets, color-independent states, copy boundaries and reduced motion.
- [ ] Re-read `docs/prompt.md`, the original request and this plan; map every acceptance item to evidence or an explicit remaining gap.
- [ ] Update `docs/current_status.md` with exact commands, counts, prompt/MVP differences and the unique ACTIVE plan state.
- [ ] Run `git diff --check` and `git status --short`; inspect only task-related diffs and preserve all unrelated user changes.

## Plan Self-Review

- Spec coverage: all requested states, permission recovery, quality checks, region geometry, bidirectional selection, scanning, result hierarchy, retry, accessibility, reduced motion and verification are assigned to tasks.
- Placeholder scan: the disabled yesterday comparison is an explicitly requested product placeholder; no implementation step defers required behavior.
- Type consistency: backend uses `ObservationQualityOut.regions`; mobile consumes the same normalized polygons. Existing `RegionId`, ObservationTarget status and client UUID remain unchanged.
- Scope: no new AI conclusion fields, medical semantics, product recommendation, route replacement or unrelated page redesign is introduced.
