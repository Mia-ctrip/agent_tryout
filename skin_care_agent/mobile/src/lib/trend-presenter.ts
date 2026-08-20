import type {
  TrendDailyPoint,
  TrendRegionSummary,
} from './trend-api.ts';

const viewLabels: Record<string, string> = {
  front: '正面',
  left: '左侧',
  right: '右侧',
};

const regionLabels: Record<string, string> = {
  forehead: '额头',
  left_cheek: '左颊',
  right_cheek: '右颊',
  nose: '鼻部',
  chin: '下巴',
  mouth_area: '口周',
  jaw: '下颌',
  temple: '太阳穴',
};

const cameraViews = ['front', 'left', 'right'] as const;

export function recordedTrendPoints(
  points: readonly TrendDailyPoint[],
): TrendDailyPoint[] {
  return points.filter((point) => point.source !== null);
}

export function latestRecordedTrendPoint(
  points: readonly TrendDailyPoint[],
): TrendDailyPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].source !== null) {
      return points[index];
    }
  }
  return null;
}

export function trendPointBarPercent(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

export function formatTrendDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) {
    return day;
  }
  return `${Number(match[2])}月${Number(match[3])}日`;
}

export function trendRegionTitle(
  viewType: string,
  region: string,
): string {
  const regionLabel = regionLabels[region] ?? region;
  const viewLabel = viewLabels[viewType];
  return viewLabel ? `${viewLabel} · ${regionLabel}` : regionLabel;
}

export function selectTrendOverviewRegions<
  T extends Pick<TrendRegionSummary, 'view_type'>,
>(regions: readonly T[], limit = 6): T[] {
  if (limit <= 0) {
    return [];
  }

  const selected = cameraViews
    .map((viewType) =>
      regions.find((region) => region.view_type === viewType),
    )
    .filter((region): region is T => region !== undefined);

  for (const region of regions) {
    if (selected.length >= limit) {
      break;
    }
    if (!selected.includes(region)) {
      selected.push(region);
    }
  }

  return selected.slice(0, limit);
}
