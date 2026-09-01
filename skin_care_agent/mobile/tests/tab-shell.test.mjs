import assert from 'node:assert/strict';
import test from 'node:test';

import { colors } from '../src/constants/theme.ts';
import { TAB_SPECS } from '../src/lib/tab-shell.ts';

test('MVP shell keeps the confirmed four-tab order and labels', () => {
  assert.deepEqual(
    TAB_SPECS.map(({ route, label }) => ({ route, label })),
    [
      { route: 'observe', label: '观察' },
      { route: 'history', label: '历程' },
      { route: 'products', label: '产品' },
      { route: 'me', label: '我的' },
    ],
  );
  assert.equal(new Set(TAB_SPECS.map(({ route }) => route)).size, 4);
});

test('every MVP tab defines platform-native symbol names', () => {
  for (const tab of TAB_SPECS) {
    assert.ok(tab.symbol.ios);
    assert.ok(tab.symbol.android);
    assert.ok(tab.symbol.web);
  }
});

test('MVP theme exposes the approved sage palette', () => {
  assert.deepEqual(
    {
      iris: colors.iris,
      irisStrong: colors.irisStrong,
      lavender: colors.lavender,
      sage: colors.sage,
      amber: colors.amber,
      warmGray: colors.warmGray,
      warmWhite: colors.warmWhite,
    },
    {
      iris: '#9BAD50',
      irisStrong: '#71813C',
      lavender: '#EDF1DF',
      sage: '#EDF1DF',
      amber: '#E8C76A',
      warmGray: '#46502C',
      warmWhite: '#FFFDF7',
    },
  );
});

test('legacy semantic color keys preserve the sage surface hierarchy', () => {
  assert.equal(colors.background, '#F8F0DD');
  assert.equal(colors.surface, colors.warmWhite);
  assert.equal(colors.surfaceMuted, colors.lavender);
  assert.equal(colors.text, colors.warmGray);
  assert.equal(colors.primary, colors.irisStrong);
  assert.equal(colors.primarySoft, colors.lavender);
});
