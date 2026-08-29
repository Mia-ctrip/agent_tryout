import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductSearchGuard,
  selectReadyProduct,
  selectedPersonalProductId,
} from '../src/lib/product-search-flow.ts';


test('late product search results cannot overwrite a newer query', () => {
  const guard = createProductSearchGuard();
  const oldGeneration = guard.begin('洁面');
  const newGeneration = guard.begin('面霜');

  assert.equal(guard.accept(oldGeneration, '洁面'), false);
  assert.equal(guard.accept(newGeneration, '面霜'), true);
});


test('catalog results use existing cabinet IDs and ready products are selected once', () => {
  assert.equal(
    selectedPersonalProductId({
      source_type: 'standard',
      personal_product_id: 7,
      standard_product_id: 9,
      in_cabinet: true,
    }),
    7,
  );
  assert.deepEqual(selectReadyProduct([4, 2], { product_id: 6 }), [2, 4, 6]);
  assert.deepEqual(selectReadyProduct([2, 4, 6], { product_id: 6 }), [2, 4, 6]);
});
