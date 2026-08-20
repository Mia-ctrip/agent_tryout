import assert from 'node:assert/strict';
import test from 'node:test';

import {
  developmentAnalysisFixture,
  developmentAnalysisMode,
} from '../src/lib/analysis-fixtures.ts';

test('developmentAnalysisMode never enables fixtures outside development', () => {
  assert.equal(developmentAnalysisMode(false, 'ready'), null);
  assert.equal(developmentAnalysisMode(true, 'unknown'), null);
  assert.equal(developmentAnalysisMode(true, ['ready']), null);
  assert.equal(developmentAnalysisMode(true, 'ready'), 'ready');
});

test('ready fixture contains all three aggregated views', () => {
  const fixture = developmentAnalysisFixture('ready');

  assert.equal(fixture.summary.aggregation_status, 'ready');
  assert.equal(fixture.summary.analyzed_view_count, 3);
  assert.deepEqual(
    fixture.summary.view_summaries.map((view) => view.view_type),
    ['front', 'left', 'right'],
  );
  assert.deepEqual(
    fixture.states.map((state) => state.status),
    ['success', 'success', 'success'],
  );
});

test('failed fixture preserves successful views and marks only one for retry', () => {
  const fixture = developmentAnalysisFixture('failed');

  assert.equal(fixture.summary.aggregation_status, 'partial');
  assert.deepEqual(
    fixture.states.map((state) => state.status),
    ['success', 'failed', 'success'],
  );
});

test('partial fixture exposes two completed views and one pending view', () => {
  const fixture = developmentAnalysisFixture('partial');

  assert.equal(fixture.summary.analyzed_view_count, 2);
  assert.deepEqual(
    fixture.states.map((state) => state.status),
    ['success', 'success', 'pending'],
  );
});

test('doctor fixture triggers the restrained care prompt state', () => {
  const fixture = developmentAnalysisFixture('doctor');

  assert.equal(fixture.summary.needs_doctor, true);
  assert.equal(fixture.summary.aggregation_status, 'ready');
});
