// Pass an Android uiautomator XML dump taken on the journey region overview.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

assert.ok(process.argv[2], 'Usage: node scripts/verify-history-face-layout.mjs <ui.xml>');
const xml = readFileSync(process.argv[2], 'utf8');
const canvas = xml.match(/<node\b[^>]*resource-id="history-face-canvas"[^>]*>/)?.[0];
assert.ok(canvas, 'Open the journey region overview before capturing the UI');
const bounds = canvas.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
assert.ok(bounds, 'Face canvas must expose measured native bounds');
const [, left, top, right, bottom] = bounds.map(Number);
const width = right - left;
const height = bottom - top;
assert.ok(width > 0 && height > 0, 'Face canvas must be visible');
assert.ok(Math.abs(height - width * 366 / 340) <= 2,
  `Portrait stretched to ${width} x ${height}; expected height ${Math.round(width * 366 / 340)}. SVG and labels must use the same scale.`);
console.log(`PASS: Android portrait ${width} x ${height}, uniform SVG and label scale`);
