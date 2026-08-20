import assert from 'node:assert/strict';
import test from 'node:test';

import { cameraPermissionState } from '../src/lib/camera-permission.ts';

test('camera permission is loading before Expo returns a response', () => {
  assert.equal(cameraPermissionState(null), 'loading');
});

test('camera permission exposes the granted camera state', () => {
  assert.equal(
    cameraPermissionState({ granted: true, canAskAgain: true }),
    'granted',
  );
});

test('camera permission can be requested while the system allows another prompt', () => {
  assert.equal(
    cameraPermissionState({ granted: false, canAskAgain: true }),
    'request',
  );
});

test('camera permission directs permanently denied users to system settings', () => {
  assert.equal(
    cameraPermissionState({ granted: false, canAskAgain: false }),
    'settings',
  );
});
