import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildObservationForm,
  createObservation,
  getObservation,
  listAllObservations,
  listObservations,
  refreshObservationPhotoUrl,
  retryObservationTarget,
  updateObservationNote,
} from '../src/lib/observation-api.ts';

test('buildObservationForm sends confirmed region targets and device date metadata', () => {
  const entries = [];
  const form = {
    append(name, value) {
      entries.push([name, value]);
    },
  };
  const file = {
    uri: 'file:///capture.jpg',
    name: 'observation.jpg',
    type: 'image/jpeg',
  };

  const result = buildObservationForm(
    {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      recordedAt: '2026-08-21T10:00:00.000Z',
      timezoneOffsetMinutes: 480,
      targets: [
        { regionId: 'left_face' },
        { regionId: 'chin', userNote: '偏红', eventDecision: 'start_new' },
      ],
      takenAt: '2026-08-21T09:59:58.000Z',
      file,
    },
    form,
  );

  assert.equal(result, form);
  assert.deepEqual(entries, [
    ['client_request_id', '11111111-1111-4111-8111-111111111111'],
    ['recorded_at', '2026-08-21T10:00:00.000Z'],
    ['recorded_timezone_offset_minutes', '480'],
    [
      'targets_json',
      JSON.stringify([
        { region_id: 'left_face' },
        { region_id: 'chin', user_note: '偏红', event_decision: 'start_new' },
      ]),
    ],
    ['taken_at', '2026-08-21T09:59:58.000Z'],
    ['file', file],
  ]);
  assert.equal(
    entries.some(([name]) =>
      ['region_id', 'scope_type', 'view_type', 'check_in_id'].includes(name),
    ),
    false,
  );
});

test('buildObservationForm supports regional text-only notes', () => {
  const entries = [];
  const form = {
    append(name, value) {
      entries.push([name, value]);
    },
  };

  buildObservationForm(
    {
      clientRequestId: '22222222-2222-4222-8222-222222222222',
      recordedAt: '2026-08-21T11:00:00.000Z',
      timezoneOffsetMinutes: 480,
      targets: [{ regionId: 'left_face', userNote: '今天左侧脸有些泛红。' }],
    },
    form,
  );

  assert.deepEqual(entries, [
    ['client_request_id', '22222222-2222-4222-8222-222222222222'],
    ['recorded_at', '2026-08-21T11:00:00.000Z'],
    ['recorded_timezone_offset_minutes', '480'],
    [
      'targets_json',
      JSON.stringify([{ region_id: 'left_face', user_note: '今天左侧脸有些泛红。' }]),
    ],
  ]);
});

test('observation API uses the Slice 1 create, list, detail and note paths', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return path.includes('?') ? [] : { observation_id: 19 };
  };
  const form = { append() {} };

  await createObservation(request, form);
  await listObservations(request);
  await listObservations(request, { limit: 12, beforeId: 19 });
  await getObservation(request, 19);
  await updateObservationNote(request, 19, 29, '  今天状态稳定。  ');
  await retryObservationTarget(request, 19, 29);
  await refreshObservationPhotoUrl(request, 41);

  assert.deepEqual(calls, [
    {
      path: '/observations',
      init: { method: 'POST', body: form },
    },
    { path: '/observations?limit=30', init: undefined },
    { path: '/observations?limit=12&before_id=19', init: undefined },
    { path: '/observations/19', init: undefined },
    {
      path: '/observations/19/targets/29/note',
      init: {
        method: 'PUT',
        body: JSON.stringify({ user_note: '  今天状态稳定。  ' }),
      },
    },
    {
      path: '/observations/19/targets/29/retry',
      init: { method: 'POST' },
    },
    { path: '/photos/41/url', init: undefined },
  ]);
});

test('history observation loader follows every backend page', async () => {
  const calls = [];
  const firstPage = Array.from({ length: 50 }, (_, index) => ({ observation_id: 100 - index }));
  const secondPage = [{ observation_id: 50 }, { observation_id: 49 }];
  const request = async (path) => {
    calls.push(path);
    return calls.length === 1 ? firstPage : secondPage;
  };

  const observations = await listAllObservations(request);

  assert.equal(observations.length, 52);
  assert.deepEqual(calls, [
    '/observations?limit=50',
    '/observations?limit=50&before_id=51',
  ]);
});
