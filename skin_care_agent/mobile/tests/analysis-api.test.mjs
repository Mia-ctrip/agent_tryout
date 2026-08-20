import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPhotoAnalysis,
  getCheckInAnalysisSummary,
} from '../src/lib/analysis-api.ts';

test('createPhotoAnalysis reuses the backend cache by default', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return {
      analysis_id: 41,
      photo_id: 23,
      provider: 'qwen',
      model: 'qwen-vl-max',
      parsed_result: {},
      overall_severity: 3,
      skin_health_index: 72,
      needs_doctor: false,
      created_at: '2026-07-30T09:00:00Z',
      cached: true,
    };
  };

  const result = await createPhotoAnalysis(request, 23);

  assert.equal(result.cached, true);
  assert.deepEqual(calls, [
    {
      path: '/analyses',
      init: {
        method: 'POST',
        body: JSON.stringify({ photo_id: 23, force: false }),
      },
    },
  ]);
});

test('getCheckInAnalysisSummary loads the aggregate for one check-in', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return {
      check_in_id: 17,
      aggregation_status: 'partial',
      analyzed_view_count: 2,
    };
  };

  const result = await getCheckInAnalysisSummary(request, 17);

  assert.equal(result.analyzed_view_count, 2);
  assert.deepEqual(calls, [
    {
      path: '/check-ins/17/analysis-summary',
      init: undefined,
    },
  ]);
});

test('createPhotoAnalysis shares one in-flight request for the same photo', async () => {
  let resolveRequest;
  let callCount = 0;
  const request = async () => {
    callCount += 1;
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = createPhotoAnalysis(request, 23);
  const second = createPhotoAnalysis(request, 23);

  assert.equal(callCount, 1);
  resolveRequest({
    analysis_id: 41,
    photo_id: 23,
    cached: false,
  });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.analysis_id, 41);
  assert.equal(secondResult.analysis_id, 41);
});

test('createPhotoAnalysis releases a failed in-flight request for retry', async () => {
  let callCount = 0;
  const request = async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new Error('temporary failure');
    }
    return {
      analysis_id: 42,
      photo_id: 23,
      cached: false,
    };
  };

  await assert.rejects(createPhotoAnalysis(request, 23));
  const result = await createPhotoAnalysis(request, 23);

  assert.equal(callCount, 2);
  assert.equal(result.analysis_id, 42);
});
