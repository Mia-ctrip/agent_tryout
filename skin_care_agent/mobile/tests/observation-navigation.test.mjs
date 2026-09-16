import assert from 'node:assert/strict';
import test from 'node:test';

import {
  observationCaptureHref,
  observationDetailBackTarget,
} from '../src/lib/observation-navigation.ts';
import * as observationNavigation from '../src/lib/observation-navigation.ts';

test('observation capture actions deep-link directly to the requested source', () => {
  assert.equal(observationCaptureHref('camera'), '/observation/new?entry=camera');
  assert.equal(observationCaptureHref('library'), '/observation/new?entry=library');
});

test('observation detail keeps native stack navigation when history exists', () => {
  assert.equal(
    observationDetailBackTarget(true),
    'native',
  );
});

test('observation detail falls back to the history tab without stack history', () => {
  assert.equal(
    observationDetailBackTarget(false),
    '/(tabs)/history',
  );
});

test('full-face history drill-down keeps overview and fallback return context', () => {
  assert.equal(
    observationNavigation.observationDetailHref(42, 'history_full_face'),
    '/observation/42?view=overview&source=history_full_face',
  );
  assert.equal(
    observationDetailBackTarget(false, 'history_full_face'),
    '/(tabs)/history?view=full_face',
  );
});

test('product-use routes preserve their source and stable flow identity', () => {
  assert.equal(typeof observationNavigation.productUseHref, 'function');
  assert.equal(
    observationNavigation.productUseHref({
      source: 'after_observation',
      flowId: '11111111-1111-4111-8111-111111111111',
      observationId: 42,
    }),
    '/product-use/new?source=after_observation&flowId=11111111-1111-4111-8111-111111111111&observationId=42',
  );
  assert.equal(
    observationNavigation.productUseHref({
      source: 'region_event',
      flowId: '22222222-2222-4222-8222-222222222222',
      observationId: 42,
      eventId: 8,
    }),
    '/product-use/new?source=region_event&flowId=22222222-2222-4222-8222-222222222222&observationId=42&eventId=8',
  );
});

test('product-use exits return to the exact source without reopening capture', () => {
  assert.equal(typeof observationNavigation.productUseExitTarget, 'function');
  assert.equal(
    observationNavigation.productUseExitTarget({
      source: 'after_observation',
      observationId: 42,
    }),
    '/observation/42',
  );
  assert.equal(
    observationNavigation.productUseExitTarget({
      source: 'observation',
      observationId: 42,
    }),
    '/observation/42',
  );
  assert.equal(
    observationNavigation.productUseExitTarget({ source: 'region_event', eventId: 8 }),
    '/region-event/8',
  );
  assert.equal(
    observationNavigation.productUseExitTarget({ source: 'observe' }),
    '/(tabs)/observe',
  );
  assert.equal(
    observationNavigation.productUseExitTarget({ source: 'after_observation' }),
    '/(tabs)/observe',
  );
});
