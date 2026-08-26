import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIFE_CONTEXTS,
  normalizeLifeContextIds,
  updateObservationLifeContexts,
} from '../src/lib/life-context.ts';


test('life-context catalog exposes exactly the six fixed stickers', () => {
  assert.deepEqual(LIFE_CONTEXTS, [
    { id: 'sleep', label: '睡眠' },
    { id: 'stress', label: '压力' },
    { id: 'diet', label: '饮食' },
    { id: 'mood', label: '情绪' },
    { id: 'menstrual_cycle', label: '生理期' },
    { id: 'care_change', label: '护理变化' },
  ]);
});


test('life-context selections keep catalog order and reject invalid drafts', () => {
  assert.deepEqual(normalizeLifeContextIds(['care_change', 'sleep', 'mood']), [
    'sleep',
    'mood',
    'care_change',
  ]);
  assert.throws(() => normalizeLifeContextIds(['sleep', 'sleep']), /重复/);
  assert.throws(() => normalizeLifeContextIds(['weather']), /不支持/);
});


test('life-context API saves both selections and an explicit empty skip', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { observation_id: 9 };
  };

  await updateObservationLifeContexts(request, 9, ['mood', 'sleep']);
  await updateObservationLifeContexts(request, 9, []);

  assert.equal(calls[0].path, '/observations/9/life-contexts');
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    context_ids: ['sleep', 'mood'],
  });
  assert.deepEqual(JSON.parse(calls[1].init.body), { context_ids: [] });
});
