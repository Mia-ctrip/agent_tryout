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

test('MVP theme exposes the approved seven-color palette', () => {
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
      iris: '#8F85CE',
      irisStrong: '#6F63B7',
      lavender: '#F2EFF8',
      sage: '#C5DCCC',
      amber: '#ECD083',
      warmGray: '#5A5651',
      warmWhite: '#FFFDF8',
    },
  );
});

test('legacy semantic color keys resolve onto the MVP palette', () => {
  assert.equal(colors.background, colors.warmWhite);
  assert.equal(colors.surface, colors.warmWhite);
  assert.equal(colors.surfaceMuted, colors.lavender);
  assert.equal(colors.text, colors.warmGray);
  assert.equal(colors.primary, colors.irisStrong);
  assert.equal(colors.primarySoft, colors.lavender);
});
