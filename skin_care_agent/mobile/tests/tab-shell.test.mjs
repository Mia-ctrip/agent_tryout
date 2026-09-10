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
      iris: '#A9B58F',
      irisStrong: '#4A5638',
      lavender: '#C8CFAF',
      sage: '#A9B58F',
      amber: '#C89A45',
      warmGray: '#46502C',
      warmWhite: '#FBF6E8',
    },
  );
});

test('legacy semantic color keys preserve the quiet botanical surface hierarchy', () => {
  assert.equal(colors.background, '#F7F1E1');
  assert.equal(colors.surface, colors.warmWhite);
  assert.equal(colors.surfaceMuted, colors.lavender);
  assert.equal(colors.text, colors.warmGray);
  assert.equal(colors.primary, colors.irisStrong);
  assert.equal(colors.primarySoft, colors.lavender);
});
