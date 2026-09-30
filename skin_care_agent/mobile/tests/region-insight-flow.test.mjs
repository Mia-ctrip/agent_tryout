import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignComparisonSlot,
  buildComparisonView,
  buildTrendProgressText,
  buildTrendView,
  comparisonCandidates,
  defaultComparisonPair,
  describeEvidence,
  INSIGHT_BOUNDARY_TEXT,
} from '../src/lib/region-insight-flow.ts';
import {
  createRegionComparison,
  getRegionComparison,
  getRegionInsights,
  refreshRegionTrend,
} from '../src/lib/region-event-api.ts';

const refs = [
  { timepoint_id: 'T1', target_id: 11, observation_id: 1, local_date: '2026-09-01', image_index: 1, crop: 'region_crop' },
  { timepoint_id: 'T2', target_id: 12, observation_id: 2, local_date: '2026-09-04', image_index: null, crop: null },
  { timepoint_id: 'T3', target_id: 13, observation_id: 3, local_date: '2026-09-09', image_index: 2, crop: 'full_photo' },
];

function point(targetId, date, { photo = true, time = '08:00' } = {}) {
  return {
    observation_id: targetId + 100,
    recorded_at: `${date}T${time}:00Z`,
    recorded_local_date: date,
    photo: photo ? { photo_id: targetId + 200, url: 'x' } : null,
    target: { target_id: targetId, region_id: 'chin', facts: null },
  };
}

const progress = (days, span, eligible = false) => ({
  days, span_days: span, eligible,
  missing_days: Math.max(0, 3 - days), missing_span_days: Math.max(0, 7 - span),
  window_start_date: null, window_end_date: null,
});

test('insight API calls use the backend routes', async () => {
  const calls = [];
  const request = async (path, init) => { calls.push({ path, init }); return {}; };
  await getRegionInsights(request, 5);
  await refreshRegionTrend(request, 5);
  await createRegionComparison(request, 5, { earlierTargetId: 11, laterTargetId: 13 });
  await getRegionComparison(request, 5, 9);
  assert.deepEqual(calls.map(call => call.path), [
    '/region-events/5/insights',
    '/region-events/5/trend/refresh',
    '/region-events/5/comparisons',
    '/region-events/5/comparisons/9',
  ]);
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[2].init.body), { earlier_target_id: 11, later_target_id: 13 });
});

test('progress text explains what is still needed without promising a result', () => {
  assert.equal(buildTrendProgressText(progress(0, 0)), '记录两天后可以对比，记录满一周后可查看阶段趋势。');
  assert.equal(buildTrendProgressText(progress(1, 0)), '已记录 1 天；再记录 1 天后可以对比。');
  assert.equal(buildTrendProgressText(progress(3, 4)), '已记录 3 天，跨度 4 天；再记录约 3 天后可查看阶段趋势。');
  assert.equal(buildTrendProgressText(progress(2, 9)), '已记录 2 天，跨度 9 天；再记录约 1 天后可查看阶段趋势。');
  assert.equal(buildTrendProgressText(progress(3, 7, true)), null);
});

test('comparison candidates keep photo points only and default to earliest vs latest', () => {
  const points = [point(13, '2026-09-09'), point(11, '2026-09-01'), point(12, '2026-09-04', { photo: false })];
  assert.deepEqual(comparisonCandidates(points).map(p => p.target.target_id), [11, 13]);
  assert.deepEqual(defaultComparisonPair(points), [11, 13]);
  assert.deepEqual(defaultComparisonPair(points, [13, 11]), [13, 11]);
  assert.equal(defaultComparisonPair([point(1, '2026-09-01'), point(2, '2026-09-01', { time: '20:00' })]), null);
});

test('assigning a slot keeps chronological order and refuses same-day pairs', () => {
  const points = [point(11, '2026-09-01'), point(14, '2026-09-01', { time: '21:00' }), point(12, '2026-09-04'), point(13, '2026-09-09')];
  assert.deepEqual(assignComparisonSlot(points, [11, 13], 'later', 12), [11, 12]);
  assert.deepEqual(assignComparisonSlot(points, [11, 12], 'earlier', 13), [12, 13]);
  assert.equal(assignComparisonSlot(points, [11, 13], 'later', 14), null);
  assert.equal(assignComparisonSlot(points, [11, 13], 'earlier', 13), null);
});

test('comparison view maps each status to neutral copy', () => {
  const base = { comparison_id: 1, timepoints: refs.slice(0, 2), result: null, failure_code: null };
  assert.equal(buildComparisonView({ ...base, status: 'processing' }).kind, 'processing');
  const failed = buildComparisonView({ ...base, status: 'failed', failure_code: 'unsafe_output' });
  assert.equal(failed.kind, 'failed');
  assert.match(failed.message, /未能生成/);
  assert.doesNotMatch(failed.message, /unsafe_output/);
  const limited = buildComparisonView({ ...base, status: 'failed', failure_code: 'quota_exceeded' });
  assert.equal(limited.kind, 'failed');
  assert.match(limited.message, /次数已用完/);
  assert.match(limited.message, /原始照片和记录仍然保留/);

  const result = {
    comparison_reliability: { level: '不足', reasons: ['B 图明显过曝'], comparable_dimensions: [], limited_dimensions: [] },
    photo_a: { main_locations: [], estimated_amount: '约 3 处', distribution: '集中', coverage: '较小', key_appearance: [] },
    photo_b: { main_locations: [], estimated_amount: '无法判断', distribution: '无法判断', coverage: '无法判断', key_appearance: [] },
    changes: [], overall_change: '无法可靠判断', headline: '', unknowns: [], summary: '拍摄条件差异较大。',
  };
  const degraded = buildComparisonView({ ...base, status: 'degraded', result });
  assert.equal(degraded.kind, 'insufficient');
  assert.match(degraded.headline, /拍摄条件差异/);
  assert.deepEqual(degraded.reasons, ['B 图明显过曝']);

  const completed = buildComparisonView({
    ...base,
    status: 'completed',
    result: {
      ...result,
      comparison_reliability: { ...result.comparison_reliability, level: '有限' },
      changes: [{ dimension: 'color_prominence', location: '中央偏左', photo_a: '偏红', photo_b: '浅红', change: 'B 中偏红外观较 A 不明显', evidence_strength: '有限' }],
      overall_change: '呈现混合变化', headline: '局部偏红较淡',
    },
  });
  assert.equal(completed.kind, 'result');
  assert.equal(completed.headline, '局部偏红较淡');
  assert.equal(completed.reliabilityText, '照片可比性：有限');
  assert.deepEqual(completed.changes[0], {
    label: '颜色', location: '中央偏左', before: '偏红', after: '浅红',
    change: 'B 中偏红外观较 A 不明显', strength: '证据有限',
  });
  assert.match(INSIGHT_BOUNDARY_TEXT, /不代表改善、恶化或疗效/);
});

test('evidence lines resolve T-ids to dates and label their source', () => {
  assert.equal(describeEvidence('T1[图]：约 5 处', refs), '9月1日 · 照片：约 5 处');
  assert.equal(describeEvidence('T2[记录]：约 4 处', refs), '9月4日 · 记录显示：约 4 处');
  assert.equal(describeEvidence('T9[图]：约 1 处', refs), null);
  assert.equal(describeEvidence('随便一句', refs), null);
});

test('trend view shows headline, dimensions, phases and tappable notable dates', () => {
  const trend = {
    trend_id: 3, status: 'completed', timepoints: refs, failure_code: null,
    result: {
      series_reliability: { level: '有限', reasons: [], usable_timepoints: [], limited_timepoints: [] },
      dimension_trends: {
        visible_amount: { trend: '总体减少', evidence: ['T1[图]：约 6 处', 'T3[图]：约 3 处'] },
        distribution: { trend: '大致稳定', evidence: ['T2[记录]：集中'] },
        coverage: { trend: '无法可靠判断', evidence: [] },
        color_prominence: { trend: '无法可靠判断', evidence: [] },
        elevation_and_surface: { trend: '无法可靠判断', evidence: [] },
        location_pattern: { trend: '大致稳定', evidence: ['T9[图]：伪造'] },
      },
      phases: [{ start_timepoint: 'T1', end_timepoint: 'T3', pattern: '清晰可见数量总体减少', evidence: '约 6 → 3 处' }],
      notable_timepoints: [{ timepoint_id: 'T3', reason: '数量明显较少' }],
      overall_trend: '相关可见表现总体减少', headline: '近两周可见数量总体减少', unknowns: [], summary: '…',
    },
  };
  const view = buildTrendView({ trend_status: 'ready', trend, trend_is_current: true, trend_progress: progress(3, 8, true) });
  assert.equal(view.kind, 'result');
  assert.equal(view.headline, '近两周可见数量总体减少');
  assert.equal(view.updating, false);
  assert.deepEqual(view.dimensions.map(d => [d.label, d.trend]), [
    ['可见数量', '总体减少'], ['分布', '大致稳定'], ['位置', '大致稳定'],
  ]);
  assert.deepEqual(view.dimensions[0].evidence, ['9月1日 · 照片：约 6 处', '9月9日 · 照片：约 3 处']);
  assert.deepEqual(view.dimensions[2].evidence, []);  // unknown T-id is dropped, never shown
  assert.deepEqual(view.phases, ['9月1日—9月9日：清晰可见数量总体减少']);
  assert.deepEqual(view.notable, [{ targetId: 13, label: '9月9日', reason: '数量明显较少' }]);

  const stale = buildTrendView({ trend_status: 'processing', trend, trend_is_current: false, trend_progress: progress(4, 10, true) });
  assert.equal(stale.updating, true);
  assert.equal(buildTrendView({ trend_status: 'processing', trend: null, trend_is_current: false, trend_progress: progress(3, 7, true) }).kind, 'processing');
  assert.equal(buildTrendView({ trend_status: 'locked', trend: null, trend_is_current: false, trend_progress: progress(2, 3) }).kind, 'locked');
  const failed = buildTrendView({ trend_status: 'failed', trend: null, trend_is_current: false, trend_progress: progress(3, 7, true) });
  assert.equal(failed.kind, 'failed');

  const withheld = buildTrendView({
    trend_status: 'ready', trend_is_current: true, trend_progress: progress(3, 7, true),
    trend: { ...trend, status: 'degraded', result: { ...trend.result, overall_trend: '无法可靠判断趋势', headline: '' } },
  });
  assert.equal(withheld.kind, 'insufficient');
});
