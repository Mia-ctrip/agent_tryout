import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapNormalizedPolygonToCoverLayout,
  polygonHitBounds,
} from '../src/lib/face-region-layout.ts';

test('cover mapping accounts for vertical crop of a portrait source', () => {
  const points = mapNormalizedPolygonToCoverLayout(
    [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    { width: 100, height: 200 },
    { width: 100, height: 100 },
  );
  assert.deepEqual(points, [{ x: 0, y: -50 }, { x: 100, y: 150 }]);
});

test('cover mapping accounts for horizontal crop of a landscape source', () => {
  const points = mapNormalizedPolygonToCoverLayout(
    [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    { width: 200, height: 100 },
    { width: 100, height: 100 },
  );
  assert.deepEqual(points, [{ x: -50, y: 0 }, { x: 150, y: 100 }]);
});

test('saved unmirrored photo coordinates are not flipped and hit bounds are at least 44pt', () => {
  const points = mapNormalizedPolygonToCoverLayout(
    [{ x: 0.72, y: 0.5 }, { x: 0.76, y: 0.54 }],
    { width: 100, height: 100 },
    { width: 100, height: 100 },
  );
  assert.ok(points[0].x < points[1].x);
  const bounds = polygonHitBounds(points);
  assert.ok(bounds.width >= 44);
  assert.ok(bounds.height >= 44);
});

