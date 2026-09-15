import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductImageLoader, productImageRefreshDelay } from '../src/lib/product-image-loading.ts';

const api = 'http://10.0.2.2:8000/api/v1';
const original = { image_url: 'http://localhost:8000/files/product-images/a.jpg?exp=1&sig=a', image_expires_at: null };
const replacement = { image_url: 'http://localhost:8000/files/product-images/a.jpg?exp=2&sig=b', image_expires_at: null };

test('product image requests use the reachable media origin and preserve the signature', () => {
  const loader = createProductImageLoader(original, api);
  assert.equal(loader.current().uri, 'http://10.0.2.2:8000/files/product-images/a.jpg?exp=1&sig=a');
});

test('a failed signed image is refreshed once; a broken replacement does not loop', async () => {
  let calls = 0;
  const loader = createProductImageLoader(original, api, async () => { calls++; return replacement; });
  await loader.failed(0);
  assert.equal(loader.current().uri, 'http://10.0.2.2:8000/files/product-images/a.jpg?exp=2&sig=b');
  assert.equal(loader.current().attempt, 1);
  await loader.failed(1);
  assert.equal(loader.current().phase, 'error');
  assert.equal(calls, 1);
  await loader.retry();
  assert.equal(calls, 2);
  assert.equal(loader.current().phase, 'loading');
});

test('concurrent image failures share one refresh and stale load callbacks are ignored', async () => {
  let finish;
  let calls = 0;
  const loader = createProductImageLoader(original, api, () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = loader.failed(0);
  await loader.failed(0);
  finish(replacement);
  await pending;
  loader.loaded(0);
  assert.equal(loader.current().phase, 'loading');
  loader.loaded(1);
  assert.equal(loader.current().phase, 'ready');
  assert.equal(calls, 1);
});

test('late refresh responses cannot update an unmounted image', async () => {
  let finish;
  const changes = [];
  const loader = createProductImageLoader(original, api, () => new Promise(resolve => { finish = resolve; }), value => changes.push(value));
  const pending = loader.failed(0);
  loader.dispose();
  const count = changes.length;
  finish(replacement);
  await pending;
  assert.equal(changes.length, count);
});

test('missing images differ from loading failures and network errors remain retryable', async () => {
  assert.equal(createProductImageLoader({ image_url: null, image_expires_at: null }, api).current().phase, 'missing');
  let online = false;
  const loader = createProductImageLoader(original, api, async () => { if (!online) throw new Error('offline'); return replacement; });
  await loader.failed(0);
  assert.equal(loader.current().phase, 'error');
  online = true;
  await loader.retry();
  loader.loaded(loader.current().attempt);
  assert.equal(loader.current().phase, 'ready');
});

test('expiry scheduling handles expired, future, absent and invalid timestamps', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  assert.equal(productImageRefreshDelay('2026-09-11T00:15:00Z', now), 900000);
  assert.equal(productImageRefreshDelay('2026-09-10T23:59:59Z', now), 0);
  assert.equal(productImageRefreshDelay(null, now), null);
  assert.equal(productImageRefreshDelay('invalid', now), null);
});

test('an already expired re-sign response stops instead of scheduling an immediate retry loop', async () => {
  const loader = createProductImageLoader(original, api, async () => ({ ...replacement, image_expires_at: '2000-01-01T00:00:00Z' }));
  await loader.failed(0);
  assert.equal(loader.current().phase, 'error');
});

test('a successfully refreshed image can recover from a later expiry', async () => {
  let calls = 0;
  const loader = createProductImageLoader(original, api, async () => { calls++; return replacement; });
  await loader.failed(0);
  loader.loaded(1);
  await loader.failed(1);
  assert.equal(calls, 2);
  assert.equal(loader.current().attempt, 2);
});
