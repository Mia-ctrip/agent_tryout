import assert from 'node:assert/strict';
import test from 'node:test';

import { REGIONS, normalizeRegionIds, regionById } from '../src/lib/region-catalog.ts';

test('region catalog keeps fixed order and user physical directions', () => {
  assert.deepEqual(
    REGIONS.map(({ id }) => id),
    ['forehead', 'left_face', 'right_face', 'nose_area', 'mouth_area', 'chin'],
  );
  assert.equal(regionById('left_face').label, '你的左侧脸');
  assert.match(regionById('left_face').boundary, /本人真实左侧/);
  assert.match(regionById('right_face').boundary, /镜像.*不改变/);
});

test('region normalization rejects empty, duplicates and unknown IDs', () => {
  assert.throws(() => normalizeRegionIds([]), /一到六个/);
  assert.throws(() => normalizeRegionIds(['forehead', 'forehead']), /重复/);
  assert.throws(() => normalizeRegionIds(['other']), /不支持/);
  assert.deepEqual(normalizeRegionIds(['chin', 'forehead']), ['forehead', 'chin']);
});
