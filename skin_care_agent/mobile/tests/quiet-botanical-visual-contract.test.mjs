import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { observationColors } from '../src/constants/observation-theme.ts';
import { productColors } from '../src/constants/product-theme.ts';
import { colors } from '../src/constants/theme.ts';

test('observation and product themes consume shared quiet botanical roles', () => {
  assert.equal(observationColors.background, colors.paper);
  assert.equal(observationColors.surface, colors.paperElevated);
  assert.equal(observationColors.action, colors.mossDeep);
  assert.equal(observationColors.sage, colors.sage);
  assert.equal(observationColors.sageSoft, colors.sageSoft);
  assert.equal(observationColors.border, colors.hairline);

  assert.equal(productColors.background, colors.paper);
  assert.equal(productColors.surface, colors.paperElevated);
  assert.equal(productColors.actionPrimary, colors.mossDeep);
  assert.equal(productColors.selected, colors.sage);
  assert.equal(productColors.border, colors.hairline);
});

const evidenceFiles = [
  '../src/components/face-region-map.tsx',
  '../src/components/privacy-photo-thumbnail.tsx',
  '../src/components/timepoint-evidence-card.tsx',
  '../src/components/observation-result.tsx',
];

const decorationImport = /botanical-trace|film-grain|decorative-overlay/i;

test('evidence components never import botanical or grain decoration', () => {
  const offenders = evidenceFiles.filter((path) => {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    return decorationImport.test(source);
  });

  assert.deepEqual(offenders, []);
});

const undecoratedTaskFiles = [
  '../src/app/login.tsx',
  '../src/app/register.tsx',
  '../src/app/consents.tsx',
  '../src/app/product/new.tsx',
  '../src/app/product-use/new.tsx',
];

test('forms and recovery pages stay free of botanical decoration', () => {
  const offenders = undecoratedTaskFiles.filter((path) => {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    return decorationImport.test(source);
  });

  assert.deepEqual(offenders, []);
});
