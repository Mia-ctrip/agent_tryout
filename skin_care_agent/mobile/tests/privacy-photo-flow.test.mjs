import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPrivacyPhotoRefresh,
  beginPrivacyPhotoAutomaticRefresh,
  createPrivacyPhotoState,
  markPrivacyPhotoLoaded,
  syncPrivacyPhotoSource,
} from '../src/lib/privacy-photo-flow.ts';

test('a loaded refreshed URL may automatically re-sign again after a later expiry', () => {
  let state = createPrivacyPhotoState(7, 'https://media/first');
  let attempt = beginPrivacyPhotoAutomaticRefresh(state);
  assert.equal(attempt.shouldRefresh, true);
  state = applyPrivacyPhotoRefresh(attempt.state, 'https://media/second');

  attempt = beginPrivacyPhotoAutomaticRefresh(state);
  assert.equal(attempt.shouldRefresh, false, 'a broken replacement URL must not loop');

  state = markPrivacyPhotoLoaded(state);
  attempt = beginPrivacyPhotoAutomaticRefresh(state);
  assert.equal(attempt.shouldRefresh, true, 'a later expiry gets one fresh automatic retry');
});

test('a parent photo URL update replaces stale local state and restores automatic retry', () => {
  let state = createPrivacyPhotoState(7, 'https://media/first');
  state = beginPrivacyPhotoAutomaticRefresh(state).state;
  state = applyPrivacyPhotoRefresh(state, 'https://media/refreshed');

  state = syncPrivacyPhotoSource(state, 7, 'https://media/from-parent');

  assert.equal(state.displayUrl, 'https://media/from-parent');
  assert.equal(beginPrivacyPhotoAutomaticRefresh(state).shouldRefresh, true);
});

test('switching photo IDs never keeps another photo signed URL', () => {
  const oldState = applyPrivacyPhotoRefresh(
    createPrivacyPhotoState(7, 'https://media/old'),
    'https://media/old-signed',
  );

  const next = syncPrivacyPhotoSource(oldState, 8, 'https://media/new');

  assert.deepEqual(next, {
    photoId: 8,
    sourceUrl: 'https://media/new',
    displayUrl: 'https://media/new',
    automaticRefreshAllowed: true,
  });
});
