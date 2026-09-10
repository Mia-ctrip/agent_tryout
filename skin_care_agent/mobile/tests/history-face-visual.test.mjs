import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHistoryFaceSvg, HISTORY_FACE_REGIONS } from '../src/lib/history-face-visual.ts';
import { colors } from '../src/constants/theme.ts';

test('history illustration paints each region with its actual state and clips to the face', () => {
  const svg = buildHistoryFaceSvg([
    { regionId: 'left_face', visualState: 'active' },
    { regionId: 'nose_area', visualState: 'needs_input' },
    { regionId: 'forehead', visualState: 'historical' },
  ]);
  assert.match(svg, new RegExp(`data-region="left_face"[^>]*fill="${colors.sageSoft}"`));
  assert.match(svg, /data-region="nose_area"[^>]*stroke-dasharray="4 3"/);
  assert.match(svg, new RegExp(`data-region="forehead"[^>]*fill="${colors.paperElevated}"`));
  assert.match(svg, /clip-path="url\(#face-boundary\)"/);
  assert.equal((svg.match(/data-region=/g) || []).length, 6);
});

test('face labels keep true-user sides and have separate nose, mouth and chin targets', () => {
  const shape = (id) => HISTORY_FACE_REGIONS[id];
  assert.ok(shape('left_face').x > shape('right_face').x);
  assert.ok(shape('nose_area').y + shape('nose_area').height <= shape('mouth_area').y);
  assert.ok(shape('mouth_area').y + shape('mouth_area').height <= shape('chin').y);
  for (const item of Object.values(HISTORY_FACE_REGIONS)) {
    assert.ok(item.width >= 44 && item.height >= 44);
    assert.ok(item.x >= 0 && item.x + item.width <= 340);
    assert.ok(item.y >= 0 && item.y + item.height <= 366);
  }
});
