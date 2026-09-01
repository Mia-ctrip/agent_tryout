import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addStandardProductToCabinet,
  buildCustomProductForm,
  createCustomProduct,
  createPersonalProduct,
  createProductUse,
  getPersonalProduct,
  getStandardProduct,
  getProductUse,
  listPersonalProducts,
  listAllProductUses,
  listProductUses,
  searchProducts,
} from '../src/lib/product-api.ts';


function recorder(response) {
  const calls = [];
  return {
    calls,
    request: async (path, init = {}) => {
      calls.push({ path, init });
      return response;
    },
  };
}


test('product API mirrors cabinet and history routes exactly', async () => {
  const client = recorder([]);

  await listPersonalProducts(client.request);
  await getPersonalProduct(client.request, 9);
  await listProductUses(client.request, { limit: 20, beforeId: 15 });
  await getProductUse(client.request, 7);

  assert.deepEqual(client.calls.map((call) => call.path), [
    '/products',
    '/products/9',
    '/product-uses?limit=20&before_id=15',
    '/product-uses/7',
  ]);
});

test('history product context loader follows every backend page', async () => {
  const calls = [];
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ product_use_id: 200 - index }));
  const secondPage = [{ product_use_id: 100 }];
  const request = async (path) => {
    calls.push(path);
    return calls.length === 1 ? firstPage : secondPage;
  };

  const uses = await listAllProductUses(request);

  assert.equal(uses.length, 101);
  assert.deepEqual(calls, [
    '/product-uses?limit=100',
    '/product-uses?limit=100&before_id=101',
  ]);
});


test('product creation sends the stable client request and trimmed name', async () => {
  const client = recorder({ product_id: 3 });

  await createPersonalProduct(client.request, {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    name: '  温和洁面  ',
  });

  assert.equal(client.calls[0].path, '/products');
  assert.equal(client.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(client.calls[0].init.body), {
    client_request_id: '11111111-1111-4111-8111-111111111111',
    name: '温和洁面',
  });
});


test('product use creation preserves multi-select and zero-select payloads', async () => {
  const client = recorder({ product_use_id: 8 });

  await createProductUse(client.request, {
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    usedAt: '2026-08-24T05:30:00.000Z',
    timezoneOffsetMinutes: 480,
    productIds: [3, 4],
    note: '晚间正常使用',
  });
  await createProductUse(client.request, {
    clientRequestId: '33333333-3333-4333-8333-333333333333',
    usedAt: '2026-08-24T06:00:00.000Z',
    timezoneOffsetMinutes: 480,
    productIds: [],
    note: null,
  });

  assert.deepEqual(JSON.parse(client.calls[0].init.body), {
    client_request_id: '22222222-2222-4222-8222-222222222222',
    used_at: '2026-08-24T05:30:00.000Z',
    used_timezone_offset_minutes: 480,
    product_ids: [3, 4],
    note: '晚间正常使用',
  });
  assert.deepEqual(JSON.parse(client.calls[1].init.body).product_ids, []);
});


test('catalog API preserves encoded search, standard detail and cabinet-add contracts', async () => {
  const client = recorder({ items: [], next_cursor: null });

  await searchProducts(client.request, {
    query: '烟酰胺 10%',
    limit: 20,
    cursor: 'next',
  });
  await getStandardProduct(client.request, 9);
  await addStandardProductToCabinet(client.request, {
    clientRequestId: '44444444-4444-4444-8444-444444444444',
    standardProductId: 9,
    displayNameOverride: '我的版本',
  });

  assert.equal(
    client.calls[0].path,
    '/product-search?q=%E7%83%9F%E9%85%B0%E8%83%BA+10%25&limit=20&cursor=next',
  );
  assert.equal(client.calls[1].path, '/catalog/products/9');
  assert.deepEqual(JSON.parse(client.calls[2].init.body), {
    client_request_id: '44444444-4444-4444-8444-444444444444',
    standard_product_id: 9,
    display_name_override: '我的版本',
  });
});


test('custom product form keeps its optional native image and multipart contract', async () => {
  const entries = [];
  const form = { append: (key, value) => entries.push([key, value]) };
  const image = { uri: 'file:///product.jpg', name: 'product.jpg', type: 'image/jpeg' };
  const built = buildCustomProductForm(
    {
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      name: '  自建产品  ',
      image,
    },
    form,
  );
  const client = recorder({ product_id: 10 });
  await createCustomProduct(client.request, built);

  assert.deepEqual(entries, [
    ['client_request_id', '55555555-5555-4555-8555-555555555555'],
    ['name', '自建产品'],
    ['file', image],
  ]);
  assert.equal(client.calls[0].path, '/products/custom');
  assert.equal(client.calls[0].init.method, 'POST');
  assert.equal(client.calls[0].init.body, form);
});
