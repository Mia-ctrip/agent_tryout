import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canSaveRegionalDraft,
  confirmRegionSelection,
  createObservationDraft,
  createObservationGenerationGuard,
  nextObservationPollDelay,
  observationDraftError,
  observationDraftToInput,
  OBSERVATION_STATUS_COPY,
  presentObservation,
  presentObservationTargets,
  selectRegions,
  setObservationDraftPhoto,
  setRegionNote,
  shouldPollObservation,
  shouldPollObservationTargets,
} from '../src/lib/observation-flow.ts';

test('changing regions invalidates explicit save confirmation', () => {
  const initial = createObservationDraft(
    '11111111-1111-4111-8111-111111111111',
    new Date('2026-08-21T12:00:00.000Z'),
  );
  const selected = selectRegions(
    setObservationDraftPhoto(initial, 'file:///photo.jpg', '2026-08-21T12:00:01.000Z'),
    ['left_face', 'chin'],
  );
  assert.equal(canSaveRegionalDraft(selected), false);
  const confirmed = confirmRegionSelection(selected);
  assert.equal(canSaveRegionalDraft(confirmed), true);
  assert.equal(canSaveRegionalDraft(selectRegions(confirmed, ['chin'])), false);
});

test('text-only regional draft requires a note for every confirmed region', () => {
  const draft = confirmRegionSelection(
    selectRegions(
      createObservationDraft(
        '11111111-1111-4111-8111-111111111111',
        new Date('2026-08-21T12:00:00.000Z'),
      ),
      ['forehead', 'chin'],
    ),
  );
  assert.match(
    observationDraftError(setRegionNote(draft, 'forehead', '额头粗糙')),
    /下巴/,
  );
});

test('only queued and processing observations are polled', () => {
  assert.equal(shouldPollObservation('queued'), true);
  assert.equal(shouldPollObservation('processing'), true);
  assert.equal(shouldPollObservation('completed'), false);
  assert.equal(shouldPollObservation('needs_input'), false);
});

test('observation polling uses the capped Slice 1 backoff', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, attempt) =>
      nextObservationPollDelay(attempt),
    ),
    [2000, 3000, 4500, 6750, 10000, 10000, 10000, 10000],
  );
});

test('status copy is fixed and does not expose technical failure details', () => {
  assert.deepEqual(Object.keys(OBSERVATION_STATUS_COPY), [
    'queued',
    'processing',
    'completed',
    'needs_input',
  ]);
  assert.equal(
    OBSERVATION_STATUS_COPY.needs_input.title,
    '照片暂时无法整理',
  );
  assert.equal(
    OBSERVATION_STATUS_COPY.needs_input.body,
    '原图已保存，但本次没有形成适合展示的照片描述。你可以补充自己的观察完成记录。',
  );
  assert.doesNotMatch(
    Object.values(OBSERVATION_STATUS_COPY)
      .flatMap(({ title, body }) => [title, body])
      .join(' '),
    /trace|provider|模型|错误码|failure/i,
  );
});

test('a new observation draft fixes its UUID and recorded time once', () => {
  const draft = createObservationDraft(
    '11111111-1111-4111-8111-111111111111',
    new Date('2026-08-21T12:00:00.000Z'),
  );

  assert.deepEqual(draft, {
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    recordedAt: '2026-08-21T12:00:00.000Z',
    timezoneOffsetMinutes: 480,
    photoUri: null,
    takenAt: null,
    selectedRegions: [],
    confirmedRegions: null,
    notes: {},
    eventDecisions: {},
  });
});

test('photo observation may save confirmed regions with blank notes', () => {
  const draft = confirmRegionSelection(
    selectRegions(
      setObservationDraftPhoto(
        createObservationDraft(
          '11111111-1111-4111-8111-111111111111',
          new Date('2026-08-21T12:00:00.000Z'),
        ),
        'file:///capture.jpg',
        '2026-08-21T12:00:05.000Z',
      ),
      ['left_face'],
    ),
  );

  assert.equal(observationDraftError(draft), null);
  assert.deepEqual(
    observationDraftToInput(draft, {
      uri: draft.photoUri,
      name: 'observation.jpg',
      type: 'image/jpeg',
    }),
    {
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      recordedAt: '2026-08-21T12:00:00.000Z',
      timezoneOffsetMinutes: 480,
      targets: [{ regionId: 'left_face' }],
      takenAt: '2026-08-21T12:00:05.000Z',
      file: {
        uri: 'file:///capture.jpg',
        name: 'observation.jpg',
        type: 'image/jpeg',
      },
    },
  );
});

test('text-only observation requires and trims every regional note', () => {
  const empty = createObservationDraft(
    '22222222-2222-4222-8222-222222222222',
    new Date('2026-08-21T13:00:00.000Z'),
  );
  assert.equal(observationDraftError(empty), '请至少选择一个观察区域。');
  assert.throws(() => observationDraftToInput(empty), /至少选择/);

  const withText = confirmRegionSelection(
    setRegionNote(
      selectRegions(empty, ['left_face']),
      'left_face',
      '  今天左侧脸看起来有些泛红。  ',
    ),
  );
  assert.equal(observationDraftError(withText), null);
  assert.deepEqual(observationDraftToInput(withText), {
    clientRequestId: '22222222-2222-4222-8222-222222222222',
    recordedAt: '2026-08-21T13:00:00.000Z',
    timezoneOffsetMinutes: 480,
    targets: [{ regionId: 'left_face', userNote: '今天左侧脸看起来有些泛红。' }],
  });
});

test('retake and retry preserve the original observation identity', () => {
  const original = createObservationDraft(
    '33333333-3333-4333-8333-333333333333',
    new Date('2026-08-21T14:00:00.000Z'),
  );
  const first = setObservationDraftPhoto(
    original,
    'file:///first.jpg',
    '2026-08-21T14:00:03.000Z',
  );
  const retaken = confirmRegionSelection(
    selectRegions(
      setObservationDraftPhoto(
        first,
        'file:///second.jpg',
        '2026-08-21T14:00:09.000Z',
      ),
      ['chin'],
    ),
  );
  const file = {
    uri: retaken.photoUri,
    name: 'observation.jpg',
    type: 'image/jpeg',
  };

  assert.equal(retaken.clientRequestId, original.clientRequestId);
  assert.equal(retaken.recordedAt, original.recordedAt);
  assert.deepEqual(
    observationDraftToInput(retaken, file),
    observationDraftToInput(retaken, file),
  );
});

function observationWith(target, overrides = {}) {
  return {
    observation_id: 41,
    client_request_id: '44444444-4444-4444-8444-444444444444',
    recorded_at: '2026-08-21T15:00:00.000Z',
    recorded_timezone_offset_minutes: 0,
    recorded_local_date: '2026-08-21',
    status: 'saved',
    created_at: '2026-08-21T15:00:01.000Z',
    photo: null,
    targets: [
      {
        target_id: 71,
        scope_type: 'full_face',
        region_id: null,
        user_note: null,
        result_source: null,
        facts: null,
        completed_at: null,
        ...target,
      },
    ],
    ...overrides,
  };
}

test('photo presenter exposes exactly seven neutral fact sections and source', () => {
  const presentation = presentObservation(
    observationWith({
      status: 'completed',
      result_source: 'photo_analysis',
      completed_at: '2026-08-21T15:00:05.000Z',
      facts: {
        main_locations: ['两颊'],
        estimated_amount: '少量',
        distribution: '分散',
        coverage: '局部',
        daily_appearance: ['可见轻微泛红'],
        unknowns: ['触感无法由照片判断'],
        summary: '照片中可见两颊局部变化。',
      },
    }),
  );

  assert.equal(presentation.kind, 'photo');
  assert.equal(presentation.sourceLabel, '来源：历史全脸照片整理');
  assert.deepEqual(
    presentation.sections.map(({ label }) => label),
    ['主要位置', '估计数量', '分布方式', '覆盖范围', '日常外观', '无法判断', '本次小结'],
  );
  assert.equal(presentation.sections.length, 7);
  assert.doesNotMatch(
    JSON.stringify(presentation),
    /score|severity|advice|评分|严重|建议/i,
  );
});

test('manual presenter preserves the exact saved user text', () => {
  const presentation = presentObservation(
    observationWith(
      {
        status: 'completed',
        result_source: 'user_record',
        user_note: '今天两颊看起来有些泛红。',
        completed_at: '2026-08-21T15:00:05.000Z',
      },
      {},
    ),
  );

  assert.deepEqual(presentation, {
    kind: 'user',
    title: '你的观察',
    sourceLabel: '来源：用户原文',
    note: '今天两颊看起来有些泛红。',
  });
});

test('needs-input presenter uses the fixed degradation title', () => {
  assert.deepEqual(
    presentObservation(observationWith({ status: 'needs_input' })),
    {
      kind: 'needs_input',
      title: '照片暂时无法整理',
      body: '原图已保存，但本次没有形成适合展示的照片描述。你可以补充自己的观察完成记录。',
    },
  );
});

test('observation generation guard rejects responses after blur or a newer load', () => {
  const guard = createObservationGenerationGuard();
  const first = guard.begin();
  assert.equal(guard.isCurrent(first), true);
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  guard.invalidate();
  assert.equal(guard.isCurrent(second), false);
});

test('multi-target polling and presentation keep sibling states independent', () => {
  const observation = observationWith({
    scope_type: 'region',
    region_id: 'left_face',
    status: 'completed',
    result_source: 'photo_analysis',
    facts: {
      main_locations: ['你的左侧脸'],
      estimated_amount: '少量',
      distribution: '散在',
      coverage: '局部',
      daily_appearance: ['偏红'],
      unknowns: ['触感无法判断'],
      summary: '左侧脸可见少量变化。',
    },
  });
  observation.targets.push({
    ...observation.targets[0],
    target_id: 72,
    region_id: 'chin',
    status: 'needs_input',
    result_source: null,
    facts: null,
  });
  assert.equal(shouldPollObservationTargets(observation.targets), false);
  observation.targets[1].status = 'processing';
  assert.equal(shouldPollObservationTargets(observation.targets), true);
  observation.targets[1].status = 'needs_input';
  assert.deepEqual(
    presentObservationTargets(observation).map(({ regionId, presentation }) => [
      regionId,
      presentation.kind,
    ]),
    [
      ['left_face', 'photo'],
      ['chin', 'needs_input'],
    ],
  );
});
