import type {
  TrendDailyPoint,
  TrendRangeDays,
  TrendSummary,
} from './trend-api.ts';

export type DevelopmentTrendMode = 'ready';

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayAt(start: Date, offset: number): string {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + offset);
  return isoDay(date);
}

export function developmentTrendMode(
  isDevelopment: boolean,
  value: string | string[] | undefined,
): DevelopmentTrendMode | null {
  return isDevelopment && value === 'ready' ? 'ready' : null;
}

export function developmentTrendFixture(
  days: TrendRangeDays,
): TrendSummary {
  const end = new Date(Date.UTC(2026, 6, 30));
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - days + 1);
  const recordIndices = [
    0,
    Math.floor((days - 1) / 3),
    Math.floor(((days - 1) * 2) / 3),
    days - 1,
  ];
  const indices = [58, 63, 68, 74];
  const counts = [11, 9, 7, 5];

  const dailyPoints: TrendDailyPoint[] = Array.from(
    { length: days },
    (_, offset) => {
      const recordPosition = recordIndices.indexOf(offset);
      if (recordPosition === -1) {
        return {
          day: dayAt(start, offset),
          source: null,
          check_in_id: null,
          overall_severity: null,
          skin_health_index: null,
          total_estimated_count: 0,
          analysis_count: 0,
          check_in_count: 0,
        };
      }
      return {
        day: dayAt(start, offset),
        source: 'check_in',
        check_in_id: 9001 + recordPosition,
        overall_severity: Math.max(1, 4 - recordPosition),
        skin_health_index: indices[recordPosition],
        total_estimated_count: counts[recordPosition],
        analysis_count: 3,
        check_in_count: 1,
      };
    },
  );

  return {
    range_days: days,
    start_date: isoDay(start),
    end_date: isoDay(end),
    total_analyses: 12,
    total_check_ins: 4,
    incomplete_check_ins: 1,
    superseded_check_ins: 0,
    total_legacy_records: 0,
    total_active_lineages: 4,
    total_new_lineages_in_range: 2,
    total_healed_lineages_in_range: 3,
    daily_points: dailyPoints,
    region_summaries: [
      {
        view_type: 'front',
        region: 'right_cheek',
        active_lineage_count: 2,
        dormant_lineage_count: 1,
        healed_lineage_count: 2,
        latest_dominant_type: 'papule',
        latest_coverage: 'sparse',
      },
      {
        view_type: 'left',
        region: 'chin',
        active_lineage_count: 1,
        dormant_lineage_count: 0,
        healed_lineage_count: 1,
        latest_dominant_type: 'comedone',
        latest_coverage: 'sparse',
      },
      {
        view_type: 'right',
        region: 'temple',
        active_lineage_count: 1,
        dormant_lineage_count: 1,
        healed_lineage_count: 0,
        latest_dominant_type: 'papule',
        latest_coverage: 'sparse',
      },
    ],
    highlights: [
      `皮肤指数近 ${days} 天上升 16 分（58 → 74），趋势向好。`,
      `近 ${days} 天有 3 处痘斑区域已消退。`,
      '当前活跃痘斑最多的区域：正面·右颊（2 处活跃）。',
    ],
  };
}
