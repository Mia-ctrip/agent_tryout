import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceCheckInDiary } from '../src/lib/diary-api.ts';

test('replaceCheckInDiary replaces the selected check-in diary', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return {
      check_in_id: 17,
      diary: {
        sleep_hours: 7.5,
        stress_level: 4,
        diet_tags: ['spicy'],
      },
    };
  };

  const result = await replaceCheckInDiary(request, 17, {
    sleep_hours: 7.5,
    stress_level: 4,
    diet_tags: ['spicy'],
  });

  assert.equal(result.diary.sleep_hours, 7.5);
  assert.deepEqual(calls, [
    {
      path: '/check-ins/17/diary',
      init: {
        method: 'PUT',
        body: JSON.stringify({
          sleep_hours: 7.5,
          stress_level: 4,
          diet_tags: ['spicy'],
        }),
      },
    },
  ]);
});

test('replaceCheckInDiary sends an empty object to clear the diary', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return { check_in_id: 17, diary: null };
  };

  const result = await replaceCheckInDiary(request, 17, {});

  assert.equal(result.diary, null);
  assert.equal(calls[0].init.body, '{}');
});
