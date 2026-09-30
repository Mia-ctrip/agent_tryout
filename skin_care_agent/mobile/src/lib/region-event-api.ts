import type {
  AuthenticatedRequest,
  ObservationPhoto,
  ObservationTarget,
} from './observation-api.ts';
import type { RegionId } from './region-catalog.ts';
import type { LifeContextId } from './life-context.ts';

export type RegionEventAction = 'auto_new' | 'auto_continue' | 'choice_required';
export type RegionEventDecision = 'continue' | 'start_new';

export type RegionEventPreview = {
  region_id: RegionId;
  action: RegionEventAction;
  event_id: number | null;
  event_status: 'pending' | 'current' | null;
  last_valid_local_date: string | null;
  days_since_last: number | null;
};

export type RegionEvent = {
  event_id: number;
  region_id: RegionId;
  status: 'current' | 'ended';
  started_local_date: string;
  last_valid_local_date: string;
  ended_local_date: string | null;
  ended_at: string | null;
};

export type RegionEventTimepoint = {
  observation_id: number;
  recorded_at: string;
  recorded_timezone_offset_minutes: number | null;
  recorded_local_date: string;
  life_context_ids: LifeContextId[];
  life_context_completed_at: string | null;
  photo: ObservationPhoto | null;
  target: ObservationTarget;
};

export type RegionEventDetail = RegionEvent & {
  timepoints: RegionEventTimepoint[];
};

export async function previewRegionEvents(
  request: AuthenticatedRequest,
  input: {
    regionIds: RegionId[];
    recordedAt: string;
    timezoneOffsetMinutes: number;
  },
): Promise<RegionEventPreview[]> {
  return request<RegionEventPreview[]>('/region-events/preview', {
    method: 'POST',
    body: JSON.stringify({
      region_ids: input.regionIds,
      recorded_at: input.recordedAt,
      recorded_timezone_offset_minutes: input.timezoneOffsetMinutes,
    }),
  });
}

export async function listRegionEvents(
  request: AuthenticatedRequest,
  status?: 'current' | 'ended',
): Promise<RegionEvent[]> {
  return request<RegionEvent[]>(
    status ? `/region-events?status=${status}` : '/region-events',
  );
}

export async function getRegionEvent(
  request: AuthenticatedRequest,
  eventId: number,
): Promise<RegionEventDetail> {
  return request<RegionEventDetail>(`/region-events/${eventId}`);
}

export type InsightStatus = 'processing' | 'completed' | 'degraded' | 'failed';

/** Maps the model's T-ids to real timepoints; carries no photo or facts. */
export type InsightTimepointRef = {
  timepoint_id: string;
  target_id: number;
  observation_id: number;
  local_date: string;
  image_index: number | null;
  crop: 'region_crop' | 'full_photo' | null;
};

export type ComparisonReliability = '较高' | '有限' | '不足';
export type EvidenceStrength = '较明确' | '有限' | '无法可靠判断';
export type ComparisonDimension =
  | 'visible_amount' | 'distribution' | 'coverage' | 'color_prominence'
  | 'elevation' | 'surface' | 'location_pattern';

export type ComparisonSide = {
  main_locations: string[];
  estimated_amount: string;
  distribution: string;
  coverage: string;
  key_appearance: string[];
};

export type RegionComparisonResult = {
  comparison_reliability: {
    level: ComparisonReliability;
    reasons: string[];
    comparable_dimensions: string[];
    limited_dimensions: string[];
  };
  photo_a: ComparisonSide;
  photo_b: ComparisonSide;
  changes: {
    dimension: ComparisonDimension;
    location: string;
    photo_a: string;
    photo_b: string;
    change: string;
    evidence_strength: EvidenceStrength;
  }[];
  overall_change: string;
  headline: string;
  unknowns: string[];
  summary: string;
};

export type RegionComparison = {
  comparison_id: number;
  event_id: number;
  region_id: RegionId;
  status: InsightStatus;
  earlier_target_id: number;
  later_target_id: number;
  timepoints: InsightTimepointRef[];
  result: RegionComparisonResult | null;
  failure_code: string | null;
  prompt_version: string;
  schema_version: string;
  model: string | null;
  completed_at: string | null;
};

export type TrendDimensionKey =
  | 'visible_amount' | 'distribution' | 'coverage' | 'color_prominence'
  | 'elevation_and_surface' | 'location_pattern';

export type RegionTrendResult = {
  series_reliability: {
    level: ComparisonReliability;
    reasons: string[];
    usable_timepoints: string[];
    limited_timepoints: string[];
  };
  dimension_trends: Record<TrendDimensionKey, { trend: string; evidence: string[] }>;
  phases: { start_timepoint: string; end_timepoint: string; pattern: string; evidence: string }[];
  notable_timepoints: { timepoint_id: string; reason: string }[];
  overall_trend: string;
  headline: string;
  unknowns: string[];
  summary: string;
};

export type RegionTrend = {
  trend_id: number;
  status: InsightStatus;
  timepoints: InsightTimepointRef[];
  result: RegionTrendResult | null;
  failure_code: string | null;
  prompt_version: string;
  schema_version: string;
  model: string | null;
  completed_at: string | null;
};

export type RegionTrendProgress = {
  days: number;
  span_days: number;
  eligible: boolean;
  missing_days: number;
  missing_span_days: number;
  window_start_date: string | null;
  window_end_date: string | null;
};

export type RegionInsights = {
  event_id: number;
  region_id: RegionId;
  photo_timepoint_count: number;
  comparison_eligible: boolean;
  default_pair: [number, number] | null;
  trend_progress: RegionTrendProgress;
  trend_status: 'locked' | 'stale' | 'processing' | 'failed' | 'ready';
  trend: RegionTrend | null;
  trend_is_current: boolean;
};

export async function getRegionInsights(
  request: AuthenticatedRequest,
  eventId: number,
): Promise<RegionInsights> {
  return request<RegionInsights>(`/region-events/${eventId}/insights`);
}

export async function refreshRegionTrend(
  request: AuthenticatedRequest,
  eventId: number,
): Promise<RegionInsights> {
  return request<RegionInsights>(`/region-events/${eventId}/trend/refresh`, { method: 'POST' });
}

/** Idempotent: the same pair returns the cached comparison instead of a new AI call. */
export async function createRegionComparison(
  request: AuthenticatedRequest,
  eventId: number,
  pair: { earlierTargetId: number; laterTargetId: number },
): Promise<RegionComparison> {
  return request<RegionComparison>(`/region-events/${eventId}/comparisons`, {
    method: 'POST',
    body: JSON.stringify({
      earlier_target_id: pair.earlierTargetId,
      later_target_id: pair.laterTargetId,
    }),
  });
}

export async function getRegionComparison(
  request: AuthenticatedRequest,
  eventId: number,
  comparisonId: number,
): Promise<RegionComparison> {
  return request<RegionComparison>(`/region-events/${eventId}/comparisons/${comparisonId}`);
}

export async function endRegionEvent(
  request: AuthenticatedRequest,
  eventId: number,
  endedAt: Date = new Date(),
): Promise<RegionEvent> {
  return request<RegionEvent>(`/region-events/${eventId}/end`, {
    method: 'POST',
    body: JSON.stringify({
      ended_at: endedAt.toISOString(),
      timezone_offset_minutes: -endedAt.getTimezoneOffset(),
    }),
  });
}
