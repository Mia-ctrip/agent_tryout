# Region Observations and Events Slices 2–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.
>
> **Status:** COMPLETED (local acceptance evidence recorded 2026-08-24)
>
> **Execution:** Inline, continuous; Slice 2 verification immediately transitions to Slice 3 without user gate.

**Goal:** Deliver fixed-region selection, independent per-region AI, and region-event organization and review on top of the verified Slice 1 Observation foundation.

**Architecture:** One `ObservationRecord` owns the idempotency identity, time and optional original photo; one to six `ObservationTarget` rows own region text, AI state and facts. Slice 3 adds `RegionEvent`, reserves event membership at save time, and exposes only events with valid targets.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2, PostgreSQL, Alembic, Pydantic 2, pytest, React Native 0.86, Expo SDK 57, Expo Router, TypeScript 6, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-region-observations-events-design.md`

## Global Constraints

- New records use only `forehead`, `left_face`, `right_face`, `nose_area`, `mouth_area`, `chin`; no new `full_face` target.
- Left and right always mean the user's physical left and right; preview mirroring never changes IDs.
- Save 1–6 unique targets atomically under user plus `client_request_id`; schedule AI only after commit.
- Photo targets are independent `queued/processing/completed/needs_input`; text-only requires one non-blank note per target.
- AI receives one stable region ID and may not emit another region, a full-face conclusion, diagnosis, score, severity, treatment or product advice.
- Existing full-face history remains readable and never enters `RegionEvent`.
- Region events organize valid targets only; no regional comparison, trend, causality or cross-region summary.
- No new dependency is required. Do not touch legacy CheckIn, Patch lineage, medical Analysis or old trends.
- Do not commit, push, create a PR, deploy, or call a third-party inference API during unattended execution.

---

### Task 1: Fixed Region Catalog and Slice 2 Migration — IMPLEMENTED

**Files:**
- Create: `backend/app/domain/region_catalog.py`
- Create: `backend/app/db/migrations/versions/0014_region_observation_targets.py`
- Modify: `backend/app/models/observation.py`
- Modify: `backend/tests/test_observation_models.py`
- Create: `backend/tests/test_region_catalog.py`

**Interfaces:**
- Produces: `RegionId`, `REGION_IDS`, `REGION_DEFINITIONS`, `normalize_region_ids()`.
- Produces model fields: `ObservationRecord.recorded_timezone_offset_minutes`, `recorded_local_date`; `ObservationTarget.user_note`.

- [x] **Step 1: Write catalog and model red tests**

```python
def test_region_catalog_uses_the_six_mvp_ids_in_display_order():
    assert REGION_IDS == (
        "forehead", "left_face", "right_face",
        "nose_area", "mouth_area", "chin",
    )

def test_region_ids_reject_unknown_and_duplicate_values():
    with pytest.raises(ValueError):
        normalize_region_ids(["forehead", "forehead"])
    with pytest.raises(ValueError):
        normalize_region_ids(["other"])
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_catalog.py backend/tests/test_observation_models.py -q`

Expected: import failure for `app.domain.region_catalog` and missing model columns.

- [x] **Step 3: Implement the fixed catalog and model columns**

```python
RegionId = Literal[
    "forehead", "left_face", "right_face",
    "nose_area", "mouth_area", "chin",
]
REGION_IDS: tuple[RegionId, ...] = (
    "forehead", "left_face", "right_face",
    "nose_area", "mouth_area", "chin",
)

def normalize_region_ids(values: Iterable[str]) -> tuple[RegionId, ...]:
    normalized = tuple(values)
    if not 1 <= len(normalized) <= 6 or len(set(normalized)) != len(normalized):
        raise ValueError("select one to six unique regions")
    if any(value not in REGION_IDS for value in normalized):
        raise ValueError("unsupported region")
    return tuple(region for region in REGION_IDS if region in normalized)
```

- [x] **Step 4: Add migration 0014**

Create nullable legacy-safe record date fields, target `user_note`, timezone range check and six-ID region check. Downgrade drops only 0014 additions.

- [x] **Step 5: Verify GREEN and migration metadata**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_catalog.py backend/tests/test_observation_models.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/domain backend/app/models backend/app/db/migrations/versions/0014_region_observation_targets.py backend/tests/test_region_catalog.py backend/tests/test_observation_models.py`

Run: `git diff --check`

---

### Task 2: Multi-Target HTTP Contracts — IMPLEMENTED

**Files:**
- Modify: `backend/app/schemas/observation.py`
- Modify: `backend/app/api/observations.py`
- Modify: `backend/tests/test_observations.py`
- Modify: `backend/tests/test_app.py`

**Interfaces:**
- Produces: `RegionTargetCreate(region_id, user_note, event_decision=None)` and `ObservationOut.targets`.
- Consumes multipart `targets_json` and `recorded_timezone_offset_minutes`.

- [x] **Step 1: Write response and request red tests**

```python
def test_region_photo_request_requires_confirmed_targets(monkeypatch):
    response = client.post("/api/v1/observations", data=_region_form([]), files=_photo())
    assert response.status_code == 422

def test_observation_response_returns_ordered_targets_not_single_target(monkeypatch):
    response = client.post(
        "/api/v1/observations",
        data=_region_form([{"region_id": "chin"}, {"region_id": "forehead"}]),
        files=_photo(),
    )
    assert [row["region_id"] for row in response.json()["targets"]] == ["forehead", "chin"]
    assert "target" not in response.json()
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observations.py -q`

Expected: old endpoint accepts no targets and returns `target`.

- [x] **Step 3: Implement strict Pydantic DTOs and multipart parsing**

```python
class RegionTargetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    region_id: RegionId
    user_note: ObservationNote | None = None
    event_decision: Literal["continue", "start_new"] | None = None

class ObservationOut(BaseModel):
    observation_id: int
    client_request_id: UUID
    recorded_at: datetime
    recorded_timezone_offset_minutes: int | None
    recorded_local_date: date | None
    status: Literal["saved"]
    created_at: datetime
    photo: ObservationPhotoOut | None
    targets: list[ObservationTargetOut]
```

Parse `targets_json` with `TypeAdapter(list[RegionTargetCreate])`; translate JSON and validation errors to HTTP 422 without exposing stack details.

- [x] **Step 4: Verify OpenAPI and route protection**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observations.py backend/tests/test_app.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/schemas/observation.py backend/app/api/observations.py backend/tests/test_observations.py`

---

### Task 3: Atomic Regional Observation Persistence — IMPLEMENTED

**Files:**
- Modify: `backend/app/services/observation_service.py`
- Modify: `backend/app/api/observations.py`
- Modify: `backend/tests/test_observations.py`
- Modify: `backend/tests/integration/test_observations_persistence.py`

**Interfaces:**
- Produces: `create_region_observation(...) -> (ObservationRecord, list[ObservationTarget], bool)`.
- Produces: `load_observation_targets()` and target-specific `replace_failed_target_note()`.

- [x] **Step 1: Write persistence red tests**

```python
def test_one_photo_creates_each_selected_region_once_and_commits_before_workers(monkeypatch):
    response = client.post(
        "/api/v1/observations",
        data=_region_form(["left_face", "chin"]),
        files=_photo(),
    )
    assert response.status_code == 201
    assert [(t["region_id"], t["status"]) for t in response.json()["targets"]] == [
        ("left_face", "queued"), ("chin", "queued")
    ]
    assert worker_calls == [(left_id, 1), (chin_id, 1)]

def test_text_only_requires_a_note_for_every_selected_region(monkeypatch):
    response = client.post("/api/v1/observations", data=_region_form([
        {"region_id": "forehead", "user_note": "额头有些粗糙"},
        {"region_id": "chin", "user_note": "   "},
    ]))
    assert response.status_code == 422
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observations.py -q`

- [x] **Step 3: Implement one transaction and deterministic local date**

```python
def recorded_local_date(recorded_at: datetime, offset_minutes: int) -> date:
    if not -840 <= offset_minutes <= 840:
        raise HTTPException(status_code=422, detail="invalid timezone offset")
    return (normalize_utc(recorded_at) + timedelta(minutes=offset_minutes)).date()

targets = [
    ObservationTarget(
        record_id=record.id,
        user_id=user_id,
        scope_type="region",
        region_id=item.region_id,
        user_note=note,
        status="queued" if photo else "completed",
        result_source=None if photo else "user_record",
    )
    for item in ordered_targets
]
```

Lookup duplicate UUID before reading file bytes. On first insert, save object then record and all targets; commit once; on DB failure delete only the new object. Return existing immutable target set on duplicate or integrity race.

- [x] **Step 4: Replace full-face-only queries with eager multi-target bundles**

Use `selectinload` or two bounded queries; preserve account filtering and recorded-at order. Map legacy record-level note to the existing full-face target only.

- [x] **Step 5: Verify GREEN and persistence contract**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observations.py backend/tests/integration/test_observations_persistence.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services/observation_service.py backend/app/api/observations.py backend/tests/test_observations.py backend/tests/integration/test_observations_persistence.py`

---

### Task 4: Region AI Contract, Prompt and Boundary Validation — IMPLEMENTED

**Files:**
- Create: `backend/app/schemas/region_observation.py`
- Create: `backend/app/services/region_observation_prompt.py`
- Create: `backend/app/services/region_sanitizer.py`
- Create: `backend/tests/test_region_observation.py`

**Interfaces:**
- Produces: `RegionObservationFacts`, `validate_region_display(facts, region_id)`, `sanitize_region_facts()`.
- Produces prompt/schema versions `region-observation-1.0.0`.

- [x] **Step 1: Write safety and scope red tests**

```python
def test_left_face_output_rejects_right_or_full_face_claims():
    with pytest.raises(ValueError, match="outside_selected_region"):
        validate_region_display(facts(summary="右侧脸和全脸可见变化"), "left_face")

def test_region_prompt_carries_stable_id_boundary_and_user_direction():
    prompt = build_region_system_prompt("left_face")
    assert "region_id: left_face" in prompt
    assert "用户本人真实左侧" in prompt
    assert "不得输出未选区域" in prompt
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_observation.py -q`

- [x] **Step 3: Implement exact seven-field Schema and regional validator**

Reuse the seven fact types from `FullFaceObservationFacts`, but apply both the existing medical/advice validator and region-specific forbidden location tokens across every display field.

```python
def validate_region_display(facts: RegionObservationFacts, region_id: RegionId):
    validate_full_face_display(facts)
    text = "\n".join(_display_parts(facts)).casefold()
    for forbidden in REGION_DEFINITIONS[region_id].forbidden_location_terms:
        if forbidden.casefold() in text:
            raise ValueError(f"outside_selected_region:{forbidden}")
    return facts
```

- [x] **Step 4: Implement second-response field sanitizer**

Drop list items that explicitly name another region, replace unsafe scalars with `无法判断`, rebuild summary from retained current-region fields, and return no usable result when every observable field is removed.

- [x] **Step 5: Verify GREEN**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_observation.py backend/tests/test_full_face_observation.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/schemas/region_observation.py backend/app/services/region_observation_prompt.py backend/app/services/region_sanitizer.py backend/tests/test_region_observation.py`

---

### Task 5: Independent Region Workers and Target-Level Fallback — IMPLEMENTED

**Files:**
- Create: `backend/app/services/region_analysis_service.py`
- Modify: `backend/app/services/observation_worker.py`
- Modify: `backend/app/api/observations.py`
- Modify: `backend/app/services/observation_service.py`
- Modify: `backend/tests/test_observation_worker.py`
- Modify: `backend/tests/test_observations.py`

**Interfaces:**
- Produces: `analyze_region_photo(db, target, record, photo)`.
- Worker dispatches `full_face` history or `region` target without mixing prompts.

- [x] **Step 1: Write independent state red tests**

```python
@pytest.mark.asyncio
async def test_two_region_workers_finish_independently():
    await run_observation_target(left.id, session_factory, left_success)
    await run_observation_target(chin.id, session_factory, chin_failure)
    assert left.status == "completed"
    assert chin.status == "needs_input"
    assert record.status == "saved"

def test_failed_target_note_does_not_change_sibling(monkeypatch):
    response = client.put(f"/observations/{record.id}/targets/{chin.id}/note", json={"user_note": "下巴有颗粒感"})
    assert response.json()["targets"][0]["status"] == "completed"
    assert response.json()["targets"][1]["result_source"] == "user_record"
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observation_worker.py backend/tests/test_observations.py -q`

- [x] **Step 3: Implement region gateway path**

Use original stored photo, prepared data URL, region prompt and mock fixture scoped to the target. Persist `kind=region_observation` logs with observation, target, photo, `region_id`, prompt/schema versions and sanitized request payload.

- [x] **Step 4: Generalize worker outcome versions**

```python
@dataclass(frozen=True)
class ObservationAnalysisOutcome:
    success: bool
    prompt_version: str
    schema_version: str
    trace_id: str | None = None
    facts: dict[str, Any] | None = None
    provider: str | None = None
    model: str | None = None
    failure_code: str | None = None
```

Store outcome versions instead of full-face constants. Keep the atomic queued claim and no-op for non-queued targets.

- [x] **Step 5: Verify GREEN and no cross-target mutation**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_observation_worker.py backend/tests/test_observations.py backend/tests/test_region_observation.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/services backend/app/api/observations.py backend/tests/test_observation_worker.py backend/tests/test_observations.py`

---

### Task 6: Mobile Region Catalog, Draft and Last Selection — IMPLEMENTED

**Files:**
- Create: `mobile/src/lib/region-catalog.ts`
- Create: `mobile/src/lib/region-selection-storage.ts`
- Modify: `mobile/src/lib/observation-api.ts`
- Modify: `mobile/src/lib/observation-flow.ts`
- Create: `mobile/tests/region-catalog.test.mjs`
- Modify: `mobile/tests/observation-api.test.mjs`
- Modify: `mobile/tests/observation-flow.test.mjs`

**Interfaces:**
- Produces: `RegionId`, `REGIONS`, confirmed regional `ObservationDraft`, `load/saveLastRegionSelection()`.
- Produces API DTO `Observation.targets` and target-level note path.

- [x] **Step 1: Write mobile contract red tests**

```javascript
test('region catalog keeps user-left and user-right stable', () => {
  assert.deepEqual(REGIONS.map(({ id }) => id), [
    'forehead', 'left_face', 'right_face', 'nose_area', 'mouth_area', 'chin'
  ]);
  assert.equal(regionById('left_face').label, '你的左侧脸');
});

test('changing regions invalidates save confirmation', () => {
  const confirmed = confirmRegionSelection(selectRegions(draft, ['left_face']));
  assert.equal(canSaveRegionalDraft(confirmed), true);
  assert.equal(canSaveRegionalDraft(selectRegions(confirmed, ['right_face'])), false);
});
```

- [x] **Step 2: Verify RED**

Run: `npm run test:unit -- region-catalog observation-api observation-flow`

- [x] **Step 3: Implement immutable draft and API form**

```typescript
export type ObservationDraft = {
  clientRequestId: string;
  recordedAt: string;
  timezoneOffsetMinutes: number;
  photoUri: string | null;
  takenAt: string | null;
  selectedRegions: RegionId[];
  confirmedRegions: RegionId[] | null;
  notes: Partial<Record<RegionId, string>>;
};
```

`buildObservationForm()` appends `recorded_timezone_offset_minutes` and JSON-stringified targets. No-photo validation checks every selected region note; photo mode permits blank regional notes.

- [x] **Step 4: Implement SecureStore last-selection adapter**

Use key `skin-care-agent.last-region-selection`; validate parsed IDs through the catalog and return an empty list on missing or invalid local data. Save only after server success.

- [x] **Step 5: Verify GREEN**

Run: `npm run test:unit`

Run: `npm run typecheck`

Run: `npm run lint`

---

### Task 7: Photo → Region Selection → Confirmation UI — IMPLEMENTED

**Files:**
- Modify: `mobile/src/app/observation/new.tsx`
- Create: `mobile/src/components/region-selector.tsx`
- Modify: `mobile/src/app/(tabs)/observe.tsx`
- Modify: `mobile/tests/observation-flow.test.mjs`

**Interfaces:**
- Consumes regional draft helpers and catalog.
- Produces one explicit confirmation screen before network save.

- [x] **Step 1: Add red presenter/state tests for the wizard**

```javascript
test('regional draft cannot save before an unchanged explicit confirmation', () => {
  const selected = selectRegions(photoDraft(), ['left_face', 'chin']);
  assert.equal(canSaveRegionalDraft(selected), false);
  const confirmed = confirmRegionSelection(selected);
  assert.equal(canSaveRegionalDraft(confirmed), true);
  assert.equal(canSaveRegionalDraft(selectRegions(confirmed, ['chin'])), false);
});

test('text-only draft requires a note for each confirmed region', () => {
  const draft = confirmRegionSelection(selectRegions(textDraft(), ['forehead', 'chin']));
  assert.match(regionalDraftError(setRegionNote(draft, 'forehead', '额头粗糙')), /下巴/);
});
```

- [x] **Step 2: Verify RED**

Run: `npm run test:unit`

- [x] **Step 3: Implement selector and confirmation**

Render six accessible toggle buttons in fixed order. Left/right copy uses “本人真实左右”；show each boundary. Confirmation displays the final selected names, source type and the sentence “未选择的区域只表示本次没有观察”。

Keep `CameraView facing="front" mirror={false}`. Change camera title from “单张全脸照片” to “拍摄本次观察照片”；do not infer region from image coordinates.

- [x] **Step 4: Save only the confirmed payload**

On success, save last selection then `router.replace` to the observation detail. On failure, retain photo, UUID, notes, selection and confirmation.

- [x] **Step 5: Verify mobile checks**

Run: `npm run test:unit`

Run: `npm run typecheck`

Run: `npm run lint`

Run: `git diff --check`

---

### Task 8: Multi-Target Detail, Polling and History Cards — IMPLEMENTED

**Files:**
- Modify: `mobile/src/app/observation/[observationId].tsx`
- Modify: `mobile/src/lib/observation-flow.ts`
- Modify: `mobile/src/components/observation-list-item.tsx`
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Modify: `mobile/tests/observation-flow.test.mjs`
- Modify: `mobile/tests/observation-list-layout.test.mjs`

**Interfaces:**
- Produces: `presentObservationTarget(target)`, `shouldPollObservationTargets(targets)` and aggregate card status.

- [x] **Step 1: Write multi-target red tests**

```javascript
test('polling continues while any region is queued or processing', () => {
  assert.equal(shouldPollObservationTargets([
    target('left_face', 'completed'), target('chin', 'processing')
  ]), true);
});

test('one failed region keeps sibling photo facts visible', () => {
  const cards = presentObservationTargets(observationWithTargets([
    photoTarget('left_face'), failedTarget('chin')
  ]));
  assert.deepEqual(cards.map(card => card.regionId), ['left_face', 'chin']);
  assert.equal(cards[0].kind, 'photo');
  assert.equal(cards[1].kind, 'needs_input');
});
```

- [x] **Step 2: Verify RED**

Run: `npm run test:unit`

- [x] **Step 3: Implement per-region detail cards**

Show region label, independent status/source/seven facts and a target-specific note box. PUT uses observation and target IDs. Old full-face target renders one “历史全脸记录” card.

- [x] **Step 4: Implement aggregate list copy**

Cards list selected region labels and factual aggregate status such as “2 个区域已完成，1 个需要补充”，without concatenating AI summaries into a full-face conclusion.

- [x] **Step 5: Verify GREEN**

Run: `npm run test:unit`

Run: `npm run typecheck`

Run: `npm run lint`

---

### Task 9: Slice 2 PostgreSQL and Local HTTP Closure — VERIFIED

**Files:**
- Create: `backend/tests/integration/test_region_observations_persistence.py`
- Create: `backend/scripts/verify_region_observation_flow.py`
- Modify: `docs/current_status.md`
- Modify: `OVERNIGHT_PROGRESS.md`

**Interfaces:**
- Script exercises real FastAPI HTTP, PostgreSQL, object storage and gateway route with a deterministic local provider.

- [x] **Step 1: Write PostgreSQL integration red test**

Persist one photo record with `left_face` and `chin`, reopen with a fresh Session, assert one record/one photo/two targets; retry UUID and assert counts unchanged. Complete one target and fail the other; reopen again and assert independent states.

- [x] **Step 2: Verify RED before migration**

Run the focused integration test against a disposable migrated schema and confirm missing 0014 fields or service behavior.

- [x] **Step 3: Apply 0014 to disposable schema and run round trip**

Run upgrade head → downgrade 0013 → upgrade head. Compare public schema fingerprint before and after temporary schema cleanup.

- [x] **Step 4: Implement and run local closure script**

The script registers or seeds a disposable local user, accepts required consents, uploads a generated neutral JPEG with two regions, polls until both terminal, restarts its HTTP client, reloads the same ID, retries the same UUID, and submits a note only to a forced failed target. It asserts no new full-face target and no duplicate AI job.

- [x] **Step 5: Slice 2 checkpoint**

Run backend full pytest/Ruff and mobile full unit/typecheck/lint. Record exact counts and local closure evidence. If green, proceed immediately to Task 10.

---

### Task 10: Region Event Domain and 30-Day Preview — IMPLEMENTED

**Files:**
- Create: `backend/app/models/region_event.py`
- Create: `backend/app/db/migrations/versions/0015_region_events.py`
- Create: `backend/app/schemas/region_event.py`
- Create: `backend/app/services/region_event_service.py`
- Create: `backend/tests/test_region_events.py`
- Modify: `backend/app/models/observation.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Produces: `RegionEvent(status=pending|current|ended)` and `preview_region_event_assignments()`.
- Adds `ObservationTarget.region_event_id`.

- [x] **Step 1: Write 30-day and uniqueness red tests**

```python
@pytest.mark.parametrize(("days", "action"), [(29, "auto_continue"), (30, "choice_required")])
def test_event_preview_uses_device_local_calendar_days(days, action):
    preview = preview_for(current(last_on=date(2026, 7, 1)), date(2026, 7, 1) + timedelta(days=days))
    assert preview.action == action

def test_event_model_allows_only_one_current_and_one_pending_index():
    assert _index("uq_region_events_user_region_current").unique is True
    assert _index("uq_region_events_user_region_pending").unique is True
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_events.py -q`

- [x] **Step 3: Implement event model and 0015**

Create user/region/status/previous/date/end columns, fixed region/status/end-reason constraints, partial unique current and pending indexes, and target FK/index. Downgrade removes only 0015 artifacts.

- [x] **Step 4: Implement preview rules**

Return ordered region previews. Pending event means `auto_continue` to pending. Current delta `<30` is `auto_continue`; `>=30` is `choice_required`; no open event is `auto_new`.

- [x] **Step 5: Verify GREEN**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_events.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/models/region_event.py backend/app/schemas/region_event.py backend/app/services/region_event_service.py backend/app/db/migrations/versions/0015_region_events.py backend/tests/test_region_events.py`

---

### Task 11: Event Reservation, Activation and Ending — IMPLEMENTED

**Files:**
- Modify: `backend/app/services/region_event_service.py`
- Modify: `backend/app/services/observation_service.py`
- Modify: `backend/app/services/observation_worker.py`
- Modify: `backend/tests/test_region_events.py`
- Modify: `backend/tests/test_observation_worker.py`

**Interfaces:**
- Produces: `reserve_event_for_target()`, `activate_valid_target_event()`, `end_region_event()`.

- [x] **Step 1: Write event lifecycle red tests**

```python
def test_pending_event_activates_only_after_target_becomes_effective():
    event, target = reserved_pending_event(target_status="needs_input")
    assert visible_events() == []
    complete_with_user_note(target, "下巴有颗粒感")
    assert event.status == "current"
    assert event.last_valid_local_date == target.record.recorded_local_date

def test_start_new_at_30_days_replaces_current_once():
    previous, pending, target = reserved_start_new(days_since_last=30)
    activate_valid_target_event(target.id)
    activate_valid_target_event(target.id)
    assert previous.status == "ended"
    assert previous.end_reason == "replaced"
    assert pending.status == "current"
    assert current_event_count(previous.user_id, previous.region_id) == 1
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_events.py backend/tests/test_observation_worker.py -q`

- [x] **Step 3: Reserve event membership in Observation transaction**

Re-evaluate preview while holding current/pending event rows. Missing or stale choice raises 409 before record commit. Attach target to current or a unique pending event; no AI call decides membership.

- [x] **Step 4: Activate after effective completion**

Call activation after worker commits valid photo facts and after target-level user note. Lock target/event, return when already activated, update max last date, and replace previous current only when activating its pending successor.

- [x] **Step 5: Verify GREEN and race constraints**

Run focused unit tests, then PostgreSQL tests that attempt two current events and two pending events for one user/region and expect unique violations.

---

### Task 12: Region Event APIs and Account Isolation — IMPLEMENTED

**Files:**
- Create: `backend/app/api/region_events.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/region_event_service.py`
- Modify: `backend/tests/test_region_events.py`
- Modify: `backend/tests/test_app.py`

**Interfaces:**
- `POST /region-events/preview`
- `GET /region-events?status=current|ended`
- `GET /region-events/{event_id}`
- `POST /region-events/{event_id}/end`

- [x] **Step 1: Write API red tests**

```python
def test_event_detail_contains_only_effective_owned_timepoints(client):
    response = client.get(f"/api/v1/region-events/{event_id}")
    assert response.status_code == 200
    assert [row["target_id"] for row in response.json()["timepoints"]] == [completed_id, user_note_id]
    assert pending_target_id not in [row["target_id"] for row in response.json()["timepoints"]]

def test_region_event_is_hidden_from_another_user(other_client):
    assert other_client.get(f"/api/v1/region-events/{event_id}").status_code == 404
    assert other_client.post(f"/api/v1/region-events/{event_id}/end").status_code == 404
```

- [x] **Step 2: Verify RED**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_events.py backend/tests/test_app.py -q`

- [x] **Step 3: Implement authenticated routes and DTO mapping**

Reuse signed photo URLs and target presenters; never expose pending events, failure codes, trace IDs or raw AI responses. Event detail includes only targets that satisfy the effective-timepoint predicate.

- [x] **Step 4: Verify GREEN**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_region_events.py backend/tests/test_app.py -q`

Run: `backend/.venv/Scripts/python.exe -m ruff check backend/app/api/region_events.py backend/app/services/region_event_service.py backend/tests/test_region_events.py`

---

### Task 13: Mobile Event Confirmation and Review — IMPLEMENTED

**Files:**
- Create: `mobile/src/lib/region-event-api.ts`
- Create: `mobile/src/lib/region-event-flow.ts`
- Create: `mobile/src/app/region-event/[eventId].tsx`
- Modify: `mobile/src/app/observation/new.tsx`
- Modify: `mobile/src/app/(tabs)/observe.tsx`
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Create: `mobile/tests/region-event-api.test.mjs`
- Create: `mobile/tests/region-event-flow.test.mjs`

**Interfaces:**
- Produces preview decision map, event list/detail/end API and one aggregated 30-day confirmation step.

- [x] **Step 1: Write mobile event red tests**

Test 29-day auto continuation, 30-day choice requirement, multiple choice-required regions summarized once, decisions serialized per target, event cards omit pending, and ending copy contains no medical completion language.

- [x] **Step 2: Verify RED**

Run: `npm run test:unit`

- [x] **Step 3: Integrate preview into final confirmation**

After region confirmation and before save, request preview. If any region requires a choice, show one page with all such regions and per-region “继续这段记录/开始一段新记录”. A 409 returns latest preview and preserves photo/draft.

- [x] **Step 4: Add event organization and review UI**

Observe shows current events. History shows region events first and a separate “历史全脸记录” section. Event detail lists timepoints with original evidence, region facts, source and status, and exposes “结束这段记录” only for current events.

- [x] **Step 5: Verify GREEN**

Run: `npm run test:unit`

Run: `npm run typecheck`

Run: `npm run lint`

---

### Task 14: Slice 3 Persistence Closure and Final Audit — VERIFIED

**Files:**
- Create: `backend/tests/integration/test_region_events_persistence.py`
- Modify: `backend/scripts/verify_region_observation_flow.py`
- Modify: `docs/current_status.md`
- Modify: `project_background.md`
- Modify: `OVERNIGHT_PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-08-21-full-face-observation-slice-1.md`

**Interfaces:** Final verification evidence only; no new product scope.

- [x] **Step 1: Add PostgreSQL event lifecycle integration**

Across fresh sessions verify first event, 29-day continuation, 30-day continue, 30-day new event, active end, next event, one current invariant, ordered timepoints and cross-user 404.

- [x] **Step 2: Run 0014/0015 migration round trip**

On a disposable schema run upgrade head → downgrade 0013 → upgrade head. Confirm legacy full-face rows remain readable after upgrade and public schema fingerprint is unchanged after cleanup.

- [x] **Step 3: Run the complete local closure**

Exercise generated photo with two regions, independent terminal statuses, client restart recovery, target note, first event activation, second record continuation, 30-day new-event decision, event ending and history reload through local HTTP/PostgreSQL/storage/gateway.

- [x] **Step 4: Run full verification**

Run:

```powershell
backend\.venv\Scripts\python.exe -m pytest -q
backend\.venv\Scripts\python.exe -m ruff check backend\app backend\tests backend\scripts
Set-Location mobile
npm run test:unit
npm run typecheck
npm run lint
Set-Location ..
git diff --check
git status --short
```

- [x] **Step 5: Re-read goal and acceptance conditions**

Confirm evidence for region dictionary, physical left/right, pre-save confirmation, multi-target idempotency, per-region async recovery, AI safety/scope boundary, event uniqueness, 30-day choices, active end and event/timepoint review. Record the external restriction that no new third-party GLM call was made.

- [x] **Step 6: Update current documents**

Set Slice 1 plan to `COMPLETED/FROZEN`, this plan to `COMPLETED` only after every local condition passes, and `docs/current_status.md` to the exact verified counts and remaining external provider limitation.

