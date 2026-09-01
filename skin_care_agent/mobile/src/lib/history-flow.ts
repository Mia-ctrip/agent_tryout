import type { Observation, ObservationTarget } from './observation-api.ts';
import type {
  RegionEvent,
  RegionEventTimepoint,
} from './region-event-api.ts';
import { REGIONS, REGION_IDS, regionById } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';
import type { ProductUse } from './product-api.ts';
import type { TimelineItem } from './timeline-api.ts';

export type HistoryRegionVisualState =
  | 'active'
  | 'historical'
  | 'pending'
  | 'needs_input'
  | 'neutral';

export type PendingRegionRecord = {
  observationId: number;
  targetId: number;
  regionId: RegionId;
  recordedAt: string;
  recordedLocalDate: string | null;
  recordedTimezoneOffsetMinutes: number | null;
  status: 'queued' | 'processing' | 'needs_input';
  statusLabel: string;
};

export type RegionOverviewItem = {
  regionId: RegionId;
  label: string;
  visualState: HistoryRegionVisualState;
  events: RegionEvent[];
  currentEvent: RegionEvent | null;
  historicalEvents: RegionEvent[];
  pendingRecords: PendingRegionRecord[];
  timepointCount: number | null;
  timepointCountsByEventId: Readonly<Record<number, number>>;
  lastRecordDate: string | null;
};

export type RegionOverview = {
  regions: RegionOverviewItem[];
  byRegion: Record<RegionId, RegionOverviewItem>;
  currentEvents: RegionEvent[];
  historicalEvents: RegionEvent[];
  pendingRecords: PendingRegionRecord[];
  otherHistory: Exclude<TimelineItem, { kind: 'region_event' }>[];
};

export type RegionEntry =
  | { kind: 'event'; eventId: number }
  | { kind: 'event_picker'; regionId: RegionId }
  | { kind: 'observation'; observationId: number };

const PENDING_STATUS_LABELS = {
  queued: '排队中',
  processing: '正在整理',
  needs_input: '需要补充文字',
} as const;

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatHistoryShortDate(
  value: string,
  timezoneOffsetMinutes?: number | null,
): string {
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (calendarDate) {
    return `${Number(calendarDate[2])}月${Number(calendarDate[3])}日`;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (typeof timezoneOffsetMinutes === 'number') {
    const recordedLocal = new Date(date.getTime() + timezoneOffsetMinutes * 60_000);
    return `${recordedLocal.getUTCMonth() + 1}月${recordedLocal.getUTCDate()}日`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatHistoryDateTime(
  value: string,
  timezoneOffsetMinutes?: number | null,
): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  if (typeof timezoneOffsetMinutes === 'number') {
    const recordedLocal = new Date(date.getTime() + timezoneOffsetMinutes * 60_000);
    return `${recordedLocal.getUTCFullYear()}年${
      recordedLocal.getUTCMonth() + 1
    }月${recordedLocal.getUTCDate()}日 ${twoDigits(
      recordedLocal.getUTCHours(),
    )}:${twoDigits(recordedLocal.getUTCMinutes())}`;
  }
  return `${date.getFullYear()}年${
    date.getMonth() + 1
  }月${date.getDate()}日 ${twoDigits(date.getHours())}:${twoDigits(
    date.getMinutes(),
  )}`;
}

function eventSort(left: RegionEvent, right: RegionEvent): number {
  if (left.status !== right.status) return left.status === 'current' ? -1 : 1;
  return (
    right.last_valid_local_date.localeCompare(left.last_valid_local_date) ||
    right.event_id - left.event_id
  );
}

function pendingRecordsFromObservations(
  observations: readonly Observation[],
): PendingRegionRecord[] {
  return observations
    .flatMap((observation) =>
      observation.targets.flatMap((target) => {
        if (
          !target.region_id ||
          (target.status !== 'queued' &&
            target.status !== 'processing' &&
            target.status !== 'needs_input')
        ) {
          return [];
        }
        return [
          {
            observationId: observation.observation_id,
            targetId: target.target_id,
            regionId: target.region_id,
            recordedAt: observation.recorded_at,
            recordedLocalDate: observation.recorded_local_date,
            recordedTimezoneOffsetMinutes:
              observation.recorded_timezone_offset_minutes,
            status: target.status,
            statusLabel: PENDING_STATUS_LABELS[target.status],
          } satisfies PendingRegionRecord,
        ];
      }),
    )
    .sort(
      (left, right) =>
        right.recordedAt.localeCompare(left.recordedAt) ||
        right.targetId - left.targetId,
    );
}

function visualStateFor(
  currentEvent: RegionEvent | null,
  historicalEvents: readonly RegionEvent[],
  pendingRecords: readonly PendingRegionRecord[],
): HistoryRegionVisualState {
  if (currentEvent) return 'active';
  if (historicalEvents.length) return 'historical';
  if (pendingRecords.some(({ status }) => status === 'needs_input')) {
    return 'needs_input';
  }
  if (pendingRecords.length) return 'pending';
  return 'neutral';
}

export function buildRegionOverview({
  events,
  observations,
  timeline,
}: {
  events: readonly RegionEvent[];
  observations: readonly Observation[];
  timeline: readonly TimelineItem[];
}): RegionOverview {
  const pendingRecords = pendingRecordsFromObservations(observations);
  const eventCountById = new Map(
    timeline
      .filter((item): item is Extract<TimelineItem, { kind: 'region_event' }> =>
        item.kind === 'region_event',
      )
      .map((item) => [item.event_id, item.timepoint_count] as const),
  );

  const regions = REGION_IDS.map((regionId): RegionOverviewItem => {
    const regionEvents = events
      .filter((event) => event.region_id === regionId)
      .slice()
      .sort(eventSort);
    const currentEvent = regionEvents.find(({ status }) => status === 'current') ?? null;
    const historicalEvents = regionEvents.filter(({ status }) => status === 'ended');
    const regionPendingRecords = pendingRecords.filter(
      (record) => record.regionId === regionId,
    );
    const preferredEvent = currentEvent ?? historicalEvents[0] ?? null;
    const timepointCountsByEventId = Object.fromEntries(
      regionEvents.flatMap((event) => {
        const count = eventCountById.get(event.event_id);
        return count === undefined ? [] : [[event.event_id, count]];
      }),
    ) as Record<number, number>;
    return {
      regionId,
      label: regionById(regionId).label,
      visualState: visualStateFor(
        currentEvent,
        historicalEvents,
        regionPendingRecords,
      ),
      events: regionEvents,
      currentEvent,
      historicalEvents,
      pendingRecords: regionPendingRecords,
      timepointCountsByEventId,
      timepointCount: preferredEvent
        ? (eventCountById.get(preferredEvent.event_id) ?? null)
        : null,
      lastRecordDate:
        preferredEvent?.last_valid_local_date ??
        regionPendingRecords[0]?.recordedLocalDate ??
        null,
    };
  });

  return {
    regions,
    byRegion: Object.fromEntries(
      regions.map((region) => [region.regionId, region]),
    ) as Record<RegionId, RegionOverviewItem>,
    currentEvents: events.filter(({ status }) => status === 'current').slice().sort(eventSort),
    historicalEvents: events.filter(({ status }) => status === 'ended').slice().sort(eventSort),
    pendingRecords,
    otherHistory: timeline.filter(
      (item): item is Exclude<TimelineItem, { kind: 'region_event' }> =>
        item.kind !== 'region_event',
    ),
  };
}

export function timepointCountForEvent(
  region: RegionOverviewItem,
  eventId: number,
): number | null {
  return region.timepointCountsByEventId[eventId] ?? null;
}

export function resolveRegionEntry(region: RegionOverviewItem): RegionEntry | null {
  if (region.events.length === 1) {
    return { kind: 'event', eventId: region.events[0].event_id };
  }
  if (region.events.length > 1) {
    return { kind: 'event_picker', regionId: region.regionId };
  }
  if (region.pendingRecords.length) {
    const record =
      region.pendingRecords.find(({ status }) => status === 'needs_input') ??
      region.pendingRecords[0];
    return {
      kind: 'observation',
      observationId: record.observationId,
    };
  }
  return null;
}

export function hasRegionHistory(overview: RegionOverview): boolean {
  return Boolean(
    overview.currentEvents.length ||
      overview.historicalEvents.length ||
      overview.pendingRecords.length,
  );
}

export function chooseDefaultTimepointId(
  timepoints: readonly Pick<RegionEventTimepoint, 'target'>[],
  currentTargetId: number | null,
): number | null {
  if (
    currentTargetId !== null &&
    timepoints.some(({ target }) => target.target_id === currentTargetId)
  ) {
    return currentTargetId;
  }
  return timepoints.at(-1)?.target.target_id ?? null;
}

export function timepointSourceLabel(target: ObservationTarget): string {
  const hasPhotoFacts = target.facts !== null;
  const hasUserNote = Boolean(target.user_note?.trim());
  if (hasPhotoFacts && hasUserNote) return '照片与原文';
  if (hasPhotoFacts) return '照片';
  if (hasUserNote) return '用户原文';
  return '信息不足';
}

export function productContextsForEvent(
  timepoints: readonly Pick<RegionEventTimepoint, 'recorded_at'>[],
  productUses: readonly ProductUse[],
): ProductUse[] {
  if (!timepoints.length) return [];
  const timestamps = timepoints
    .map(({ recorded_at }) => Date.parse(recorded_at))
    .filter(Number.isFinite);
  if (!timestamps.length) return [];
  const start = Math.min(...timestamps);
  const end = Math.max(...timestamps);
  return productUses
    .filter(({ used_at }) => {
      const usedAt = Date.parse(used_at);
      return Number.isFinite(usedAt) && usedAt >= start && usedAt <= end;
    })
    .slice()
    .sort(
      (left, right) =>
        left.used_at.localeCompare(right.used_at) ||
        left.product_use_id - right.product_use_id,
    );
}

export function historyFaceAccessibilityLabel(
  regionId: RegionId,
  state: HistoryRegionVisualState,
  pendingRecords: readonly PendingRegionRecord[] = [],
): string {
  const region = REGIONS.find(({ id }) => id === regionId)!;
  const direction =
    regionId === 'left_face'
      ? '，指你本人真实左侧'
      : regionId === 'right_face'
        ? '，指你本人真实右侧'
        : '';
  const stateLabel =
    state === 'active'
      ? '正在记录且已有时间点'
      : state === 'historical'
        ? '有历史记录'
        : state === 'pending'
          ? '记录正在整理，尚未形成区域时间点'
          : state === 'needs_input'
            ? '记录需要补充文字，尚未形成区域时间点'
            : '从未形成区域时间点';
  const pendingLabel = pendingRecords.some(({ status }) => status === 'needs_input')
    ? '；另有记录需要补充文字'
    : pendingRecords.length
      ? '；另有记录正在整理'
      : '';
  return `${region.label}${direction}，${stateLabel}${pendingLabel}`;
}
