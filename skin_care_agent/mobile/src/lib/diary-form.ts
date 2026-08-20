import type {
  CheckIn,
  CheckInDiary,
  CheckInRating,
} from './check-in-api.ts';

export type DiaryRating = CheckInRating;
export type DiaryMenstrualPhase = NonNullable<
  CheckInDiary['menstrual_phase']
>;
export type DiaryDietTag = NonNullable<CheckInDiary['diet_tags']>[number];

export type DiaryFormValues = {
  sleepHours: string;
  sleepQuality: DiaryRating | null;
  stressLevel: DiaryRating | null;
  menstrualPhase: DiaryMenstrualPhase | null;
  dietTags: DiaryDietTag[];
  skincareChanged: boolean | null;
  newSkincareProducts: string;
  topicalProducts: string;
  notes: string;
};

export type DiaryFormErrors = Partial<
  Record<keyof DiaryFormValues, string>
>;

export type DiaryFormResult =
  | { ok: true; diary: CheckInDiary }
  | { ok: false; errors: DiaryFormErrors };

export type DiarySaveGuard = {
  tryBegin(): boolean;
  finish(): void;
};

export type DiaryResponseGuard = {
  snapshot(): number;
  markChanged(): void;
  invalidate(): void;
  isActive(): boolean;
  canApply(revision: number, checkInId: number): boolean;
};

export function parseDiaryCheckInId(
  value: string | string[] | undefined,
): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createDiarySaveGuard(): DiarySaveGuard {
  let saving = false;
  return {
    tryBegin() {
      if (saving) {
        return false;
      }
      saving = true;
      return true;
    },
    finish() {
      saving = false;
    },
  };
}

export function createDiaryResponseGuard(
  scopedCheckInId: number | null,
): DiaryResponseGuard {
  let active = true;
  let revision = 0;
  return {
    snapshot() {
      return revision;
    },
    markChanged() {
      revision += 1;
    },
    invalidate() {
      active = false;
    },
    isActive() {
      return active;
    },
    canApply(submittedRevision, responseCheckInId) {
      return (
        active &&
        responseCheckInId === scopedCheckInId &&
        submittedRevision === revision
      );
    },
  };
}

export function diaryExitRoute(
  checkInId: number,
  status: CheckIn['status'],
): `/analysis/${number}` | '/home' {
  return status === 'complete' ? `/analysis/${checkInId}` : '/home';
}

export function diaryExitAction(
  checkInId: number,
  status: CheckIn['status'],
): {
  label: '返回分析结果' | '返回首页';
  route: `/analysis/${number}` | '/home';
} {
  return {
    label: status === 'complete' ? '返回分析结果' : '返回首页',
    route: diaryExitRoute(checkInId, status),
  };
}

export function diaryNavigationProtection(saving: boolean): {
  preventRemove: boolean;
  gestureEnabled: boolean;
} {
  return {
    preventRemove: saving,
    gestureEnabled: !saving,
  };
}

export function createEmptyDiaryFormValues(): DiaryFormValues {
  return {
    sleepHours: '',
    sleepQuality: null,
    stressLevel: null,
    menstrualPhase: null,
    dietTags: [],
    skincareChanged: null,
    newSkincareProducts: '',
    topicalProducts: '',
    notes: '',
  };
}

export function diaryToFormValues(
  diary: CheckInDiary | null | undefined,
): DiaryFormValues {
  return {
    sleepHours:
      diary?.sleep_hours === null || diary?.sleep_hours === undefined
        ? ''
        : String(diary.sleep_hours),
    sleepQuality: (diary?.sleep_quality as DiaryRating | null | undefined) ?? null,
    stressLevel: (diary?.stress_level as DiaryRating | null | undefined) ?? null,
    menstrualPhase: diary?.menstrual_phase ?? null,
    dietTags: [...(diary?.diet_tags ?? [])],
    skincareChanged: diary?.skincare_changed ?? null,
    newSkincareProducts: (diary?.new_skincare_products ?? []).join('，'),
    topicalProducts: (diary?.topical_products ?? []).join('，'),
    notes: diary?.notes ?? '',
  };
}

function isValidRating(value: number | null): boolean {
  return (
    value === null ||
    (Number.isInteger(value) && value >= 1 && value <= 5)
  );
}

function parseProductNames(value: string): string[] {
  const names = value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function validateDiaryForm(
  values: DiaryFormValues,
): DiaryFormResult {
  const errors: DiaryFormErrors = {};
  const diary: CheckInDiary = {};
  const sleepHours = values.sleepHours.trim();

  if (sleepHours) {
    const parsed = Number(sleepHours);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
      errors.sleepHours = '睡眠时长需在 0 到 24 小时之间。';
    } else {
      diary.sleep_hours = parsed;
    }
  }

  if (!isValidRating(values.sleepQuality)) {
    errors.sleepQuality = '睡眠质量需选择 1 到 5。';
  } else if (values.sleepQuality !== null) {
    diary.sleep_quality = values.sleepQuality;
  }

  if (!isValidRating(values.stressLevel)) {
    errors.stressLevel = '压力程度需选择 1 到 5。';
  } else if (values.stressLevel !== null) {
    diary.stress_level = values.stressLevel;
  }

  if (values.menstrualPhase !== null) {
    diary.menstrual_phase = values.menstrualPhase;
  }
  if (values.dietTags.length > 0) {
    diary.diet_tags = [...values.dietTags];
  }
  if (values.skincareChanged !== null) {
    diary.skincare_changed = values.skincareChanged;
  }

  const newProducts = parseProductNames(values.newSkincareProducts);
  if (newProducts.length > 10 || newProducts.some((name) => name.length > 80)) {
    errors.newSkincareProducts =
      '新产品最多记录 10 个，每个名称不超过 80 个字符。';
  } else if (newProducts.length > 0) {
    diary.new_skincare_products = newProducts;
  }

  const topicalProducts = parseProductNames(values.topicalProducts);
  if (
    topicalProducts.length > 10 ||
    topicalProducts.some((name) => name.length > 80)
  ) {
    errors.topicalProducts =
      '外用产品最多记录 10 个，每个名称不超过 80 个字符。';
  } else if (topicalProducts.length > 0) {
    diary.topical_products = topicalProducts;
  }

  const notes = values.notes.trim();
  if (notes.length > 500) {
    errors.notes = '备注不能超过 500 个字符。';
  } else if (notes) {
    diary.notes = notes;
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, diary };
}
