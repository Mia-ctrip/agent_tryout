import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { colors, overlayOpacity, spacing } from '../src/constants/theme.ts';

test('shared theme exposes the quiet botanical semantic palette', () => {
  assert.equal(colors.ground, '#EFE8D6');
  assert.equal(colors.paper, '#F7F1E1');
  assert.equal(colors.paperElevated, '#FBF6E8');
  assert.equal(colors.sage, '#A9B58F');
  assert.equal(colors.sageSoft, '#C8CFAF');
  assert.equal(colors.moss, '#6D7A54');
  assert.equal(colors.mossDeep, '#4A5638');
  assert.equal(colors.earth, '#3E362B');
  assert.equal(colors.ink, '#2E2A21');
  assert.equal(colors.text, '#46502C');
  assert.equal(colors.hairline, '#D9D2BB');
  assert.equal(colors.hairlineSoft, '#E4DEC8');
  assert.equal(colors.amber, '#C89A45');
  assert.equal(colors.clay, '#8A4D3E');
});

test('shared theme exposes the complete spacing and decorative intensity scales', () => {
  assert.equal(spacing.xxxl, 40);
  assert.equal(spacing.ritual, 64);
  assert.deepEqual(overlayOpacity, {
    whisper: 0.08,
    soft: 0.16,
    medium: 0.28,
    strong: 0.45,
  });
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
  assert.match(appConfig, /"backgroundColor": "#F7F1E1"/);
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
