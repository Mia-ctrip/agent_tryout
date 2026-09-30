import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchDataExport, summarizeDataExport } from '../src/lib/export-api.ts';


test('data export API requests the authenticated export endpoint', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { observations: [], region_events: [], personal_products: [], product_uses: [] };
  };

  await fetchDataExport(request);

  assert.equal(calls[0].path, '/me/export');
  assert.equal(calls[0].init, undefined);
});


test('data export summary counts every exported record group in Chinese', () => {
  assert.equal(
    summarizeDataExport({
      generated_at: '2026-09-29T12:00:00Z',
      user: { user_id: 1, email: null, nickname: null, created_at: '2026-09-29T12:00:00Z' },
      consents: [],
      observations: [{}, {}],
      region_events: [{}],
      personal_products: [{}, {}, {}],
      product_uses: [],
    }),
    '2 次观察记录 · 1 个区域事件 · 3 件个人产品 · 0 条使用记录',
  );
});
