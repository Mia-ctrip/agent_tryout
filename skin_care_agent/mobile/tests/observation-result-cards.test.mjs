import assert from 'node:assert/strict';
import test from 'node:test';
import { buildObservationResultModel } from '../src/lib/observation-flow.ts';

test('region cards keep facts and full summaries separate and omit vague highlights', () => {
  const facts = { summary: '左脸可见泛红。'.repeat(20), daily_appearance: ['泛红', '无法判断'], main_locations: ['左脸颊靠近鼻翼'], estimated_amount: '少量', distribution: '散在', coverage: '局部可见', unknowns: ['眼镜遮挡，无法观察上缘'] };
  const observation = { targets: [
    { target_id: 1, region_id: 'left_face', status: 'completed', result_source: 'photo_analysis', facts },
    { target_id: 2, region_id: 'nose_area', status: 'completed', result_source: 'photo_analysis', facts: { ...facts, summary: '鼻翼可见泛红。', daily_appearance: ['无法判断'], main_locations: [] } },
    { target_id: 3, region_id: 'chin', status: 'needs_input', facts: null },
  ], photo: null };
  const model = buildObservationResultModel(observation);
  assert.equal(model.regionCards.length, 2);
  assert.equal(model.regionCards[0].summary, facts.summary);
  assert.deepEqual(model.regionCards[0].highlights, [{ label: '可见外观', value: '泛红' }, { label: '主要位置', value: '左脸颊靠近鼻翼' }]);
  assert.deepEqual(model.regionCards[0].limitations, facts.unknowns);
  assert.deepEqual(model.regionCards[1].highlights, []);
  assert.ok(model.regionCards[0].sections.some(s => s.label === '估计数量' && s.value === '少量'));
  assert.deepEqual(model.needsInputTargetIds, [3]);
});
