import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildBotanicalTraceModel,
  quietNoticePresentation,
} from '../src/lib/quiet-visuals.ts';

test('botanical traces are always decorative, inert, and token-bound', () => {
  assert.deepEqual(
    buildBotanicalTraceModel({
      kind: 'sprig',
      intensity: 'whisper',
      placement: 'topRight',
    }),
    {
      kind: 'sprig',
      opacity: 0.08,
      placement: 'topRight',
      pointerEvents: 'none',
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    },
  );

  assert.equal(
    buildBotanicalTraceModel({ kind: 'bokeh', intensity: 'medium' }).opacity,
    0.28,
  );
});

test('quiet notices provide a visible semantic cue in addition to tone', () => {
  for (const tone of ['neutral', 'privacy', 'medical', 'nonCausal', 'error']) {
    const presentation = quietNoticePresentation(tone);
    assert.ok(presentation.symbol.length > 0);
    assert.ok(presentation.accessibilityLabel.length > 0);
  }
  assert.equal(quietNoticePresentation('medical').accessibilityLabel, '医疗边界说明');
  assert.equal(quietNoticePresentation('error').accessibilityLabel, '错误提示');
});

test('shared visual components keep decoration outside evidence and business state', () => {
  const botanical = readFileSync(
    fileURLToPath(new URL('../src/components/botanical-trace.tsx', import.meta.url)),
    'utf8',
  );
  const header = readFileSync(
    fileURLToPath(new URL('../src/components/editorial-header.tsx', import.meta.url)),
    'utf8',
  );

  assert.doesNotMatch(botanical, /photoUri|observation|product|status:/i);
  assert.match(header, /<BotanicalTrace/);
  assert.doesNotMatch(header, /Image|photoUri|evidence/i);
});
