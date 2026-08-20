import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTrendGenerationGuard,
  DEFAULT_TREND_RANGE_DAYS,
  loadCurrentTrend,
  trendScreenState,
} from '../src/lib/trend-flow.ts';

test('trend generation guard rejects an older range response', () => {
  const guard = createTrendGenerationGuard();
  const firstRange = guard.begin();
  const secondRange = guard.begin();

  assert.equal(guard.isCurrent(firstRange), false);
  assert.equal(guard.isCurrent(secondRange), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(secondRange), false);
});

test('trend screen defaults to 30 days and derives visible states', () => {
  assert.equal(DEFAULT_TREND_RANGE_DAYS, 30);
  assert.equal(trendScreenState(true, null, false, false), 'loading');
  assert.equal(trendScreenState(false, 'offline', false, false), 'error');
  assert.equal(trendScreenState(false, null, true, false), 'empty');
  assert.equal(trendScreenState(false, null, true, true), 'ready');
});

test('an older range load cannot commit after a newer load starts', async () => {
  const guard = createTrendGenerationGuard();
  const commits = [];
  let resolveOld;
  let resolveNew;
  const oldResult = new Promise((resolve) => {
    resolveOld = resolve;
  });
  const newResult = new Promise((resolve) => {
    resolveNew = resolve;
  });

  const oldLoad = loadCurrentTrend({
    guard,
    load: () => oldResult,
    onSuccess: (value) => commits.push(value),
  });
  const newLoad = loadCurrentTrend({
    guard,
    load: () => newResult,
    onSuccess: (value) => commits.push(value),
  });

  resolveNew('90 days');
  await newLoad;
  resolveOld('7 days');
  await oldLoad;

  assert.deepEqual(commits, ['90 days']);
});
