# Unified Sage Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every mobile route and shared component to one accessible sage semantic theme without changing product behavior.

**Architecture:** `constants/theme.ts` becomes the canonical palette and continues to expose legacy key names as semantic aliases. Product and observation theme modules become compatibility mappings over that palette, while retaining only their genuinely domain-specific translucent overlay values. A static contract test protects the baseline palette and prevents the retired purple palette from returning.

**Tech Stack:** React Native 0.86, Expo SDK 57, Expo Router, TypeScript, Node test runner, Expo lint.

**Spec:** `docs/superpowers/specs/2026-08-30-unified-sage-theme-design.md`

## Global Constraints

- Apply the exact semantic palette from the approved spec: `#9BAD50`, `#71813C`, `#F8F0DD`, `#FFFDF7`, `#EDF1DF`, `#E8C76A`, `#46502C`, `#7A8069`, `#DED8C6`, `#6A3E35`.
- Cover every accessible mobile route, including legacy routes; do not change navigation, data, state machines, accessibility labels, animation behavior, or image pixels.
- Keep photo and camera content neutral; transparent camera/scanner layers are the only permitted local color exceptions.
- Do not install dependencies, alter backend code, run database migrations, or commit changes.
- Verify with `npm run test:unit`, `npm run typecheck`, `npm run lint`, and Expo static export when available.

---

### Task 1: Establish one theme contract and compatibility mappings

**Files:**
- Create: `mobile/tests/theme-contract.test.mjs`
- Modify: `mobile/src/constants/theme.ts`
- Modify: `mobile/src/constants/product-theme.ts`
- Modify: `mobile/src/constants/observation-theme.ts`
- Modify: `mobile/app.json`

**Interfaces:**
- Consumes: Existing `colors`, `productColors`, `observationColors`, `spacing`, and `radii` imports throughout `mobile/src`.
- Produces: Canonical sage roles in `colors`; compatible alias keys for old callers; product/observation mappings derived from `colors` rather than duplicate opaque palette literals.

- [ ] **Step 1: Write the failing theme contract test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { colors } from '../src/constants/theme.ts';
import { productColors } from '../src/constants/product-theme.ts';
import { observationColors } from '../src/constants/observation-theme.ts';

test('all public theme facades share the approved sage semantic palette', () => {
  assert.equal(colors.background, '#F8F0DD');
  assert.equal(colors.primary, '#71813C');
  assert.equal(colors.iris, '#9BAD50');
  assert.equal(colors.text, '#46502C');
  assert.equal(productColors.actionPrimary, colors.primary);
  assert.equal(productColors.brand, colors.iris);
  assert.equal(observationColors.background, colors.background);
});
```

- [ ] **Step 2: Run the contract test and confirm it fails against the retired purple palette**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-isolation=none tests/theme-contract.test.mjs`

Expected: FAIL because `colors.background`, `colors.primary`, and `colors.iris` still hold the legacy values.

- [ ] **Step 3: Implement the canonical palette and compatibility mappings**

```ts
export const colors = {
  iris: '#9BAD50',
  irisStrong: '#71813C',
  lavender: '#EDF1DF',
  sage: '#9BAD50',
  amber: '#E8C76A',
  warmGray: '#46502C',
  warmWhite: '#FFFDF7',
  background: '#F8F0DD',
  surface: '#FFFDF7',
  surfaceMuted: '#EDF1DF',
  text: '#46502C',
  textMuted: '#7A8069',
  primary: '#71813C',
  primaryPressed: '#46502C',
  primarySoft: '#EDF1DF',
  border: '#DED8C6',
  danger: '#6A3E35',
  dangerSoft: '#F2E2D4',
  white: '#FFFDF7',
} as const;
```

Map all opaque `productColors` entries to these values. Map `observationColors` base colors to the same values and preserve only translucent visual-layer strings (camera mask, status scrim, overlay surface) plus portrait-neutral roles. Change `app.json` launch backgrounds to `#F8F0DD`.

- [ ] **Step 4: Run the contract test and typecheck**

Run: `npm run test:unit -- --test-name-pattern="theme|palette" && npm run typecheck`

Expected: PASS; every existing import typechecks without a renamed key.

### Task 2: Remove retired palette leakage from shared app chrome and legacy components

**Files:**
- Modify: `mobile/src/app/_layout.tsx`
- Modify: `mobile/src/app/(tabs)/_layout.tsx`
- Modify: `mobile/src/components/app-button.tsx`
- Modify: `mobile/src/components/app-screen.tsx`
- Modify: `mobile/src/components/brand-header.tsx`
- Modify: `mobile/src/components/form-field.tsx`
- Modify: `mobile/src/components/inline-notice.tsx`
- Modify: `mobile/src/components/life-context-selector.tsx`
- Modify: `mobile/src/components/observation-list-item.tsx`
- Modify: `mobile/src/components/product-image.tsx`
- Modify: `mobile/src/components/product-use-card.tsx`
- Modify: `mobile/src/components/region-event-card.tsx`
- Modify: `mobile/src/components/timeline-item-card.tsx`

**Interfaces:**
- Consumes: Task 1 semantic `colors` exports.
- Produces: All shared surfaces, selected labels, buttons, inputs, notices, and navigation containers render from the shared sage theme.

- [ ] **Step 1: Add a failing retired-palette regression check**

```js
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const retired = /#8F85CE|#6F63B7|#F2EFF8|rgba\(111,\s*99,\s*183/i;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)]
  )).filter((file) => /\.(ts|tsx)$/.test(file));
}

test('mobile source no longer contains the retired purple palette', () => {
  const offenders = sourceFiles(new URL('../src', import.meta.url).pathname)
    .filter((file) => retired.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: Run the regression check and confirm it identifies legacy color leakage**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-isolation=none tests/theme-contract.test.mjs`

Expected: FAIL and report `constants/theme.ts` and `components/observation-list-item.tsx` at minimum.

- [ ] **Step 3: Replace shared component aliases and local retired-color fills**

Use `colors.primary`, `colors.primarySoft`, `colors.iris`, `colors.surface`, `colors.background`, and `colors.dangerSoft` for equivalent semantic roles. Replace the selected observation-list background with the shared selected soft surface. Keep component APIs unchanged.

- [ ] **Step 4: Run the regression check**

Run: `npm run test:unit -- --test-name-pattern="theme|palette"`

Expected: PASS; the retired palette no longer occurs under `mobile/src`.

### Task 3: Normalize all route surfaces and state colors

**Files:**
- Modify: `mobile/src/app/index.tsx`
- Modify: `mobile/src/app/login.tsx`
- Modify: `mobile/src/app/register.tsx`
- Modify: `mobile/src/app/consents.tsx`
- Modify: `mobile/src/app/home.tsx`
- Modify: `mobile/src/app/check-in.tsx`
- Modify: `mobile/src/app/analysis/[checkInId].tsx`
- Modify: `mobile/src/app/diary/[checkInId].tsx`
- Modify: `mobile/src/app/trends.tsx`
- Modify: `mobile/src/app/product-catalog/[standardProductId].tsx`
- Modify: `mobile/src/app/product-use/new.tsx`
- Modify: `mobile/src/app/region-event/[eventId].tsx`
- Modify: `mobile/src/app/(tabs)/observe.tsx`
- Modify: `mobile/src/app/(tabs)/history.tsx`
- Modify: `mobile/src/app/(tabs)/me.tsx`

**Interfaces:**
- Consumes: Task 1 `colors` compatibility aliases.
- Produces: Each legacy and primary route uses cream backgrounds, ivory surfaces, dark-green primary controls, sage selections, and readable deep-moss text.

- [ ] **Step 1: Expand the contract test for app configuration and opaque route colors**

```js
test('Expo launch configuration uses the same cream background as the app', () => {
  const appConfig = readFileSync(new URL('../app.json', import.meta.url), 'utf8');
  assert.match(appConfig, /"backgroundColor": "#F8F0DD"/);
});
```

Also make the source scan reject `#E6ECE8`, `#F1F4F2`, and `#FFD4D0` after their route roles are mapped to `colors.white`, `colors.dangerSoft`, or an explicit semantic token.

- [ ] **Step 2: Run the contract test and confirm it fails on legacy route literals**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-isolation=none tests/theme-contract.test.mjs`

Expected: FAIL with the old pale-green and pink values from check-in, analysis, or trends.

- [ ] **Step 3: Map route-local color use to semantic roles**

Replace hardcoded opaque text, icon, tint, border, card, and action values with `colors` roles. Preserve transparent camera/media overlays only where the display requires it; select their base tone from `colors.text` or `colors.surface` instead of a stale palette literal. Do not alter conditional rendering or event handlers.

- [ ] **Step 4: Run route/theme contract and focused unit tests**

Run: `npm run test:unit -- --test-name-pattern="theme|palette|camera mask|analysis scan"`

Expected: PASS; scans use the sage-derived visual values and no legacy opaque color remains.

### Task 4: Consolidate product and observation feature-specific styling

**Files:**
- Modify: `mobile/src/app/(tabs)/products.tsx`
- Modify: `mobile/src/app/product/[productId].tsx`
- Modify: `mobile/src/app/product/new.tsx`
- Modify: `mobile/src/app/observation/_layout.tsx`
- Modify: `mobile/src/app/observation/new.tsx`
- Modify: `mobile/src/app/observation/[observationId].tsx`
- Modify: `mobile/src/components/custom-product-form.tsx`
- Modify: `mobile/src/components/personal-product-card.tsx`
- Modify: `mobile/src/components/product-search-picker.tsx`
- Modify: `mobile/src/components/product-search-result-row.tsx`
- Modify: `mobile/src/components/region-selector.tsx`
- Modify: `mobile/src/components/swipeable-product-row.tsx`
- Modify: `mobile/src/components/analysis-scanner.tsx`
- Modify: `mobile/src/components/camera-guide-overlay.tsx`
- Modify: `mobile/src/components/camera-start-panel.tsx`
- Modify: `mobile/src/components/face-region-map.tsx`
- Modify: `mobile/src/components/observation-action-bar.tsx`
- Modify: `mobile/src/components/observation-result.tsx`
- Modify: `mobile/src/components/region-choice-bar.tsx`
- Modify: `mobile/src/lib/face-analysis-visual.ts`

**Interfaces:**
- Consumes: Task 1 product and observation compatibility mappings.
- Produces: Product and observation workflows derive opaque colors from the canonical palette, while scanner and camera transparency stay accessible and neutral.

- [ ] **Step 1: Add assertions for feature facade consistency**

```js
test('product and observation primary actions retain the shared deep green', () => {
  assert.equal(productColors.actionPrimary, '#71813C');
  assert.equal(observationColors.action, '#71813C');
  assert.equal(observationColors.sage, '#9BAD50');
  assert.equal(observationColors.scrimText, '#FFFDF7');
});
```

- [ ] **Step 2: Run the test and confirm it fails before the feature aliases are migrated**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-isolation=none tests/theme-contract.test.mjs`

Expected: FAIL because observation-specific `sage` is still `#7F9465`.

- [ ] **Step 3: Align feature styles and SVG drawing colors**

Derive `observationColors.sage`, `forest`, `amber`, `warmLine`, status dots, selected region fills, scanner completion borders, and SVG selected/unselected strokes from shared semantic roles. Keep camera and scanner overlays translucent, but switch their base colors to the approved deep-moss, ivory, sage, and honey values. Do not recolor photo pixels.

- [ ] **Step 4: Run the feature unit tests**

Run: `npm run test:unit -- --test-name-pattern="theme|palette|region choices|overlay|analysis scan|camera mask"`

Expected: PASS; region overlays continue to distinguish selected/unselected states and scanner/camera helpers remain structurally intact.

### Task 5: Verify application-wide build and visual consistency

**Files:**
- Modify: `docs/current_status.md` only if all verification commands produce passing evidence.

**Interfaces:**
- Consumes: Tasks 1–4 completed code and test contract.
- Produces: Verified theme migration evidence; no progress claim without command output.

- [ ] **Step 1: Run the entire mobile unit suite**

Run: `npm run test:unit`

Expected: PASS with no regressions.

- [ ] **Step 2: Run static checks**

Run: `npm run typecheck && npm run lint`

Expected: both commands exit successfully.

- [ ] **Step 3: Build static routes for a route-level regression check**

Run: `npx expo export --platform web --output-dir dist-theme-check`

Expected: successful static export for all discovered routes; remove `dist-theme-check` only after confirming its resolved path is inside `mobile`.

- [ ] **Step 4: Inspect visual checkpoints at the mobile target viewport**

Check launch/shell, all four tabs, login, product detail/new, product use, observation new/result, and legacy analysis/trends. Confirm cream content backgrounds, ivory cards, deep-green primary actions, sage selections, sufficient text contrast, neutral images, and no high-saturation purple remain.

- [ ] **Step 5: Record only verified evidence**

If all checks pass, update the theme bullet and latest verification row in `docs/current_status.md` with the exact commands and outcomes. Do not change the existing Slice 4A ACTIVE plan.
