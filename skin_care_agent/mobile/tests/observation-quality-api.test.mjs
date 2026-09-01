import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildObservationQualityForm,
  checkObservationPhotoQuality,
} from '../src/lib/observation-quality-api.ts';

test('quality preflight uses the observation multipart route and preserves response geometry', async () => {
  const entries = [];
  const file = { uri: 'file://face.jpg', name: 'face.jpg', type: 'image/jpeg' };
  const form = buildObservationQualityForm(file, {
    append(name, value) {
      entries.push([name, value]);
    },
  });
  assert.deepEqual(entries, [['file', file]]);

  const expected = {
    status: 'passed',
    primary_issue: null,
    issues: [],
    metrics: { face_count: 1 },
    regions: [{ region_id: 'forehead', points: [{ x: 0.4, y: 0.2 }, { x: 0.6, y: 0.2 }, { x: 0.7, y: 0.3 }, { x: 0.6, y: 0.35 }, { x: 0.4, y: 0.35 }, { x: 0.3, y: 0.3 }] }],
  };
  const calls = [];
  const result = await checkObservationPhotoQuality(async (path, init) => {
    calls.push({ path, init });
    return expected;
  }, form);

  assert.equal(calls[0].path, '/observations/photo-quality');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, form);
  assert.deepEqual(result, expected);
});

