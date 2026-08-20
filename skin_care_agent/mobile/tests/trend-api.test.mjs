import assert from 'node:assert/strict';
import test from 'node:test';

import { getTrendSummary } from '../src/lib/trend-api.ts';

test('getTrendSummary requests the selected day range', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return {
      range_days: 30,
      start_date: '2026-07-01',
      end_date: '2026-07-30',
      total_analyses: 6,
      total_check_ins: 2,
      incomplete_check_ins: 1,
      superseded_check_ins: 0,
      total_legacy_records: 0,
      total_active_lineages: 4,
      total_new_lineages_in_range: 2,
      total_healed_lineages_in_range: 1,
      daily_points: [],
      region_summaries: [],
      highlights: [],
    };
  };

  const result = await getTrendSummary(request, 30);

  assert.equal(result.range_days, 30);
  assert.deepEqual(calls, [
    {
      path: '/trends/summary?days=30',
      init: undefined,
    },
  ]);
});
