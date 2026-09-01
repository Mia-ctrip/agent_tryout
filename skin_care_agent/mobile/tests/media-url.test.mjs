import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMediaUrl } from '../src/lib/media-url.ts';

test('signed localhost media URLs use the reachable API origin on Android emulators', () => {
  assert.equal(
    resolveMediaUrl(
      'http://localhost:8000/files/observations/face.jpg?exp=1&sig=abc',
      'http://10.0.2.2:8000/api/v1',
    ),
    'http://10.0.2.2:8000/files/observations/face.jpg?exp=1&sig=abc',
  );
});

test('remote media origins remain unchanged', () => {
  assert.equal(
    resolveMediaUrl('https://cdn.example.com/face.jpg', 'http://10.0.2.2:8000/api/v1'),
    'https://cdn.example.com/face.jpg',
  );
});
