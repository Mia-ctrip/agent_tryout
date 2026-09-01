import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRegionOverview,
  chooseDefaultTimepointId,
  formatHistoryDateTime,
  formatHistoryShortDate,
  historyFaceAccessibilityLabel,
  hasRegionHistory,
  productContextsForEvent,
  resolveRegionEntry,
  timepointCountForEvent,
  timepointSourceLabel,
} from '../src/lib/history-flow.ts';

const PHOTO = {
  photo_id: 71,
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  width: 1080,
  height: 1440,
  taken_at: '2026-08-20T08:00:00Z',
  quality_status: 'passed',
  quality_meta: null,
  url: 'http://localhost:8000/files/photos/7/example.jpg?exp=1&sig=x',
  url_expires_at: '2026-08-20T08:15:00Z',
};

const FACTS = {
  main_locations: ['左脸颊中部'],
  estimated_amount: '局部可见少量',
  distribution: '较集中',
  coverage: '局部范围',
  daily_appearance: ['轻微泛红'],
  unknowns: ['触感无法从照片判断'],
  summary: '左脸颊局部可见轻微泛红，分布较集中。',
};

function target(overrides = {}) {
  return {
    target_id: 61,
    scope_type: 'region',
    region_id: 'left_face',
    user_note: null,
    status: 'completed',
    result_source: 'photo_analysis',
    facts: FACTS,
    completed_at: '2026-08-20T08:01:00Z',
    ...overrides,
  };
}

function observation(overrides = {}) {
  return {
    observation_id: 51,
    client_request_id: '11111111-1111-4111-8111-111111111111',
    recorded_at: '2026-08-20T08:00:00Z',
    recorded_timezone_offset_minutes: 480,
    recorded_local_date: '2026-08-20',
    status: 'saved',
    created_at: '2026-08-20T08:00:01Z',
    life_context_ids: [],
    life_context_completed_at: null,
    photo: PHOTO,
    targets: [target()],
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    event_id: 41,
    region_id: 'left_face',
    status: 'current',
    started_local_date: '2026-08-02',
    last_valid_local_date: '2026-08-20',
    ended_local_date: null,
    ended_at: null,
    ...overrides,
  };
}

function eventTimeline(overrides = {}) {
  return {
    kind: 'region_event',
    timeline_id: 'region_event:41',
    occurred_at: '2026-08-20T08:00:00Z',
    event_id: 41,
    region_id: 'left_face',
    status: 'current',
    started_local_date: '2026-08-02',
    last_valid_local_date: '2026-08-20',
    timepoint_count: 5,
    sources: ['photo_analysis'],
    ...overrides,
  };
}

test('overview distinguishes current, historical, pending and untouched regions', () => {
  const result = buildRegionOverview({
    events: [
      event(),
      event({
        event_id: 42,
        region_id: 'forehead',
        status: 'ended',
        started_local_date: '2026-07-01',
        last_valid_local_date: '2026-07-18',
        ended_local_date: '2026-07-18',
        ended_at: '2026-07-18T10:00:00Z',
      }),
    ],
    observations: [
      observation({
        observation_id: 52,
        recorded_at: '2026-08-21T08:00:00Z',
        targets: [target({
          target_id: 62,
          region_id: 'chin',
          status: 'processing',
          result_source: null,
          facts: null,
          completed_at: null,
        })],
      }),
    ],
    timeline: [eventTimeline()],
  });

  assert.equal(result.byRegion.left_face.visualState, 'active');
  assert.equal(result.byRegion.left_face.timepointCount, 5);
  assert.equal(result.byRegion.forehead.visualState, 'historical');
  assert.equal(result.byRegion.chin.visualState, 'pending');
  assert.equal(result.byRegion.chin.pendingRecords[0].statusLabel, '正在整理');
  assert.equal(result.byRegion.nose_area.visualState, 'neutral');
});

test('multiple events require an explicit picker and stay current-first', () => {
  const overview = buildRegionOverview({
    events: [
      event({ event_id: 40, status: 'ended', ended_local_date: '2026-07-10' }),
      event(),
    ],
    observations: [],
    timeline: [eventTimeline()],
  });

  assert.deepEqual(
    overview.byRegion.left_face.events.map(({ event_id }) => event_id),
    [41, 40],
  );
  assert.deepEqual(resolveRegionEntry(overview.byRegion.left_face), {
    kind: 'event_picker',
    regionId: 'left_face',
  });
});

test('pending record without a visible event opens its observation instead of inventing an event', () => {
  const overview = buildRegionOverview({
    events: [],
    observations: [
      observation({
        observation_id: 77,
        targets: [target({
          target_id: 88,
          region_id: 'mouth_area',
          status: 'needs_input',
          result_source: null,
          facts: null,
          completed_at: null,
        })],
      }),
    ],
    timeline: [],
  });

  assert.deepEqual(resolveRegionEntry(overview.byRegion.mouth_area), {
    kind: 'observation',
    observationId: 77,
  });
  assert.equal(overview.byRegion.mouth_area.visualState, 'needs_input');
});

test('needs-input remains visible when a newer sibling target is still processing', () => {
  const overview = buildRegionOverview({
    events: [],
    observations: [
      observation({
        observation_id: 78,
        recorded_at: '2026-08-21T08:00:00Z',
        targets: [target({ target_id: 89, region_id: 'chin', status: 'processing', facts: null })],
      }),
      observation({
        observation_id: 77,
        recorded_at: '2026-08-20T08:00:00Z',
        targets: [target({ target_id: 88, region_id: 'chin', status: 'needs_input', facts: null })],
      }),
    ],
    timeline: [],
  });

  assert.equal(overview.byRegion.chin.visualState, 'needs_input');
  assert.match(
    historyFaceAccessibilityLabel(
      'chin',
      overview.byRegion.chin.visualState,
      overview.byRegion.chin.pendingRecords,
    ),
    /需要补充文字/,
  );
  assert.deepEqual(resolveRegionEntry(overview.byRegion.chin), {
    kind: 'observation',
    observationId: 77,
  });
});

test('default timepoint preserves a valid selection and otherwise chooses the latest', () => {
  const points = [
    { target: target({ target_id: 1 }) },
    { target: target({ target_id: 2 }) },
    { target: target({ target_id: 3 }) },
  ];
  assert.equal(chooseDefaultTimepointId(points, 2), 2);
  assert.equal(chooseDefaultTimepointId(points, 99), 3);
  assert.equal(chooseDefaultTimepointId([], 2), null);
});

test('timepoint source label reflects exactly the evidence that exists', () => {
  assert.equal(timepointSourceLabel(target({ user_note: '这几天有些不稳定' })), '照片与原文');
  assert.equal(timepointSourceLabel(target()), '照片');
  assert.equal(
    timepointSourceLabel(target({ result_source: 'user_record', facts: null, user_note: '有些泛红' })),
    '用户原文',
  );
  assert.equal(
    timepointSourceLabel(target({ result_source: null, facts: null, user_note: null })),
    '信息不足',
  );
});

test('product context includes only real uses inside the event timepoint interval', () => {
  const points = [
    { recorded_at: '2026-08-02T08:00:00Z' },
    { recorded_at: '2026-08-20T08:00:00Z' },
  ];
  const product = {
    product_id: 9,
    name: '阿达帕林凝胶',
    brand_name: null,
    formula_version: null,
    image_asset_id: null,
    document_id: null,
    document_version: null,
    image_url: null,
    image_expires_at: null,
  };
  const uses = [
    {
      product_use_id: 1,
      client_request_id: '21111111-1111-4111-8111-111111111111',
      used_at: '2026-08-01T08:00:00Z',
      used_timezone_offset_minutes: 480,
      note: null,
      created_at: '2026-08-01T08:00:01Z',
      products: [product],
    },
    {
      product_use_id: 2,
      client_request_id: '31111111-1111-4111-8111-111111111111',
      used_at: '2026-08-14T08:00:00Z',
      used_timezone_offset_minutes: 480,
      note: null,
      created_at: '2026-08-14T08:00:01Z',
      products: [product],
    },
    {
      product_use_id: 3,
      client_request_id: '41111111-1111-4111-8111-111111111111',
      used_at: '2026-08-21T08:00:00Z',
      used_timezone_offset_minutes: 480,
      note: null,
      created_at: '2026-08-21T08:00:01Z',
      products: [product],
    },
  ];

  assert.deepEqual(productContextsForEvent(points, uses).map(({ product_use_id }) => product_use_id), [2]);
});

test('face accessibility labels preserve the user true-left and true-right meaning', () => {
  assert.match(historyFaceAccessibilityLabel('left_face', 'active'), /本人真实左侧/);
  assert.match(historyFaceAccessibilityLabel('right_face', 'historical'), /本人真实右侧/);
  assert.match(historyFaceAccessibilityLabel('nose_area', 'neutral'), /从未形成区域时间点/);
});

test('history dates stay Chinese when Android Intl falls back to English', () => {
  assert.equal(formatHistoryShortDate('2026-08-30'), '8月30日');
  assert.equal(formatHistoryShortDate('2026-08-30T23:30:00Z', 480), '8月31日');
  assert.equal(formatHistoryShortDate('2026-08-30T01:30:00Z', -300), '8月29日');
  assert.equal(
    formatHistoryDateTime('2026-08-30T02:32:00'),
    '2026年8月30日 02:32',
  );
  assert.equal(
    formatHistoryDateTime('2026-08-30T02:32:00Z', -300),
    '2026年8月29日 21:32',
  );
});

test('every event keeps its own timeline count instead of borrowing the preferred event count', () => {
  const overview = buildRegionOverview({
    events: [
      event(),
      event({
        event_id: 40,
        status: 'ended',
        last_valid_local_date: '2026-07-10',
        ended_local_date: '2026-07-10',
      }),
    ],
    observations: [],
    timeline: [
      eventTimeline(),
      eventTimeline({ event_id: 40, timeline_id: 'region_event:40', status: 'ended', timepoint_count: 3 }),
    ],
  });

  assert.equal(timepointCountForEvent(overview.byRegion.left_face, 41), 5);
  assert.equal(timepointCountForEvent(overview.byRegion.left_face, 40), 3);
});

test('full-face or product history does not hide the region-history empty state', () => {
  const overview = buildRegionOverview({
    events: [],
    observations: [],
    timeline: [
      {
        kind: 'product_use',
        timeline_id: 'product_use:1',
        occurred_at: '2026-08-30T08:00:00Z',
        product_use_id: 1,
        used_at: '2026-08-30T08:00:00Z',
        products: [],
        note: null,
        source: 'user_record',
      },
    ],
  });

  assert.equal(overview.otherHistory.length, 1);
  assert.equal(hasRegionHistory(overview), false);
});
