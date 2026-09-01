# Region History Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将移动端“历程”改为按固定面部区域进入真实事件时间链，并完整处理隐私缩略图、时间上下文和降级状态。

**Architecture:** 以 `history-flow.ts` 组合既有事件、观察、统一历程和产品使用 DTO，页面只消费稳定展示模型。总览保留现有 tab 路由，事件详情保留现有动态路由；新增小型可复用视觉组件，仅为区域时间点响应补充兼容旧记录的只读时区字段，不改变认证、相机、存储或既有接口语义。

**Tech Stack:** Expo SDK 57、React Native 0.86、Expo Router、TypeScript、expo-image、Node test runner、FastAPI 既有只读接口。

**Spec:** `docs/superpowers/specs/2026-08-30-region-history-evidence-design.md`

**Outcome (2026-08-31):** Tasks 1–6 are implemented. Mobile lint, typecheck and 189 unit/contract tests plus the full backend suite pass. Pixel 8 verification passed for the active overview, two-point event timechain, alternate selection, back navigation and existing full observation entry. The signed-in development account contained only `completed` targets, so no empty/queued/processing/needs-input screenshot was fabricated; those branches are covered by typed presentation, pagination, privacy lifecycle and UI contract tests and are recorded as a device-data limitation in `docs/current_status.md`.

## Global Constraints

- 不展示分数、严重度、改善/恶化、疗效、诊断、治疗建议或跨区域结论。
- 产品使用和生活背景只作相邻时间上下文，不接入观察时间线。
- 左右脸始终按用户本人真实左右。
- 不把 pending/processing 目标猜测为某个可见事件的时间点。
- 默认使用客户端隐私模糊缩略图；只有显式进入现有观察详情才展示原图。
- 不新增依赖、不修改相机和相册权限、不改变现有后端接口语义。
- 保留工作区已有未提交改动，不覆盖或回退。

---

### Task 1: History presentation model

**Files:**
- Create: `mobile/src/lib/history-flow.ts`
- Create: `mobile/tests/history-flow.test.mjs`

**Interfaces:**
- Consumes: `RegionEvent[]`, `Observation[]`, `TimelineItem[]`, `ProductUse[]`。
- Produces: `buildRegionOverview()`, `chooseDefaultTimepointId()`, `timepointSourceLabel()`, `productContextsForEvent()`。

- [ ] Write failing tests for current/history/neutral region state, multiple event ordering, pending status priority, honest count fallback, latest default, source labels and context interval filtering.
- [ ] Run `npm run test:unit -- history-flow` and verify RED.
- [ ] Implement typed pure functions with no `any` and no data inference outside supplied DTOs.
- [ ] Re-run focused tests and verify GREEN.

### Task 2: Overview visual components

**Files:**
- Create: `mobile/src/components/history-face-overview.tsx`
- Create: `mobile/src/components/history-event-row.tsx`
- Create: `mobile/tests/history-ui-contract.test.mjs`

**Interfaces:**
- Consumes: region overview models and existing theme tokens.
- Produces: accessible abstract six-region map and lightweight event rows.

- [ ] Write failing behavior tests for all six accessibility labels, true-left/right copy and event-entry decisions; verify visual target sizing and prohibited-language absence in the Android viewport review.
- [ ] Run focused UI contract tests and verify RED.
- [ ] Implement the abstract face using React Native views and an existing `expo-image` SVG background only; no real photo and no new dependency.
- [ ] Implement active, historical, pending and neutral non-color state signals.
- [ ] Re-run focused tests.

### Task 3: Region overview page

**Files:**
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Modify: `mobile/tests/timeline-api.test.mjs`

**Interfaces:**
- Consumes: existing `listRegionEvents`, `listObservations`, `listTimeline`.
- Produces: region-first history overview preserving full-face and product history.

- [ ] Add failing presentation-model tests for the new hierarchy and preservation of full-face/product history; verify empty/loading/error copy in the Android viewport review.
- [ ] Load the three existing endpoints with a generation guard and keep stale responses from overwriting current state.
- [ ] Implement direct single-event navigation, inline multi-event selection and pending-observation navigation.
- [ ] Render low-emphasis other history without restoring the card wall.
- [ ] Run focused tests, typecheck and lint.

### Task 4: Privacy timechain and evidence card

**Files:**
- Create: `mobile/src/components/privacy-photo-thumbnail.tsx`
- Create: `mobile/src/components/region-timechain.tsx`
- Create: `mobile/src/components/timepoint-evidence-card.tsx`
- Modify: `mobile/src/lib/observation-api.ts`
- Modify: `mobile/tests/observation-api.test.mjs`
- Modify: `mobile/tests/history-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `RegionEventTimepoint`, signed photo URL and existing observation route.
- Produces: `refreshObservationPhotoUrl()`, horizontal selected timechain and evidence card.

- [ ] Write failing API and presentation tests for photo URL refresh, text nodes, selected state and full-detail targets; verify blur, callbacks and horizontal scrolling in the Android viewport review.
- [ ] Implement signed URL refresh through existing `GET /photos/{photo_id}/url`.
- [ ] Implement privacy thumbnail states without exposing raw photos.
- [ ] Implement horizontal timechain and selected evidence card with factual source labeling.
- [ ] Run focused tests.

### Task 5: Region event detail integration

**Files:**
- Modify: `mobile/src/app/region-event/[eventId].tsx`
- Modify: `mobile/tests/region-event-api.test.mjs`
- Modify: `mobile/tests/history-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `getRegionEvent`, `listProductUses`, Task 1 and Task 4 components.
- Produces: complete evidence-first event detail.

- [ ] Add failing presentation tests for title/meta, product context separation and ended-state behavior; verify boundary copy and end action preservation in the Android viewport review.
- [ ] Fetch event and product uses on focus, preserving a still-valid selected target.
- [ ] Render title, timechain, low-emphasis contexts, evidence card, boundary and existing end action.
- [ ] Add loading, empty and error recovery.
- [ ] Run focused tests, typecheck and lint.

### Task 6: Regression, device verification and status

**Files:**
- Modify: `docs/current_status.md`
- Create screenshots under: `pic/ui_screen_shot/history/`

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: automated verification evidence and Android screenshots.

- [ ] Run `npm run test:unit`, `npm run typecheck`, `npm run lint` in `mobile`.
- [ ] Run related backend region-event, observation and timeline tests plus Ruff on untouched backend paths.
- [ ] Run `git diff --check` and inspect only intended diffs.
- [ ] Start/attach the existing backend, Expo and Pixel 8 emulator without changing migrations or user data outside a dedicated development account.
- [ ] Verify tab navigation, back, multiple events, horizontal timechain, selected detail updates, thumbnail/original boundary and full-detail navigation.
- [ ] Capture active overview, event detail, alternate selected timepoint and empty/processing/needs-input state; disclose any development fixture data honestly.
- [ ] Update `docs/current_status.md` with exact commands, counts, screenshots and remaining environment limitations.
