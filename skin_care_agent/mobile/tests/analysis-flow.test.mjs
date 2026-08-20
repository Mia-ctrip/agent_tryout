import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analysisRecoveryAction,
  buildAnalysisViewStates,
  completedAnalysisCount,
  createAnalysisGenerationGuard,
  runMissingViewAnalyses,
} from '../src/lib/analysis-flow.ts';

const photos = [
  { photo_id: 11, view_type: 'front' },
  { photo_id: 12, view_type: 'left' },
  { photo_id: 13, view_type: 'right' },
];

const partialSummary = {
  view_summaries: [
    { view_type: 'front', photo_id: 11, analysis_id: 101 },
    { view_type: 'left', photo_id: 12, analysis_id: 102 },
  ],
};

test('buildAnalysisViewStates restores successful views from the aggregate', () => {
  const states = buildAnalysisViewStates(photos, partialSummary);

  assert.deepEqual(
    states.map(({ viewType, photoId, status, analysisId }) => ({
      viewType,
      photoId,
      status,
      analysisId,
    })),
    [
      {
        viewType: 'front',
        photoId: 11,
        status: 'success',
        analysisId: 101,
      },
      {
        viewType: 'left',
        photoId: 12,
        status: 'success',
        analysisId: 102,
      },
      {
        viewType: 'right',
        photoId: 13,
        status: 'pending',
        analysisId: null,
      },
    ],
  );
  assert.equal(completedAnalysisCount(states), 2);
});

test('runMissingViewAnalyses skips successful views and analyzes only missing views', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body) });
    return {
      analysis_id: 103,
      photo_id: 13,
      cached: false,
    };
  };
  const initial = buildAnalysisViewStates(photos, partialSummary);

  const result = await runMissingViewAnalyses(request, initial);

  assert.deepEqual(calls, [
    {
      path: '/analyses',
      body: { photo_id: 13, force: false },
    },
  ]);
  assert.equal(completedAnalysisCount(result), 3);
  assert.equal(result[2].status, 'success');
  assert.equal(result[2].analysisId, 103);
});

test('runMissingViewAnalyses continues after one view fails', async () => {
  const analyzedPhotoIds = [];
  const request = async (_path, init) => {
    const { photo_id: photoId } = JSON.parse(init.body);
    analyzedPhotoIds.push(photoId);
    if (photoId === 12) {
      throw new Error('left view failed');
    }
    return {
      analysis_id: photoId + 100,
      photo_id: photoId,
      cached: false,
    };
  };

  const result = await runMissingViewAnalyses(
    request,
    buildAnalysisViewStates(photos, { view_summaries: [] }),
  );

  assert.deepEqual(analyzedPhotoIds, [11, 12, 13]);
  assert.deepEqual(
    result.map(({ status }) => status),
    ['success', 'failed', 'success'],
  );
  assert.equal(result[1].error.message, 'left view failed');
  assert.equal(completedAnalysisCount(result), 2);
});

test('retrying a partial result calls only the failed view', async () => {
  let firstAttempt = true;
  const firstRequest = async (_path, init) => {
    const { photo_id: photoId } = JSON.parse(init.body);
    if (photoId === 12 && firstAttempt) {
      firstAttempt = false;
      throw new Error('temporary failure');
    }
    return {
      analysis_id: photoId + 100,
      photo_id: photoId,
      cached: false,
    };
  };
  const firstResult = await runMissingViewAnalyses(
    firstRequest,
    buildAnalysisViewStates(photos, { view_summaries: [] }),
  );
  const retriedPhotoIds = [];
  const retryRequest = async (_path, init) => {
    const { photo_id: photoId } = JSON.parse(init.body);
    retriedPhotoIds.push(photoId);
    return {
      analysis_id: photoId + 200,
      photo_id: photoId,
      cached: false,
    };
  };

  const retried = await runMissingViewAnalyses(retryRequest, firstResult);

  assert.deepEqual(retriedPhotoIds, [12]);
  assert.deepEqual(
    retried.map(({ status }) => status),
    ['success', 'success', 'success'],
  );
  assert.equal(retried[1].analysisId, 212);
});

test('runMissingViewAnalyses reports incremental completed counts', async () => {
  const progress = [];
  const request = async (_path, init) => {
    const { photo_id: photoId } = JSON.parse(init.body);
    return {
      analysis_id: photoId + 100,
      photo_id: photoId,
      cached: false,
    };
  };

  await runMissingViewAnalyses(
    request,
    buildAnalysisViewStates(photos, { view_summaries: [] }),
    (states) => {
      progress.push(completedAnalysisCount(states));
    },
  );

  assert.deepEqual(progress, [0, 1, 1, 2, 2, 3]);
});

test('runMissingViewAnalyses never resubmits a view already being analyzed', async () => {
  const analyzedPhotoIds = [];
  const request = async (_path, init) => {
    const { photo_id: photoId } = JSON.parse(init.body);
    analyzedPhotoIds.push(photoId);
    return {
      analysis_id: photoId + 100,
      photo_id: photoId,
      cached: false,
    };
  };
  const states = buildAnalysisViewStates(photos, partialSummary);
  states[2] = {
    ...states[2],
    status: 'analyzing',
  };

  const result = await runMissingViewAnalyses(request, states);

  assert.deepEqual(analyzedPhotoIds, []);
  assert.equal(result[2].status, 'analyzing');
});

test('analysis generation guard rejects updates from an older load', () => {
  const guard = createAnalysisGenerationGuard();

  const first = guard.begin();
  assert.equal(guard.isCurrent(first), true);
  const second = guard.begin();

  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

test('analysisRecoveryAction separates view retry from summary refresh', () => {
  const complete = buildAnalysisViewStates(photos, {
    view_summaries: [
      { view_type: 'front', photo_id: 11, analysis_id: 101 },
      { view_type: 'left', photo_id: 12, analysis_id: 102 },
      { view_type: 'right', photo_id: 13, analysis_id: 103 },
    ],
  });
  const failed = complete.map((state) =>
    state.viewType === 'left'
      ? { ...state, status: 'failed', error: new Error('failed') }
      : state,
  );

  assert.equal(analysisRecoveryAction(failed, false), 'retry_views');
  assert.equal(analysisRecoveryAction(complete, true), 'refresh_summary');
  assert.equal(analysisRecoveryAction(complete, false), null);
});
