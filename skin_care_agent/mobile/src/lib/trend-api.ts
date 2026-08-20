import type { AuthenticatedRequest } from './check-in-api.ts';

export const TREND_RANGE_OPTIONS = [7, 30, 90] as const;

export type TrendRangeDays = (typeof TREND_RANGE_OPTIONS)[number];

export type TrendDailyPoint = {
  day: string;
  source: 'check_in' | 'legacy' | null;
  check_in_id: number | null;
  overall_severity: number | null;
  skin_health_index: number | null;
  total_estimated_count: number;
  analysis_count: number;
  check_in_count: number;
};

export type TrendRegionSummary = {
  view_type: string;
  region: string;
  active_lineage_count: number;
  dormant_lineage_count: number;
  healed_lineage_count: number;
  latest_dominant_type: string | null;
  latest_coverage: string | null;
};

export type TrendSummary = {
  range_days: number;
  start_date: string;
  end_date: string;
  total_analyses: number;
  total_check_ins: number;
  incomplete_check_ins: number;
  superseded_check_ins: number;
  total_legacy_records: number;
  total_active_lineages: number;
  total_new_lineages_in_range: number;
  total_healed_lineages_in_range: number;
  daily_points: TrendDailyPoint[];
  region_summaries: TrendRegionSummary[];
  highlights: string[];
};

export async function getTrendSummary(
  request: AuthenticatedRequest,
  days: TrendRangeDays,
): Promise<TrendSummary> {
  return request<TrendSummary>(`/trends/summary?days=${days}`);
}
