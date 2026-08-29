import type {
  AuthenticatedRequest,
  ObservationResultSource,
  ObservationTargetStatus,
} from './observation-api.ts';
import type { ProductUseProduct } from './product-api.ts';
import type { RegionId } from './region-catalog.ts';

export type RegionEventTimelineItem = {
  kind: 'region_event';
  timeline_id: string;
  occurred_at: string;
  event_id: number;
  region_id: RegionId;
  status: 'current' | 'ended';
  started_local_date: string;
  last_valid_local_date: string;
  timepoint_count: number;
  sources: ObservationResultSource[];
};

export type FullFaceTimelineItem = {
  kind: 'full_face_observation';
  timeline_id: string;
  occurred_at: string;
  observation_id: number;
  recorded_at: string;
  target_status: ObservationTargetStatus;
  source: ObservationResultSource | null;
};

export type ProductUseTimelineItem = {
  kind: 'product_use';
  timeline_id: string;
  occurred_at: string;
  product_use_id: number;
  used_at: string;
  products: ProductUseProduct[];
  note: string | null;
  source: 'user_record';
};

export type TimelineItem =
  | RegionEventTimelineItem
  | FullFaceTimelineItem
  | ProductUseTimelineItem;

export async function listTimeline(
  request: AuthenticatedRequest,
  limit = 100,
): Promise<TimelineItem[]> {
  return request<TimelineItem[]>(`/timeline?limit=${limit}`);
}
