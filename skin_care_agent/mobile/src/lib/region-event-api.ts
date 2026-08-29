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
