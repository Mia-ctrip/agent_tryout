import assert from 'node:assert/strict';
import test from 'node:test';

import { buildObservationResultModel } from '../src/lib/observation-flow.ts';

const geometry = [
  { region_id: 'forehead', points: Array.from({ length: 6 }, (_, index) => ({ x: 0.3 + index * 0.02, y: 0.2 })) },
  { region_id: 'chin', points: Array.from({ length: 6 }, (_, index) => ({ x: 0.4 + index * 0.02, y: 0.78 })) },
];

function target(target_id, region_id, status = 'completed') {
  return {
    target_id,
    scope_type: 'region',
    region_id,
    user_note: null,
    status,
    result_source: status === 'completed' ? 'photo_analysis' : null,
    completed_at: status === 'completed' ? '2026-08-30T08:00:00Z' : null,
    facts: status === 'completed' ? {
      main_locations: [region_id === 'forehead' ? '额头中央' : '下巴中央'],
      estimated_amount: '可见少量局部表现',
      distribution: '分布较集中',
      coverage: '覆盖范围较小',
      daily_appearance: ['肤色整体较均匀', '局部纹理略明显'],
      unknowns: ['单张照片无法判断变化原因'],
      summary: region_id === 'forehead' ? '额头整体表现较稳定。' : '下巴有一处局部表现值得留意。',
    } : null,
  };
}

function observation(targets = [target(1, 'forehead'), target(2, 'chin')]) {
  return {
    observation_id: 9,
    client_request_id: '11111111-1111-4111-8111-111111111111',
    recorded_at: '2026-08-30T08:00:00Z',
    recorded_timezone_offset_minutes: 480,
    recorded_local_date: '2026-08-30',
    status: 'saved',
    created_at: '2026-08-30T08:00:01Z',
    life_context_ids: [],
    life_context_completed_at: null,
    photo: {
      photo_id: 5,
      mime_type: 'image/jpeg',
      size_bytes: 1000,
      width: 720,
      height: 960,
      taken_at: '2026-08-30T08:00:00Z',
      quality_status: 'passed',
      quality_meta: { status: 'passed', primary_issue: null, issues: [], metrics: { width: 720, height: 960 }, regions: geometry },
      url: 'https://example.test/face.jpg',
      url_expires_at: '2026-08-30T09:00:00Z',
    },
    targets,
  };
}

test('result model keeps summary separate, limits findings and never invents advice or scores', () => {
  const model = buildObservationResultModel(observation());
  assert.equal(model.regionLabel, '额头、下巴');
  assert.match(model.summary, /额头整体表现较稳定/);
  assert.ok(model.findings.length > 0 && model.findings.length <= 2);
  assert.ok(model.evidence.length <= 2);
  assert.ok(model.details.every((detail) => detail.sections.every((section) => section.label !== '本次小结')));
  assert.equal(model.comparison.enabled, false);
  const allCopy = JSON.stringify(model);
  assert.doesNotMatch(allCopy, /评分|得分|商品|购买|护理方案|产品推荐/);
});

test('result evidence uses persisted selected-region geometry without fake issue coordinates', () => {
  const model = buildObservationResultModel(observation());
  assert.deepEqual(model.evidence.map((item) => item.regionId), ['forehead', 'chin']);
  assert.deepEqual(model.evidence[0].geometry, geometry[0]);
  assert.equal(model.evidence[0].label, '额头检测区域');
});

test('completed sibling results remain available when another target needs input', () => {
  const model = buildObservationResultModel(
    observation([target(1, 'forehead'), target(2, 'chin', 'needs_input')]),
  );
  assert.equal(model.completedTargetIds.includes(1), true);
  assert.equal(model.needsInputTargetIds.includes(2), true);
  assert.match(model.summary, /额头整体表现较稳定/);
});
