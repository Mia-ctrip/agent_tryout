import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors } from '../src/constants/theme.ts';

test('shared theme exposes the approved sage semantic palette', () => {
  assert.equal(colors.background, '#F8F0DD');
  assert.equal(colors.primary, '#71813C');
  assert.equal(colors.iris, '#9BAD50');
  assert.equal(colors.text, '#46502C');
});

const retiredPurple = /#8F85CE|#6F63B7|#F2EFF8|rgba\(111,\s*99,\s*183/i;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : [join(directory, entry.name)]
  )).filter((file) => /\.(ts|tsx)$/.test(file));
}

test('mobile source no longer contains the retired purple palette', () => {
  const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => retiredPurple.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('Expo launch configuration uses the same cream background as the app', () => {
  const appConfig = readFileSync(fileURLToPath(new URL('../app.json', import.meta.url)), 'utf8');
  assert.match(appConfig, /"backgroundColor": "#F8F0DD"/);
});

test('legacy routes do not retain retired opaque foreground colors', () => {
  const retiredForeground = /#E6ECE8|#F1F4F2|#FFD4D0/i;
  const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => retiredForeground.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});

test('observation visuals do not retain the superseded forest and sage values', () => {
  const supersededObservationColors = /#7F9465|#F0E8D9|#A8BC8F|#D9BA84|#9DB087|#F6D7CB|rgba\(31,42,34,0\.38\)/i;
  const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => supersededObservationColors.test(readFileSync(file, 'utf8')));

  assert.deepEqual(offenders, []);
});
