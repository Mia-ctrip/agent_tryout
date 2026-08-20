import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPhotoUploadForm,
  completeCheckIn,
  createStandardCheckIn,
  getCheckIn,
  listCheckIns,
  uploadCheckInPhoto,
} from '../src/lib/check-in-api.ts';

test('createStandardCheckIn sends the required idempotent body', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { check_in_id: 17 };
  };

  const result = await createStandardCheckIn(request, {
    observedOn: '2026-07-20',
    clientRequestId: '00000000-0000-4000-8000-000000000000',
  });

  assert.equal(result.check_in_id, 17);
  assert.equal(calls[0].path, '/check-ins');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    observed_on: '2026-07-20',
    kind: 'standard',
    client_request_id: '00000000-0000-4000-8000-000000000000',
  });
});

test('buildPhotoUploadForm preserves the photo idempotency metadata', () => {
  const entries = [];
  const form = {
    append(name, value) {
      entries.push([name, value]);
    },
  };
  const file = {
    uri: 'file:///capture.jpg',
    name: 'front-capture.jpg',
    type: 'image/jpeg',
  };

  const result = buildPhotoUploadForm(
    {
      file,
      takenAt: '2026-07-20T10:00:00.000Z',
      checkInId: 17,
      viewType: 'front',
      clientRequestId: '11111111-1111-4111-8111-111111111111',
    },
    form,
  );

  assert.equal(result, form);
  assert.deepEqual(entries, [
    ['file', file],
    ['taken_at', '2026-07-20T10:00:00.000Z'],
    ['check_in_id', '17'],
    ['view_type', 'front'],
    ['client_request_id', '11111111-1111-4111-8111-111111111111'],
  ]);
});

test('uploadCheckInPhoto posts the multipart form returned by the builder', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { photo_id: 23 };
  };
  const form = { append() {} };

  const result = await uploadCheckInPhoto(request, form);

  assert.equal(result.photo_id, 23);
  assert.deepEqual(calls, [
    {
      path: '/photos',
      init: { method: 'POST', body: form },
    },
  ]);
});

test('completeCheckIn posts to the selected check-in', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { check_in_id: 17, status: 'complete' };
  };

  const result = await completeCheckIn(request, 17);

  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, [
    {
      path: '/check-ins/17/complete',
      init: { method: 'POST' },
    },
  ]);
});

test('listCheckIns requests recent server state', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return [];
  };

  assert.deepEqual(await listCheckIns(request), []);
  assert.deepEqual(calls, [{ path: '/check-ins?limit=30', init: undefined }]);
});

test('getCheckIn reloads photos for one check-in', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { check_in_id: 17, photos: [] };
  };

  const result = await getCheckIn(request, 17);

  assert.equal(result.check_in_id, 17);
  assert.deepEqual(calls, [{ path: '/check-ins/17', init: undefined }]);
});
