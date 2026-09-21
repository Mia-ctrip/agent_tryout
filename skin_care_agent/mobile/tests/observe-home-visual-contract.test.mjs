import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildEditorialCollageModel } from '../src/lib/observe-home-visual.ts';

test('observe hero reserves a two-image editorial dose without unlicensed assets', () => {
  assert.deepEqual(
    buildEditorialCollageModel({
      primaryRegistered: false,
      secondaryRegistered: false,
      imageDose: 'hero',
    }),
    {
      itemCount: 2,
      imageDose: 'hero',
      licensedAssetsReady: false,
      renderPlaceholder: true,
      accessibilitySummary: '品牌影像位置暂以纸面构图呈现',
    },
  );
});

test('observe home leads with one primary action and lightweight current context', () => {
  const page = readFileSync(
    fileURLToPath(new URL('../src/app/(tabs)/observe.tsx', import.meta.url)),
    'utf8',
  );

  assert.match(page, /<EditorialCollage/);
  assert.match(page, /title=\{'今天，也留下一次\\n真实观察'\}/);
  assert.match(page, /label="开始今天的观察"/);
  assert.equal((page.match(/variant="primary"/g) ?? []).length, 1);
  assert.ok(page.indexOf('开始今天的观察') < page.indexOf('title="正在观察"'));
  assert.match(page, /eyebrow="CURRENT"/);
  assert.doesNotMatch(page, /最近记录|ObservationListItem|RegionEventCard|listObservations|setLatest/);
  assert.doesNotMatch(page, /skin-care-ui-rebuild-handoff|golden-preview|motion-reference/);
});

test('brand asset registry documents rights before accepting imagery', () => {
  const rights = readFileSync(
    fileURLToPath(new URL('../assets/brand/ASSET_RIGHTS.md', import.meta.url)),
    'utf8',
  );
  assert.match(rights, /natural-light-v1\.png/);
  assert.match(rights, /leaf-water-v1\.png/);
  assert.match(rights, /来源|授权|审核/);
});
