import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductUseInput,
  createProductUseDraft,
  mergeUsedAtPart,
  toggleProductSelection,
  validateProductName,
} from '../src/lib/product-use-flow.ts';
import { selectReadyProduct } from '../src/lib/product-search-flow.ts';


test('a product-use draft fixes its UUID and occurrence time once', () => {
  const now = new Date('2026-08-24T05:30:00.000Z');
  const draft = createProductUseDraft(
    now,
    () => '11111111-1111-4111-8111-111111111111',
  );

  assert.equal(draft.clientRequestId, '11111111-1111-4111-8111-111111111111');
  assert.equal(draft.usedAt.toISOString(), '2026-08-24T05:30:00.000Z');
  assert.deepEqual(draft.productIds, []);
  assert.equal(draft.note, '');
});


test('product selection is deterministic and does not create duplicates', () => {
  assert.deepEqual(toggleProductSelection([4, 2], 4), [2]);
  assert.deepEqual(toggleProductSelection([4, 2], 3), [2, 3, 4]);
});


test('a newly added catalog product is selected once without changing the product-use draft identity', () => {
  assert.deepEqual(selectReadyProduct([2, 4], { product_id: 6 }), [2, 4, 6]);
  assert.deepEqual(selectReadyProduct([2, 4, 6], { product_id: 6 }), [2, 4, 6]);
});


test('blank selection builds a real unnamed use without a pseudo product', () => {
  const usedAt = new Date('2026-08-24T05:30:00.000Z');
  Object.defineProperty(usedAt, 'getTimezoneOffset', { value: () => -480 });

  assert.deepEqual(
    buildProductUseInput({
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      usedAt,
      productIds: [],
      note: '   ',
    }),
    {
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      usedAt: '2026-08-24T05:30:00.000Z',
      timezoneOffsetMinutes: 480,
      productIds: [],
      note: null,
    },
  );
});


test('product names are trimmed and bounded before requests', () => {
  assert.deepEqual(validateProductName('  保湿乳  '), { ok: true, value: '保湿乳' });
  assert.deepEqual(validateProductName('   '), {
    ok: false,
    message: '请输入产品名称。',
  });
  assert.equal(validateProductName('护'.repeat(121)).ok, false);
});


test('an oversized use note is rejected without changing the fixed request', () => {
  assert.throws(
    () =>
      buildProductUseInput({
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        usedAt: new Date('2026-08-24T05:30:00.000Z'),
        productIds: [2],
        note: '记'.repeat(501),
      }),
    /备注不能超过 500 字/,
  );
});


test('date and time pickers change only their own occurrence-time part', () => {
  const current = new Date(2026, 7, 24, 21, 45, 0, 0);
  const pickedDate = new Date(2026, 6, 3, 8, 10, 0, 0);
  const pickedTime = new Date(2026, 0, 1, 9, 5, 0, 0);

  assert.deepEqual(
    [
      mergeUsedAtPart(current, pickedDate, 'date').getFullYear(),
      mergeUsedAtPart(current, pickedDate, 'date').getMonth(),
      mergeUsedAtPart(current, pickedDate, 'date').getDate(),
      mergeUsedAtPart(current, pickedDate, 'date').getHours(),
      mergeUsedAtPart(current, pickedDate, 'date').getMinutes(),
    ],
    [2026, 6, 3, 21, 45],
  );
  assert.deepEqual(
    [
      mergeUsedAtPart(current, pickedTime, 'time').getFullYear(),
      mergeUsedAtPart(current, pickedTime, 'time').getMonth(),
      mergeUsedAtPart(current, pickedTime, 'time').getDate(),
      mergeUsedAtPart(current, pickedTime, 'time').getHours(),
      mergeUsedAtPart(current, pickedTime, 'time').getMinutes(),
    ],
    [2026, 7, 24, 9, 5],
  );
});
