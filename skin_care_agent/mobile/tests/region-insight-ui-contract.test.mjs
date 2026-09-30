import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const screen = source('../src/app/region-event/[eventId].tsx');
const comparison = source('../src/components/region-comparison.tsx');
const trend = source('../src/components/region-trend-card.tsx');

test('comparison pair is chosen deterministically and requested from the backend', () => {
  assert.doesNotMatch(screen, /Math\.random/);
  assert.match(screen, /defaultComparisonPair\(photos, insights\?\.default_pair\)/);
  assert.match(screen, /createRegionComparison\(request, eventId/);
  assert.match(screen, /getRegionComparison\(request, eventId, current\.comparison_id\)/);
  assert.match(screen, /assignComparisonSlot\(photos, pair, activeSlot, targetId\)/);
});

test('comparison card renders every state and keeps side facts for insufficient results', () => {
  assert.match(comparison, /buildComparisonView\(comparison\)/);
  for (const kind of ["'processing'", "'failed'", "'insufficient'"]) assert.ok(comparison.includes(kind), kind);
  assert.match(comparison, /label="重新对比"/);
  assert.match(comparison, /<SideFacts earlier=\{earlier\} later=\{later\} \/>/);
  assert.match(comparison, /INSIGHT_BOUNDARY_TEXT/);
  assert.match(comparison, /accessibilityState=\{\{ selected: chosen, disabled \}\}/);
  // Selected chips stay tappable (switch slot) instead of rendering as disabled.
  assert.match(comparison, /const disabled = !chosen && /);
});

test('event view shows progress or trend card and refreshes stale trends in the background', () => {
  assert.match(screen, /<RegionTrendCard insights=\{insights\}/);
  assert.match(screen, /buildTrendProgressText\(insights\.trend_progress\)/);
  assert.match(screen, /trend_status === 'stale'\) current = await refreshRegionTrend/);
  assert.match(trend, /有新的记录，正在更新/);
  assert.match(trend, /onSelectTimepoint\(item\.targetId\)/);
});

test('insight cards never pull product use or life context into conclusions', () => {
  for (const file of [comparison, trend]) {
    assert.doesNotMatch(file, /productUse|ProductUse|lifeContext|life_context/);
  }
});
