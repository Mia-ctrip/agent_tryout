import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const screen = readFileSync(
  fileURLToPath(new URL('../src/app/observation/new.tsx', import.meta.url)),
  'utf8',
);

const cameraOverlay = readFileSync(
  fileURLToPath(new URL('../src/components/camera-guide-overlay.tsx', import.meta.url)),
  'utf8',
);

test('live camera stays evidence-first and names the repeatable capture conditions', () => {
  assert.match(screen, /自然光/);
  assert.match(screen, /无滤镜/);
  assert.match(screen, /保持稳定距离/);
  assert.doesNotMatch(cameraOverlay, /BotanicalTrace|paper|拼贴|扫描/);
});

test('photo confirmation keeps usability, region, and optional feeling on one screen', () => {
  const confirmation = screen.slice(
    screen.indexOf("flow.status === 'selecting_regions'"),
    screen.indexOf("flow.status === 'confirming_events'"),
  );

  assert.match(confirmation, /原始照片 · 未修饰/);
  assert.match(confirmation, /光线与清晰度可以使用/);
  assert.match(confirmation, /setRegionNote/);
  assert.match(confirmation, /当天感受/);
  assert.match(confirmation, /maxLength=\{500\}/);
  assert.doesNotMatch(screen, /selectedRegions\.length >= 2|regionIds\.slice\(0, 2\)/,
    'a visual rebuild must preserve existing multi-region selection and remembered choices');
  assert.doesNotMatch(confirmation, /BotanicalTrace/);
});

test('photo confirmation exposes the approved primary and recovery actions', () => {
  const confirmation = screen.slice(
    screen.indexOf("flow.status === 'selecting_regions'"),
    screen.indexOf("flow.status === 'confirming_events'"),
  );

  assert.match(confirmation, /primaryLabel="使用这张照片"/);
  assert.match(confirmation, /secondaryLabel="重新拍摄"/);
});
