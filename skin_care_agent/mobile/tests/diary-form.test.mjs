import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDiaryResponseGuard,
  createDiarySaveGuard,
  createEmptyDiaryFormValues,
  diaryExitAction,
  diaryExitRoute,
  diaryNavigationProtection,
  diaryToFormValues,
  parseDiaryCheckInId,
  validateDiaryForm,
} from '../src/lib/diary-form.ts';

test('diaryToFormValues restores an existing diary for editing', () => {
  const values = diaryToFormValues({
    sleep_hours: 7.5,
    sleep_quality: 4,
    stress_level: 3,
    menstrual_phase: 'pre_period',
    diet_tags: ['spicy', 'dairy'],
    skincare_changed: false,
    new_skincare_products: ['温和面霜', '修护精华'],
    topical_products: ['BPO'],
    notes: '今天有点泛红',
  });

  assert.deepEqual(values, {
    sleepHours: '7.5',
    sleepQuality: 4,
    stressLevel: 3,
    menstrualPhase: 'pre_period',
    dietTags: ['spicy', 'dairy'],
    skincareChanged: false,
    newSkincareProducts: '温和面霜，修护精华',
    topicalProducts: 'BPO',
    notes: '今天有点泛红',
  });
});

test('validateDiaryForm trims, splits and deduplicates valid input', () => {
  const values = {
    ...createEmptyDiaryFormValues(),
    sleepHours: ' 7.5 ',
    sleepQuality: 4,
    stressLevel: 3,
    menstrualPhase: 'pre_period',
    dietTags: ['spicy', 'dairy'],
    skincareChanged: false,
    newSkincareProducts: '温和面霜， 温和面霜\n修护精华',
    topicalProducts: 'BPO, bpo',
    notes: '  今天有点泛红  ',
  };

  assert.deepEqual(validateDiaryForm(values), {
    ok: true,
    diary: {
      sleep_hours: 7.5,
      sleep_quality: 4,
      stress_level: 3,
      menstrual_phase: 'pre_period',
      diet_tags: ['spicy', 'dairy'],
      skincare_changed: false,
      new_skincare_products: ['温和面霜', '修护精华'],
      topical_products: ['BPO'],
      notes: '今天有点泛红',
    },
  });
});

test('validateDiaryForm converts a blank form into an empty replacement', () => {
  assert.deepEqual(validateDiaryForm(createEmptyDiaryFormValues()), {
    ok: true,
    diary: {},
  });
});

test('validateDiaryForm rejects invalid sleep and rating ranges', () => {
  const result = validateDiaryForm({
    ...createEmptyDiaryFormValues(),
    sleepHours: '24.5',
    sleepQuality: 0,
    stressLevel: 6,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'sleepHours',
    'sleepQuality',
    'stressLevel',
  ]);
});

test('validateDiaryForm rejects product and note limits', () => {
  const result = validateDiaryForm({
    ...createEmptyDiaryFormValues(),
    newSkincareProducts: Array.from(
      { length: 11 },
      (_, index) => `产品${index + 1}`,
    ).join('，'),
    topicalProducts: 'x'.repeat(81),
    notes: 'n'.repeat(501),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'newSkincareProducts',
    'notes',
    'topicalProducts',
  ]);
});

test('validateDiaryForm accepts every exact upper and lower boundary', () => {
  const products = Array.from(
    { length: 10 },
    (_, index) => `${index}`.padEnd(80, 'x'),
  );
  const result = validateDiaryForm({
    ...createEmptyDiaryFormValues(),
    sleepHours: '24',
    sleepQuality: 1,
    stressLevel: 5,
    newSkincareProducts: products.join('，'),
    topicalProducts: products.join('，'),
    notes: 'n'.repeat(500),
  });

  assert.equal(result.ok, true);
  assert.equal(result.diary.sleep_hours, 24);
  assert.equal(result.diary.sleep_quality, 1);
  assert.equal(result.diary.stress_level, 5);
  assert.equal(result.diary.new_skincare_products.length, 10);
  assert.equal(result.diary.new_skincare_products[0].length, 80);
  assert.equal(result.diary.topical_products.length, 10);
  assert.equal(result.diary.notes.length, 500);

  const zeroSleep = validateDiaryForm({
    ...createEmptyDiaryFormValues(),
    sleepHours: '0',
  });
  assert.equal(zeroSleep.ok, true);
  assert.equal(zeroSleep.diary.sleep_hours, 0);
});

test('parseDiaryCheckInId accepts one positive safe integer', () => {
  assert.equal(parseDiaryCheckInId('17'), 17);
  assert.equal(parseDiaryCheckInId(['17']), null);
  assert.equal(parseDiaryCheckInId('0'), null);
  assert.equal(parseDiaryCheckInId('1.5'), null);
  assert.equal(parseDiaryCheckInId('not-a-number'), null);
});

test('diary save guard blocks duplicate submissions until release', () => {
  const guard = createDiarySaveGuard();

  assert.equal(guard.tryBegin(), true);
  assert.equal(guard.tryBegin(), false);
  guard.finish();
  assert.equal(guard.tryBegin(), true);
});

test('diary response guard preserves edits made after a save starts', () => {
  const guard = createDiaryResponseGuard(17);
  const submittedRevision = guard.snapshot();

  assert.equal(guard.canApply(submittedRevision, 17), true);
  guard.markChanged();
  assert.equal(guard.canApply(submittedRevision, 17), false);
  assert.equal(guard.canApply(guard.snapshot(), 17), true);
});

test('diary response guard rejects responses after screen cleanup', () => {
  const guard = createDiaryResponseGuard(17);
  const submittedRevision = guard.snapshot();

  guard.invalidate();

  assert.equal(guard.isActive(), false);
  assert.equal(guard.canApply(submittedRevision, 17), false);
});

test('diary response guard rejects a response for another check-in', () => {
  const guard = createDiaryResponseGuard(17);
  const submittedRevision = guard.snapshot();

  assert.equal(guard.canApply(submittedRevision, 18), false);
});

test('diaryExitRoute returns completed check-ins to analysis only', () => {
  assert.equal(diaryExitRoute(17, 'complete'), '/analysis/17');
  assert.equal(diaryExitRoute(17, 'draft'), '/home');
});

test('diaryExitAction keeps the visible label aligned with its route', () => {
  assert.deepEqual(diaryExitAction(17, 'complete'), {
    label: '返回分析结果',
    route: '/analysis/17',
  });
  assert.deepEqual(diaryExitAction(17, 'draft'), {
    label: '返回首页',
    route: '/home',
  });
});

test('diary navigation blocks native exit only while saving', () => {
  assert.deepEqual(diaryNavigationProtection(false), {
    preventRemove: false,
    gestureEnabled: true,
  });
  assert.deepEqual(diaryNavigationProtection(true), {
    preventRemove: true,
    gestureEnabled: false,
  });
});
