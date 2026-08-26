import assert from 'node:assert/strict';
import test from 'node:test';

import { squareThumbnailFrame } from '../src/lib/observation-list-layout.ts';

test('observation photo thumbnails keep a fixed square frame inside tall rows', () => {
  assert.deepEqual(squareThumbnailFrame(84), {
    width: 84,
    height: 84,
  });
});
