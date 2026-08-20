import type {
  AuthenticatedRequest,
  CheckInDiary,
} from './check-in-api.ts';
import type { CheckInViewType } from './check-in-flow.ts';

export type PhotoAnalysis = {
  analysis_id: number;
  photo_id: number;
  provider: string;
  model: string;
  parsed_result: Record<string, unknown>;
  overall_severity: number | null;
  skin_health_index: number | null;
  needs_doctor: boolean;
  created_at: string;
  cached: boolean;
};

export type CheckInViewAnalysisSummary = {
  view_type: CheckInViewType;
  photo_id: number;
  analysis_id: number;
  analysis_created_at: string;
  overall_severity: number | null;
  skin_health_index: number | null;
  needs_doctor: boolean;
  total_estimated_count: number;
  region_estimated_counts: Record<string, number>;
};

export type CheckInAnalysisSummary = {
  check_in_id: number;
  kind: 'quick' | 'standard';
  check_in_status: 'draft' | 'complete';
  observed_on: string;
  aggregation_status: 'empty' | 'partial' | 'ready';
  required_views: CheckInViewType[];
  missing_photo_views: CheckInViewType[];
  missing_analysis_views: CheckInViewType[];
  photo_count: number;
  analyzed_view_count: number;
  overall_severity: number | null;
  skin_health_index: number | null;
  needs_doctor: boolean;
  total_estimated_count: number;
  region_estimated_counts: Record<string, number>;
  latest_analysis_at: string | null;
  diary: CheckInDiary | null;
  view_summaries: CheckInViewAnalysisSummary[];
};

const inFlightByRequest = new WeakMap<
  AuthenticatedRequest,
  Map<number, Promise<PhotoAnalysis>>
>();

export function createPhotoAnalysis(
  request: AuthenticatedRequest,
  photoId: number,
  force = false,
): Promise<PhotoAnalysis> {
  if (force) {
    return request<PhotoAnalysis>('/analyses', {
      method: 'POST',
      body: JSON.stringify({
        photo_id: photoId,
        force: true,
      }),
    });
  }

  let requestMap = inFlightByRequest.get(request);
  if (!requestMap) {
    requestMap = new Map();
    inFlightByRequest.set(request, requestMap);
  }
  const existing = requestMap.get(photoId);
  if (existing) {
    return existing;
  }

  const pending = request<PhotoAnalysis>('/analyses', {
    method: 'POST',
    body: JSON.stringify({
      photo_id: photoId,
      force: false,
    }),
  });
  requestMap.set(photoId, pending);
  const cleanup = () => {
    if (requestMap?.get(photoId) === pending) {
      requestMap.delete(photoId);
      if (requestMap.size === 0) {
        inFlightByRequest.delete(request);
      }
    }
  };
  void pending.then(cleanup, cleanup);
  return pending;
}

export async function getCheckInAnalysisSummary(
  request: AuthenticatedRequest,
  checkInId: number,
): Promise<CheckInAnalysisSummary> {
  return request<CheckInAnalysisSummary>(
    `/check-ins/${checkInId}/analysis-summary`,
  );
}
