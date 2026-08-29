import assert from 'node:assert/strict';
import test from 'node:test';

import {
  endRegionEvent,
  getRegionEvent,
  listRegionEvents,
  previewRegionEvents,
} from '../src/lib/region-event-api.ts';

test('region event API uses preview, list, detail and end contracts', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return [];
  };
  await previewRegionEvents(request, {
    regionIds: ['forehead'],
    recordedAt: '2026-08-24T08:00:00Z',
    timezoneOffsetMinutes: 480,
  });
  await listRegionEvents(request, 'current');
  await getRegionEvent(request, 41);
  await endRegionEvent(request, 41, new Date('2026-08-24T08:00:00Z'));

  assert.equal(calls[0].path, '/region-events/preview');
  assert.equal(calls[1].path, '/region-events?status=current');
  assert.equal(calls[2].path, '/region-events/41');
  assert.equal(calls[3].path, '/region-events/41/end');
  assert.equal(calls[3].init.method, 'POST');
});
