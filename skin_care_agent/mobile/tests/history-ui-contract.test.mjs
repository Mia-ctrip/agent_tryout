import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('history overview stays abstract and routes explicit region evidence', () => {
  const face = source('../src/components/history-face-overview.tsx');
  const overview = source('../src/app/(tabs)/history.tsx');
  assert.doesNotMatch(face, /expo-image|<Image/);
  assert.match(face, /本人真实左右/);
  assert.match(overview, /router\.push\(`\/region-event\/\$\{entry\.eventId\}`\)/);
  assert.match(overview, /event_picker/);
});

test('history overview does not render the non-region other-history section', () => {
  const overview = source('../src/app/(tabs)/history.tsx');
  assert.doesNotMatch(overview, />其他历史</);
  assert.doesNotMatch(overview, /overview\.otherHistory\.map/);
});

test('timechain is horizontal, privacy blurred, and a single node has no connector', () => {
  const timeline = source('../src/components/region-timechain.tsx');
  const photo = source('../src/components/privacy-photo-thumbnail.tsx');
  assert.match(timeline, /horizontal/);
  assert.match(timeline, /timepoints\.length > 1/);
  assert.match(timeline, /scrollToSelected/);
  assert.match(photo, /blurRadius=\{10\}/);
  assert.match(photo, /refreshObservationPhotoUrl/);
});

test('evidence detail keeps the existing observation route and non-causal boundary', () => {
  const detail = source('../src/app/region-event/[eventId].tsx');
  assert.match(detail, /router\.push\(`\/observation\/\$\{selectedTimepoint\.observation_id\}`\)/);
  assert.match(detail, /相邻记录只作时间上下文，不表示关联或疗效/);
  assert.match(detail, /产品使用上下文暂未加载/);
  assert.match(detail, /重新读取时间上下文/);
});
