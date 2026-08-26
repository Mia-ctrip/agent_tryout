import assert from 'node:assert/strict';
import test from 'node:test';

import { observationDetailBackTarget } from '../src/lib/observation-navigation.ts';

test('observation detail keeps native stack navigation when history exists', () => {
  assert.equal(
    observationDetailBackTarget(true),
    'native',
  );
});

test('observation detail falls back to the history tab without stack history', () => {
  assert.equal(
    observationDetailBackTarget(false),
    '/(tabs)/history',
  );
});
