import assert from 'node:assert/strict';
import test from 'node:test';

import {
  developmentTrendFixture,
  developmentTrendMode,
} from '../src/lib/trend-fixtures.ts';
import { recordedTrendPoints } from '../src/lib/trend-presenter.ts';

test('developmentTrendMode never enables fixtures in production', () => {
  assert.equal(developmentTrendMode(false, 'ready'), null);
  assert.equal(developmentTrendMode(true, 'unknown'), null);
  assert.equal(developmentTrendMode(true, ['ready']), null);
  assert.equal(developmentTrendMode(true, 'ready'), 'ready');
});

test('ready trend fixture matches the selected range and has region data', () => {
  const fixture = developmentTrendFixture(30);

  assert.equal(fixture.range_days, 30);
  assert.equal(fixture.daily_points.length, 30);
  assert.equal(recordedTrendPoints(fixture.daily_points).length, 4);
  assert.deepEqual(
    new Set(fixture.region_summaries.map((region) => region.view_type)),
    new Set(['front', 'left', 'right']),
  );
  assert.equal(fixture.highlights.length > 0, true);
});
