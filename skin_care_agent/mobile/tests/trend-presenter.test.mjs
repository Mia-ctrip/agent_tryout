import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTrendDay,
  latestRecordedTrendPoint,
  recordedTrendPoints,
  selectTrendOverviewRegions,
  trendPointBarPercent,
  trendRegionTitle,
} from '../src/lib/trend-presenter.ts';

const dailyPoints = [
  {
    day: '2026-07-27',
    source: null,
    check_in_id: null,
    overall_severity: null,
    skin_health_index: null,
    total_estimated_count: 0,
    analysis_count: 0,
    check_in_count: 0,
  },
  {
    day: '2026-07-28',
    source: 'legacy',
    check_in_id: null,
    overall_severity: 3,
    skin_health_index: 61,
    total_estimated_count: 8,
    analysis_count: 1,
    check_in_count: 0,
  },
  {
    day: '2026-07-30',
    source: 'check_in',
    check_in_id: 17,
    overall_severity: 2,
    skin_health_index: 74,
    total_estimated_count: 5,
    analysis_count: 3,
    check_in_count: 1,
  },
];

test('recordedTrendPoints removes empty calendar days', () => {
  assert.deepEqual(
    recordedTrendPoints(dailyPoints).map((point) => point.day),
    ['2026-07-28', '2026-07-30'],
  );
});

test('latestRecordedTrendPoint returns the newest recorded day', () => {
  assert.equal(latestRecordedTrendPoint(dailyPoints)?.check_in_id, 17);
  assert.equal(latestRecordedTrendPoint([]), null);
});

test('trendPointBarPercent clamps invalid health index values', () => {
  assert.equal(trendPointBarPercent(74), 74);
  assert.equal(trendPointBarPercent(-4), 0);
  assert.equal(trendPointBarPercent(120), 100);
  assert.equal(trendPointBarPercent(null), 0);
});

test('trend labels format dates and three-view regions', () => {
  assert.equal(formatTrendDay('2026-07-08'), '7月8日');
  assert.equal(trendRegionTitle('left', 'right_cheek'), '左侧 · 右颊');
  assert.equal(trendRegionTitle('legacy', 'chin'), '下巴');
  assert.equal(trendRegionTitle('front', 'mouth_area'), '正面 · 口周');
  assert.equal(trendRegionTitle('right', 'jaw'), '右侧 · 下颌');
  assert.equal(trendRegionTitle('left', 'temple'), '左侧 · 太阳穴');
});

test('trend overview keeps one region from every available camera view', () => {
  const regions = [
    { view_type: 'front', region: 'forehead' },
    { view_type: 'front', region: 'nose' },
    { view_type: 'front', region: 'chin' },
    { view_type: 'front', region: 'mouth_area' },
    { view_type: 'left', region: 'temple' },
    { view_type: 'right', region: 'jaw' },
    { view_type: 'legacy', region: 'right_cheek' },
  ];

  const selected = selectTrendOverviewRegions(regions, 6);

  assert.equal(selected.length, 6);
  const selectedViews = new Set(
    selected.map((region) => region.view_type),
  );
  assert.equal(selectedViews.has('front'), true);
  assert.equal(selectedViews.has('left'), true);
  assert.equal(selectedViews.has('right'), true);
});
