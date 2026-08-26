import assert from 'node:assert/strict';
import test from 'node:test';

import {
  choiceRequiredRegions,
  regionEventDecisionError,
} from '../src/lib/region-event-flow.ts';

const previews = [
  { region_id: 'forehead', action: 'choice_required', days_since_last: 30 },
  { region_id: 'chin', action: 'choice_required', days_since_last: 35 },
  { region_id: 'nose_area', action: 'auto_continue', days_since_last: 4 },
];

test('multiple 30-day choices are summarized in one confirmation step', () => {
  assert.deepEqual(choiceRequiredRegions(previews), ['forehead', 'chin']);
  assert.match(regionEventDecisionError(previews, {}), /额头/);
  assert.match(
    regionEventDecisionError(previews, { forehead: 'continue' }),
    /下巴/,
  );
  assert.equal(
    regionEventDecisionError(previews, {
      forehead: 'continue',
      chin: 'start_new',
    }),
    null,
  );
});
