import assert from 'node:assert/strict';
import test from 'node:test';

import { listTimeline } from '../src/lib/timeline-api.ts';
import { presentTimelineItem, timelineItemTarget } from '../src/lib/timeline-flow.ts';


test('timeline API requests the unified authenticated feed', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return [];
  };

  await listTimeline(request, 40);

  assert.equal(calls[0].path, '/timeline?limit=40');
});


test('timeline navigation keeps event and historical full-face drill-downs', () => {
  assert.equal(
    timelineItemTarget({ kind: 'region_event', event_id: 7 }),
    '/region-event/7',
  );
  assert.equal(
    timelineItemTarget({ kind: 'full_face_observation', observation_id: 8 }),
    '/observation/8',
  );
  assert.equal(timelineItemTarget({ kind: 'product_use', product_use_id: 9 }), null);
});


test('product timeline copy remains factual for named and unnamed uses', () => {
  assert.deepEqual(
    presentTimelineItem({
      kind: 'product_use',
      timeline_id: 'product_use:1',
      occurred_at: '2026-08-24T09:00:00+08:00',
      product_use_id: 1,
      used_at: '2026-08-24T09:00:00+08:00',
      products: [],
      note: null,
      source: 'user_record',
    }),
    {
      eyebrow: '产品使用 · 用户记录',
      title: '未注明产品',
      detail: '只记录当时真实使用，不代表关联或疗效。',
    },
  );
});


test('region timeline copy reports organization and source without a trend claim', () => {
  assert.deepEqual(
    presentTimelineItem({
      kind: 'region_event',
      timeline_id: 'region_event:2',
      occurred_at: '2026-08-24T08:00:00+08:00',
      event_id: 2,
      region_id: 'left_face',
      status: 'current',
      started_local_date: '2026-08-20',
      last_valid_local_date: '2026-08-24',
      timepoint_count: 2,
      sources: ['photo_analysis', 'user_record'],
    }),
    {
      eyebrow: '区域记录 · 照片整理与用户记录',
      title: '左侧脸',
      detail: '2 个有效时间点 · 正在记录',
    },
  );
});
