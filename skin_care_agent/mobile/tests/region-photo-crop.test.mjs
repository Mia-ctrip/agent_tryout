import assert from 'node:assert/strict';
import test from 'node:test';
import { regionPhotoCrop } from '../src/lib/region-photo-crop.ts';

const box = (region_id, x, y, width, height) => ({ region_id, points: [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
] });
const photo = { width: 1000, height: 1400, quality_meta: { regions: [
  box('left_face', .65, .35, .2, .25), box('right_face', .15, .35, .2, .25),
  box('nose_area', .43, .35, .14, .2), box('forehead', .25, .1, .5, .18),
  box('mouth_area', .38, .6, .24, .1), box('chin', .4, .75, .2, .12),
] } };

test('all six previews use distinct saved regions, preserve aspect ratio and real left/right', () => {
  const crops = photo.quality_meta.regions.map(({ region_id }) => regionPhotoCrop(photo, region_id, 80));
  assert.equal(new Set(crops.map(crop => JSON.stringify(crop))).size, 6);
  assert.ok(crops[0].left < crops[1].left, 'user left is on the right of the saved photo');
  for (const crop of crops) {
    assert.ok(Math.abs(crop.width / crop.height - photo.width / photo.height) < 1e-10);
    assert.ok(crop.left <= 0 && crop.top <= 0);
    assert.ok(crop.left + crop.width >= 80 && crop.top + crop.height >= 80);
  }
});

test('crop stays inside edge photos and invalid/missing geometry falls back without guessing', () => {
  for (const [x, y] of [[0, 0], [.9, .9]]) {
    const edge = { ...photo, quality_meta: { regions: [box('chin', x, y, .1, .1)] } };
    const crop = regionPhotoCrop(edge, 'chin', 80);
    assert.ok(crop.left <= 0 && crop.top <= 0);
    assert.ok(crop.left + crop.width >= 80 - 1e-8 && crop.top + crop.height >= 80 - 1e-8);
  }
  for (const candidate of [
    { ...photo, quality_meta: null },
    { ...photo, width: 0 },
    { ...photo, quality_meta: { regions: [box('chin', NaN, 0, .1, .1)] } },
    { ...photo, quality_meta: { regions: [box('chin', 0, 0, 0, .1)] } },
    { ...photo, quality_meta: { regions: [box('chin', .99, 0, .1, .1)] } },
  ]) assert.equal(regionPhotoCrop(candidate, 'chin', 80), null);
  assert.equal(regionPhotoCrop(photo, null, 80), null);
  assert.equal(regionPhotoCrop(photo, 'chin', 0), null);
});
