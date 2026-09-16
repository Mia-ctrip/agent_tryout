import type {
  CreateObservationInput,
  NativePhotoFile,
  Observation,
  ObservationTargetStatus,
} from './observation-api.ts';
import { hasAllRegions, normalizeRegionIds, regionById } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';
import type { RegionEventDecision } from './region-event-api.ts';
import type { ObservationRegionGeometry } from './observation-quality-api.ts';

export type SavePhase = 'idle' | 'capturing' | 'saving' | 'save_failed';

export type ObservationDraft = {
  clientRequestId: string;
  recordedAt: string;
  timezoneOffsetMinutes: number;
  photoUri: string | null;
  takenAt: string | null;
  selectedRegions: RegionId[];
  confirmedRegions: RegionId[] | null;
  notes: Partial<Record<RegionId, string>>;
  eventDecisions: Partial<Record<RegionId, RegionEventDecision>>;
};

export type ObservationGenerationGuard = {
  begin(): number;
  isCurrent(generation: number): boolean;
  invalidate(): void;
};

export type ObservationPresentation =
  | { kind: 'queued' | 'processing'; title: string; body: string }
  | {
      kind: 'photo';
      title: string;
      sourceLabel: string;
      sections: { label: string; value: string }[];
    }
  | { kind: 'user'; title: string; sourceLabel: string; note: string }
  | { kind: 'needs_input'; title: string; body: string };

export type ObservationStatusCopy = {
  title: string;
  body: string;
};

export const OBSERVATION_STATUS_COPY: Readonly<
  Record<ObservationTargetStatus, ObservationStatusCopy>
> = {
  queued: {
    title: '照片已保存',
    body: '正在等待整理，你可以先离开这个页面。',
  },
  processing: {
    title: '正在整理照片',
    body: '原图和记录时间已经保存，稍后回来仍可查看结果。',
  },
  completed: {
    title: '这次记录已完成',
    body: '结果已保存，可以随时从历程中重新查看。',
  },
  needs_input: {
    title: '照片暂时无法整理',
    body: '原图已保存，但本次没有形成适合展示的照片描述。你可以补充自己的观察完成记录。',
  },
};

const OBSERVATION_POLL_DELAYS = [2000, 3000, 4500, 6750, 10000] as const;

export function createObservationDraft(
  clientRequestId: string,
  now: Date = new Date(),
): ObservationDraft {
  return {
    clientRequestId,
    recordedAt: now.toISOString(),
    timezoneOffsetMinutes: -now.getTimezoneOffset(),
    photoUri: null,
    takenAt: null,
    selectedRegions: [],
    confirmedRegions: null,
    notes: {},
    eventDecisions: {},
  };
}

export function selectRegions(
  draft: ObservationDraft,
  regionIds: readonly RegionId[],
): ObservationDraft {
  const selectedRegions =
    regionIds.length === 0 ? [] : normalizeRegionIds(regionIds);
  const unchanged =
    draft.confirmedRegions !== null &&
    draft.confirmedRegions.length === selectedRegions.length &&
    draft.confirmedRegions.every((regionId, index) => regionId === selectedRegions[index]);
  return {
    ...draft,
    selectedRegions,
    confirmedRegions: unchanged ? draft.confirmedRegions : null,
    eventDecisions: unchanged ? draft.eventDecisions : {},
  };
}

export function confirmRegionSelection(draft: ObservationDraft): ObservationDraft {
  return { ...draft, confirmedRegions: normalizeRegionIds(draft.selectedRegions) };
}

export function setRegionNote(
  draft: ObservationDraft,
  regionId: RegionId,
  note: string,
): ObservationDraft {
  return { ...draft, notes: { ...draft.notes, [regionId]: note } };
}

export function setRegionEventDecision(
  draft: ObservationDraft,
  regionId: RegionId,
  decision: RegionEventDecision,
): ObservationDraft {
  return {
    ...draft,
    eventDecisions: { ...draft.eventDecisions, [regionId]: decision },
  };
}

export function canSaveRegionalDraft(draft: ObservationDraft): boolean {
  return observationDraftError(draft) === null;
}

export function setObservationDraftPhoto(
  draft: ObservationDraft,
  photoUri: string,
  takenAt: string,
): ObservationDraft {
  return { ...draft, photoUri, takenAt };
}

export function clearObservationDraftPhoto(
  draft: ObservationDraft,
): ObservationDraft {
  return { ...draft, photoUri: null, takenAt: null };
}

export function observationDraftError(draft: ObservationDraft): string | null {
  if (draft.selectedRegions.length === 0) {
    return '请至少选择一个观察区域。';
  }
  if (
    draft.confirmedRegions === null ||
    draft.confirmedRegions.length !== draft.selectedRegions.length ||
    !draft.confirmedRegions.every(
      (regionId, index) => regionId === draft.selectedRegions[index],
    )
  ) {
    return '请确认本次观察区域后再保存。';
  }
  for (const regionId of draft.selectedRegions) {
    const note = (draft.notes[regionId] ?? '').trim();
    if (note.length > 500) {
      return `${regionById(regionId).label}的观察文字最多 500 个字。`;
    }
    if (!draft.photoUri && !note) {
      return `请补充${regionById(regionId).label}的观察。`;
    }
  }
  return null;
}

export function observationDraftToInput(
  draft: ObservationDraft,
  file?: NativePhotoFile,
): CreateObservationInput {
  const validationError = observationDraftError(draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const base = {
    clientRequestId: draft.clientRequestId,
    recordedAt: draft.recordedAt,
    timezoneOffsetMinutes: draft.timezoneOffsetMinutes,
    targets: draft.selectedRegions.map((regionId) => {
      const userNote = (draft.notes[regionId] ?? '').trim();
      const eventDecision = draft.eventDecisions[regionId];
      return {
        regionId,
        ...(userNote ? { userNote } : {}),
        ...(eventDecision ? { eventDecision } : {}),
      };
    }),
  };
  if (!draft.photoUri) {
    return base;
  }
  if (!draft.takenAt || !file) {
    throw new Error('照片文件尚未准备好，请重新拍摄。');
  }
  return { ...base, takenAt: draft.takenAt, file };
}

export function createObservationGenerationGuard(): ObservationGenerationGuard {
  let currentGeneration = 0;
  return {
    begin() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent(generation) {
      return generation === currentGeneration;
    },
    invalidate() {
      currentGeneration += 1;
    },
  };
}

function factValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join('、') : '无法判断';
  }
  return value || '无法判断';
}

export function presentObservation(
  observation: Observation,
  selectedTarget = observation.targets[0],
): ObservationPresentation {
  const target = selectedTarget;
  if (!target) {
    return { kind: 'needs_input', ...OBSERVATION_STATUS_COPY.needs_input };
  }
  if (target.status === 'queued' || target.status === 'processing') {
    return {
      kind: target.status,
      ...OBSERVATION_STATUS_COPY[target.status],
    };
  }
  if (
    target.status === 'completed' &&
    target.result_source === 'photo_analysis' &&
    target.facts
  ) {
    const facts = target.facts;
    return {
      kind: 'photo',
      title: '这次照片中可见的事实',
      sourceLabel:
        target.scope_type === 'region' && target.region_id
          ? `来源：${regionById(target.region_id).label}照片整理`
          : '来源：历史全脸照片整理',
      sections: [
        { label: '主要位置', value: factValue(facts.main_locations) },
        { label: '估计数量', value: factValue(facts.estimated_amount) },
        { label: '分布方式', value: factValue(facts.distribution) },
        { label: '覆盖范围', value: factValue(facts.coverage) },
        { label: '日常外观', value: factValue(facts.daily_appearance) },
        { label: '无法判断', value: factValue(facts.unknowns) },
        { label: '本次小结', value: factValue(facts.summary) },
      ],
    };
  }
  if (
    target.status === 'completed' &&
    target.result_source === 'user_record' &&
    target.user_note
  ) {
    return {
      kind: 'user',
      title: '你的观察',
      sourceLabel: '来源：用户原文',
      note: target.user_note,
    };
  }
  return {
    kind: 'needs_input',
    ...OBSERVATION_STATUS_COPY.needs_input,
  };
}

export function shouldPollObservation(
  status: ObservationTargetStatus,
): boolean {
  return status === 'queued' || status === 'processing';
}

export function shouldPollObservationTargets(
  targets: readonly Observation['targets'][number][],
): boolean {
  return targets.some((target) => shouldPollObservation(target.status));
}

export function presentObservationTargets(observation: Observation) {
  return observation.targets.map((target) => ({
    regionId: target.region_id,
    targetId: target.target_id,
    presentation: presentObservation(observation, target),
  }));
}

export type ObservationResultView = 'overview' | 'regions';

export type ObservationOverviewItem = {
  targetId: number;
  regionId: RegionId | null;
  regionLabel: string;
  status: ObservationTargetStatus;
  statusLabel: string;
  sourceLabel: '照片整理' | '你的记录' | null;
  summary: string | null;
  userNote: string | null;
  limitations: string[];
};

export type ObservationOverviewModel = {
  scopeLabel: string;
  isAllRegionsSelected: boolean;
  isLegacyFullFace: boolean;
  items: ObservationOverviewItem[];
};

const OVERVIEW_STATUS_LABELS: Readonly<Record<ObservationTargetStatus, string>> = {
  queued: '排队中',
  processing: '正在整理',
  completed: '已完成',
  needs_input: '需要补充',
};

export function buildObservationOverviewModel(
  observation: Observation,
): ObservationOverviewModel {
  const regionIds = observation.targets.flatMap((target) =>
    target.scope_type === 'region' && target.region_id ? [target.region_id] : [],
  );
  const isLegacyFullFace = observation.targets.some(
    (target) => target.scope_type === 'full_face',
  );
  const items = observation.targets.map((target): ObservationOverviewItem => {
    const photoResult =
      target.status === 'completed' &&
      target.result_source === 'photo_analysis' &&
      target.facts;
    const userResult =
      target.status === 'completed' &&
      target.result_source === 'user_record' &&
      target.user_note?.trim();
    return {
      targetId: target.target_id,
      regionId: target.region_id,
      regionLabel: target.region_id
        ? regionById(target.region_id).label
        : '历史全脸',
      status: target.status,
      statusLabel: userResult ? '已记录' : OVERVIEW_STATUS_LABELS[target.status],
      sourceLabel: photoResult ? '照片整理' : userResult ? '你的记录' : null,
      summary: photoResult
        ? photoResult.summary.trim() || '本次未形成简短小结。'
        : userResult || null,
      userNote:
        photoResult && target.user_note?.trim() ? target.user_note.trim() : null,
      limitations: photoResult ? photoResult.unknowns.filter(Boolean) : [],
    };
  });
  return {
    scopeLabel: isLegacyFullFace
      ? '历史全脸记录'
      : `本次观察：${regionIds.map((regionId) => regionById(regionId).label).join('、')}`,
    isAllRegionsSelected: hasAllRegions(regionIds),
    isLegacyFullFace,
    items,
  };
}

export function defaultObservationResultView(
  observation: Observation,
  requestedView?: string,
): ObservationResultView {
  if (requestedView === 'overview' || requestedView === 'regions') {
    return requestedView;
  }
  const overview = buildObservationOverviewModel(observation);
  return overview.isAllRegionsSelected || overview.isLegacyFullFace
    ? 'overview'
    : 'regions';
}

export type ObservationResultFinding = {
  label: string;
  value: string;
  tone: 'stable' | 'attention';
};

export type ObservationResultEvidence = {
  regionId: RegionId;
  label: string;
  geometry: ObservationRegionGeometry;
};

export type ObservationResultModel = {
  regionCards: {
    targetId: number;
    regionId: RegionId | null;
    regionLabel: string;
    summary: string;
    highlights: { label: string; value: string }[];
    limitations: string[];
    sections: { label: string; value: string }[];
  }[];
  regionLabel: string;
  summary: string;
  findings: ObservationResultFinding[];
  evidence: ObservationResultEvidence[];
  details: { regionLabel: string; sections: { label: string; value: string }[] }[];
  userNotes: { regionLabel: string; note: string }[];
  nextStep: { title: string; body: string };
  completedTargetIds: number[];
  needsInputTargetIds: number[];
  autoSaved: true;
};

export function buildObservationResultModel(
  observation: Observation,
): ObservationResultModel {
  const completed = observation.targets.filter(
    (target) =>
      target.status === 'completed' &&
      target.result_source === 'photo_analysis' &&
      target.facts !== null,
  );
  const needsInput = observation.targets.filter(
    (target) => target.status === 'needs_input',
  );
  const regionLabels = completed.map((target) =>
    target.region_id ? regionById(target.region_id).label : '全脸',
  );
  const summaries = completed
    .map((target) => target.facts?.summary.trim() ?? '')
    .filter(Boolean);
  const firstFacts = completed[0]?.facts;
  const findingCandidates: ObservationResultFinding[] = firstFacts
    ? [
        ...(firstFacts.daily_appearance[0]
          ? [
              {
                label: '整体表现',
                value: firstFacts.daily_appearance[0],
                tone: 'stable' as const,
              },
            ]
          : []),
        ...((firstFacts.coverage || firstFacts.distribution)
          ? [
              {
                label: '局部分布',
                value: [firstFacts.coverage, firstFacts.distribution]
                  .filter(Boolean)
                  .join('，'),
                tone: 'attention' as const,
              },
            ]
          : []),
      ]
    : [];
  const geometryByRegion = new Map(
    (observation.photo?.quality_meta?.regions ?? []).map((geometry) => [
      geometry.region_id,
      geometry,
    ]),
  );
  const evidence = completed
    .flatMap((target) => {
      if (!target.region_id) return [];
      const geometry = geometryByRegion.get(target.region_id);
      return geometry
        ? [
            {
              regionId: target.region_id,
              label: `${regionById(target.region_id).label}检测区域`,
              geometry,
            },
          ]
        : [];
    })
    .slice(0, 2);
  const details = completed.map((target) => {
    const presentation = presentObservation(observation, target);
    return {
      regionLabel: target.region_id ? regionById(target.region_id).label : '全脸',
      sections:
        presentation.kind === 'photo'
          ? presentation.sections.filter((section) => section.label !== '本次小结')
          : [],
    };
  });
  const userNotes = observation.targets.flatMap((target) => {
    if (!target.user_note?.trim()) return [];
    return [
      {
        regionLabel: target.region_id ? regionById(target.region_id).label : '全脸',
        note: target.user_note,
      },
    ];
  });
  const useful = (value: string) => Boolean(value.trim()) && !/^(无法判断|不明确|未知|少量|散在|局部可见)[。\s]*$/.test(value.trim());
  const regionCards = completed.map((target, index) => {
    const facts = target.facts!;
    return {
      targetId: target.target_id,
      regionId: target.region_id,
      regionLabel: regionLabels[index],
      summary: facts.summary.trim() || '本次未形成区域小结，可查看下方事实。',
      highlights: [
        { label: '可见外观', value: facts.daily_appearance.filter(useful).join('；') },
        { label: '主要位置', value: facts.main_locations.filter(useful).join('、') },
      ].filter(item => item.value),
      limitations: facts.unknowns.filter(useful),
      sections: details[index].sections,
    };
  });
  return {
    regionCards,
    regionLabel: regionLabels.join('、') || '本次检测区域',
    summary:
      summaries.length > 0
        ? summaries.join(' ')
        : '本次暂未形成可展示的照片分析结论。',
    findings: findingCandidates.slice(0, 2),
    evidence,
    details,
    userNotes,
    nextStep: {
      title: '在相近条件下继续观察',
      body: '之后再次拍摄时，尽量使用相近光线、角度和距离，方便回看真实变化。',
    },
    completedTargetIds: completed.map((target) => target.target_id),
    needsInputTargetIds: needsInput.map((target) => target.target_id),
    autoSaved: true,
  };
}

export function nextObservationPollDelay(attempt: number): number {
  const index = Math.min(
    Math.max(Math.floor(attempt), 0),
    OBSERVATION_POLL_DELAYS.length - 1,
  );
  return OBSERVATION_POLL_DELAYS[index];
}
