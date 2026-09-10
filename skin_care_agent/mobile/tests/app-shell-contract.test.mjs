import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appButtonPresentation,
  appScreenPresentation,
} from '../src/lib/app-shell.ts';
import { tabVisualState } from '../src/lib/tab-shell.ts';

test('screen variants separate ordinary, form, and camera surfaces', () => {
  assert.deepEqual(appScreenPresentation('paper'), {
    background: '#F7F1E1',
    horizontalPadding: 24,
    verticalPadding: 32,
    edgeToEdge: false,
    decorationAllowed: true,
  });
  assert.deepEqual(appScreenPresentation('form'), {
    background: '#F7F1E1',
    horizontalPadding: 20,
    verticalPadding: 24,
    edgeToEdge: false,
    decorationAllowed: false,
  });
  assert.deepEqual(appScreenPresentation('camera'), {
    background: '#4A5638',
    horizontalPadding: 0,
    verticalPadding: 0,
    edgeToEdge: true,
    decorationAllowed: false,
  });
});

test('button variants share accessible height while keeping one dominant treatment', () => {
  const primary = appButtonPresentation('primary');
  const secondary = appButtonPresentation('secondary');
  const danger = appButtonPresentation('danger');

  assert.ok(primary.minHeight >= 44);
  assert.equal(primary.borderRadius, 999);
  assert.equal(primary.backgroundColor, '#4A5638');
  assert.equal(secondary.backgroundColor, 'transparent');
  assert.equal(secondary.borderColor, '#6D7A54');
  assert.equal(danger.borderColor, '#8A4D3E');
  assert.notEqual(danger.backgroundColor, primary.backgroundColor);
});

test('selected tabs use color, weight, and a line rather than color alone', () => {
  assert.deepEqual(tabVisualState(true), {
    color: '#4A5638',
    fontWeight: '700',
    indicatorOpacity: 1,
  });
  assert.deepEqual(tabVisualState(false), {
    color: '#8A8670',
    fontWeight: '500',
    indicatorOpacity: 0,
  });
});
