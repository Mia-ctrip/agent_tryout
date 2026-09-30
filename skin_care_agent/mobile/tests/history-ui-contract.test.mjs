import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('history overview stays abstract and routes explicit region evidence', () => {
  const face = source('../src/components/history-face-overview.tsx');
  const overview = source('../src/app/(tabs)/history.tsx');
  assert.match(face, /source=\{\{ uri: svgDataUri\(portraitLines\) \}\}/);
  assert.doesNotMatch(face, /photoUri|ObservationPhoto|resolveMediaUrl|\.photo\.url/);
  assert.match(face, /本人真实左右/);
  assert.match(overview, /router\.push\(`\/region-event\/\$\{entry\.eventId\}`\)/);
  assert.match(overview, /event_picker/);
});

test('history overview does not render the non-region other-history section', () => {
  const overview = source('../src/app/(tabs)/history.tsx');
  assert.doesNotMatch(overview, />其他历史</);
  assert.doesNotMatch(overview, /overview\.otherHistory\.map/);
});

test('history shows region events organized above the face map without a full-face tab', () => {
  const overview = source('../src/app/(tabs)/history.tsx');
  assert.doesNotMatch(overview, /accessibilityRole="tab"/);
  assert.doesNotMatch(overview, /buildFullFaceHistory/);
  assert.doesNotMatch(overview, /FullFaceHistoryCard/);
  assert.match(overview, /<HistoryFaceOverview/);
});

test('timechain crops the selected region, blurs only legacy originals, and a single node has no connector', () => {
  const timeline = source('../src/components/region-timechain.tsx');
  const photo = source('../src/components/privacy-photo-thumbnail.tsx');
  assert.match(timeline, /horizontal/);
  assert.match(timeline, /timepoints\.length > 1/);
  assert.match(timeline, /scrollToSelected/);
  assert.match(timeline, /regionId=\{timepoint.target.region_id\}/);
  assert.match(photo, /regionPhotoCrop\(photo, regionId, Math.max\(size, height\) - 8\)/);
  assert.match(photo, /blurRadius=\{crop \? 0 : 10\}/);
  assert.match(photo, /原图预览/);
  assert.match(photo, /refreshObservationPhotoUrl/);
});

test('evidence detail keeps the existing observation route and non-causal boundary', () => {
  const detail = source('../src/app/region-event/[eventId].tsx');
  assert.match(detail, /router\.push\(`\/observation\/\$\{selectedTimepoint\.observation_id\}`\)/);
  assert.match(detail, /相邻记录只作时间上下文，不表示关联或疗效/);
  const card = source('../src/components/timepoint-evidence-card.tsx');
  assert.match(card, /产品使用暂未加载/);
  assert.match(card, /onPress=\{onRetryProducts\}/);
  assert.match(detail, /onRetryProducts=/);
  for (const label of ['照片中可见', '你的记录', '产品使用记录', '来源']) assert.ok(card.includes('label="' + label + '"'));
  assert.doesNotMatch(card, /numberOfLines=/);
});
