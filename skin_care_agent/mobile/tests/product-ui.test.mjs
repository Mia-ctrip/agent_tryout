import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveRevealTarget,
  formatProductUseDate,
  productCabinetSummary,
  productLastUsedLabel,
  shouldOfferCustomProduct,
  sortPersonalProducts,
} from '../src/lib/product-ui.ts';


const product = (overrides) => ({
  product_id: 1,
  use_count: 0,
  last_used_at: null,
  ...overrides,
});


test('personal products are ordered by use count, last use, then stable id', () => {
  const sorted = sortPersonalProducts([
    product({ product_id: 8, use_count: 2, last_used_at: '2026-08-26T09:00:00Z' }),
    product({ product_id: 3, use_count: 8, last_used_at: '2026-08-20T09:00:00Z' }),
    product({ product_id: 7, use_count: 8, last_used_at: '2026-08-25T09:00:00Z' }),
    product({ product_id: 2, use_count: 2, last_used_at: '2026-08-26T09:00:00Z' }),
  ]);

  assert.deepEqual(sorted.map((item) => item.product_id), [7, 3, 2, 8]);
});


test('cabinet summary combines product and real-use counts', () => {
  assert.equal(
    productCabinetSummary([
      product({ use_count: 11 }),
      product({ product_id: 2, use_count: 8 }),
      product({ product_id: 3, use_count: 0 }),
    ]),
    '3 件产品 · 已记录 19 次使用',
  );
});


test('last-used label is concise and neutral', () => {
  const now = new Date('2026-08-27T12:00:00+08:00');
  assert.equal(productLastUsedLabel(null, now), '尚无使用记录');
  assert.equal(productLastUsedLabel('2026-08-27T08:00:00+08:00', now), '最后使用：今天');
  assert.equal(productLastUsedLabel('2026-08-26T20:00:00+08:00', now), '最后使用：昨天');
  assert.equal(productLastUsedLabel('2026-08-21T20:00:00+08:00', now), '最后使用：8 月 21 日');
});


test('custom product is offered only after a completed non-empty zero-result search', () => {
  assert.equal(shouldOfferCustomProduct({ query: '', loading: false, resultCount: 0, error: null }), false);
  assert.equal(shouldOfferCustomProduct({ query: '阿达', loading: true, resultCount: 0, error: null }), false);
  assert.equal(shouldOfferCustomProduct({ query: '阿达', loading: false, resultCount: 2, error: null }), false);
  assert.equal(shouldOfferCustomProduct({ query: '阿达', loading: false, resultCount: 0, error: '网络错误' }), false);
  assert.equal(shouldOfferCustomProduct({ query: '阿达', loading: false, resultCount: 0, error: null }), true);
});


test('left swipe opens only after crossing the reveal threshold', () => {
  assert.equal(archiveRevealTarget(-18), 0);
  assert.equal(archiveRevealTarget(-58), -88);
  assert.equal(archiveRevealTarget(-180), -88);
  assert.equal(archiveRevealTarget(30), 0);
});


test('product detail formats the recorded local time without Intl locale fallback', () => {
  assert.equal(formatProductUseDate('2026-08-27T07:39:00Z', 480), '8 月 27 日 · 15:39');
  assert.equal(formatProductUseDate('2026-01-02T23:05:00Z', -300), '1 月 2 日 · 18:05');
});
