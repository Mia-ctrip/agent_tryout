import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCameraMaskSvg,
  buildAnalysisGridSvg,
  buildFaceRegionOverlaySvg,
  buildRegionChoiceItems,
  svgDataUri,
} from '../src/lib/face-analysis-visual.ts';

const geometry = [
  {
    region_id: 'forehead',
    points: [
      { x: 0.35, y: 0.2 }, { x: 0.5, y: 0.16 }, { x: 0.65, y: 0.2 },
      { x: 0.64, y: 0.31 }, { x: 0.5, y: 0.34 }, { x: 0.36, y: 0.31 },
    ],
  },
  {
    region_id: 'chin',
    points: [
      { x: 0.38, y: 0.72 }, { x: 0.5, y: 0.77 }, { x: 0.62, y: 0.72 },
      { x: 0.6, y: 0.84 }, { x: 0.5, y: 0.88 }, { x: 0.4, y: 0.84 },
    ],
  },
];

const fullGeometry = [
  ...geometry,
  {
    region_id: 'left_face',
    points: [
      { x: 0.6, y: 0.42 }, { x: 0.75, y: 0.46 }, { x: 0.77, y: 0.62 },
      { x: 0.64, y: 0.68 }, { x: 0.56, y: 0.56 }, { x: 0.57, y: 0.47 },
    ],
  },
  {
    region_id: 'right_face',
    points: [
      { x: 0.4, y: 0.42 }, { x: 0.43, y: 0.47 }, { x: 0.44, y: 0.56 },
      { x: 0.36, y: 0.68 }, { x: 0.23, y: 0.62 }, { x: 0.25, y: 0.46 },
    ],
  },
  {
    region_id: 'nose_area',
    points: [
      { x: 0.5, y: 0.38 }, { x: 0.58, y: 0.58 }, { x: 0.5, y: 0.66 },
      { x: 0.42, y: 0.58 }, { x: 0.46, y: 0.44 }, { x: 0.54, y: 0.44 },
    ],
  },
  {
    region_id: 'mouth_area',
    points: [
      { x: 0.38, y: 0.64 }, { x: 0.62, y: 0.64 }, { x: 0.64, y: 0.76 },
      { x: 0.5, y: 0.79 }, { x: 0.36, y: 0.76 }, { x: 0.36, y: 0.68 },
    ],
  },
];

test('region choices distinguish locked task regions from user concerns with text', () => {
  const items = buildRegionChoiceItems(['forehead', 'chin'], ['forehead']);
  const forehead = items.find((item) => item.id === 'forehead');
  const chin = items.find((item) => item.id === 'chin');
  assert.equal(forehead.badge, '本次必检');
  assert.equal(forehead.locked, true);
  assert.equal(chin.badge, '我想关注');
  assert.equal(chin.locked, false);
});

test('overlay keeps selected skin visible, compacts region lines and preserves generous hit targets', () => {
  const model = buildFaceRegionOverlaySvg({
    geometry,
    selected: ['forehead'],
    activeRegion: 'forehead',
    sourceSize: { width: 100, height: 100 },
    viewportSize: { width: 100, height: 100 },
  });
  assert.match(model.svg, /stroke-dasharray="5 4"/);
  assert.match(model.svg, /data-region="forehead"[^>]*fill="none"/);
  assert.doesNotMatch(model.svg, /fill-opacity="0\.12"/);
  const forehead = model.hitTargets.find((target) => target.regionId === 'forehead');
  assert.ok(forehead.visualBounds.width < 30);
  assert.ok(forehead.visualBounds.height < 18);
  assert.equal(model.callouts.length, 1);
  assert.equal(model.callouts[0].regionId, 'forehead');
  assert.equal(model.hitTargets.length, 2);
  assert.ok(model.hitTargets.every((target) => target.bounds.width >= 44));
  assert.match(model.svg, /<path/);
});

test('default overlay keeps only the active callout outside the selection screen', () => {
  const model = buildFaceRegionOverlaySvg({
    geometry,
    selected: ['forehead', 'chin'],
    activeRegion: 'forehead',
    sourceSize: { width: 100, height: 100 },
    viewportSize: { width: 100, height: 100 },
  });

  assert.deepEqual(model.callouts.map((callout) => callout.regionId), ['forehead']);
});

test('overlay adds a quiet double full-face guide and Perfect Corp-style callouts for all selections', () => {
  const selected = fullGeometry.map((region) => region.region_id);
  const model = buildFaceRegionOverlaySvg({
    geometry: fullGeometry,
    selected,
    activeRegion: 'chin',
    calloutMode: 'all',
    sourceSize: { width: 100, height: 100 },
    viewportSize: { width: 320, height: 480 },
  });

  assert.match(model.svg, /data-role="face-outline"/);
  assert.match(model.svg, /data-role="face-outline-inner"/);
  assert.match(model.svg, /data-role="face-outline"[^>]+stroke-opacity="0\.68"/);
  assert.doesNotMatch(model.svg, /stroke="rgba\(/);
  assert.equal(model.callouts.length, 6);
  assert.deepEqual(
    model.callouts.filter((callout) => callout.side === 'left').map((callout) => callout.regionId),
    ['forehead', 'right_face', 'mouth_area'],
  );
  assert.deepEqual(
    model.callouts.filter((callout) => callout.side === 'right').map((callout) => callout.regionId),
    ['nose_area', 'left_face', 'chin'],
  );
  assert.deepEqual(
    model.callouts.filter((callout) => callout.active).map((callout) => callout.regionId),
    ['chin'],
  );
});

test('analysis scan visual is a two-dimensional grid rather than a single scan line', () => {
  const svg = buildAnalysisGridSvg(320, 480);
  assert.match(svg, /M28 0V480/);
  assert.match(svg, /M0 28H320/);
  assert.doesNotMatch(svg, /linearGradient|filter=/);
});

test('camera mask is a warm translucent even-odd overlay with a clear oval', () => {
  const svg = buildCameraMaskSvg(320, 480);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.match(svg, /rgba\(70,80,44,0\.24\)/);
  assert.match(svg, /<ellipse/);
});

test('generated SVG uses an Android-compatible base64 data URI', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H1"/></svg>';
  const uri = svgDataUri(svg);

  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  assert.equal(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'), svg);
});
