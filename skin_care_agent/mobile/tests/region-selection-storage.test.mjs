import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadLastRegionSelection,
  saveLastRegionSelection,
} from '../src/lib/region-selection-storage.ts';

test('last selection storage validates and preserves catalog order', async () => {
  let value = JSON.stringify(['chin', 'forehead']);
  const storage = {
    async getItemAsync() {
      return value;
    },
    async setItemAsync(_key, next) {
      value = next;
    },
  };

  assert.deepEqual(await loadLastRegionSelection(storage), ['forehead', 'chin']);
  await saveLastRegionSelection(['right_face'], storage);
  assert.equal(value, JSON.stringify(['right_face']));
});

test('last selection storage safely ignores corrupt or obsolete values', async () => {
  for (const value of ['not-json', JSON.stringify(['other']), JSON.stringify([])]) {
    const storage = {
      async getItemAsync() {
        return value;
      },
      async setItemAsync() {},
    };
    assert.deepEqual(await loadLastRegionSelection(storage), []);
  }
});
