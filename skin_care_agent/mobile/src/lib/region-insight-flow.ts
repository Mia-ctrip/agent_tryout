import { formatHistoryShortDate } from './history-flow.ts';
import type {
  ComparisonDimension,
  EvidenceStrength,
  InsightTimepointRef,
  RegionComparison,
  RegionEventTimepoint,
  RegionInsights,
  RegionTrendProgress,
  TrendDimensionKey,
} from './region-event-api.ts';

export const INSIGHT_BOUNDARY_TEXT =
  '只描述照片中可见表现的变化方向；光线、角度会限制结论，不代表改善、恶化或疗效。';
const INSUFFICIENT_HEADLINE = '两张照片的拍摄条件差异较大，暂不给出变化结论。';
const TREND_INSUFFICIENT_HEADLINE = '这段时间的照片可比性不足，暂不给出阶段趋势。';

const COMPARISON_LABELS: Record<ComparisonDimension, string> = {
  visible_amount: '可见数量',
  distribution: '分布',
  coverage: '范围',
  color_prominence: '颜色',
  elevation: '隆起',
  surface: '表面',
  location_pattern: '位置',
};
const TREND_DIMENSIONS: [TrendDimensionKey, string][] = [
  ['visible_amount', '可见数量'],
  ['distribution', '分布'],
  ['coverage', '范围'],
  ['color_prominence', '颜色'],
  ['elevation_and_surface', '隆起与表面'],
  ['location_pattern', '位置'],
];
const STRENGTH_TEXT: Record<EvidenceStrength, string> = {
  较明确: '证据较明确',
  有限: '证据有限',
  无法可靠判断: '无法可靠判断',
};
const EVIDENCE = /^(T\d+)\[(图|记录)\][：:]\s*(.*)$/;

// ---------------------------------------------------------------- progress

export function buildTrendProgressText(progress: RegionTrendProgress): string | null {
  if (progress.eligible) return null;
  if (progress.days === 0) return '记录两天后可以对比，记录满一周后可查看阶段趋势。';
  if (progress.days === 1) return '已记录 1 天；再记录 1 天后可以对比。';
  const more = Math.max(progress.missing_days, progress.missing_span_days);
  return `已记录 ${progress.days} 天，跨度 ${progress.span_days} 天；再记录约 ${more} 天后可查看阶段趋势。`;
}

// ---------------------------------------------------------------- pair picking

export function comparisonCandidates(
  timepoints: readonly RegionEventTimepoint[],
): RegionEventTimepoint[] {
  return timepoints
    .filter(point => point.photo)
    .slice()
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.target.target_id - b.target.target_id);
}

function sameDay(points: readonly RegionEventTimepoint[], a: number, b: number): boolean {
  const byId = new Map(points.map(point => [point.target.target_id, point.recorded_local_date]));
  return byId.get(a) === byId.get(b);
}

/** Server default (earliest vs latest) when given, otherwise the same rule locally. Never random. */
export function defaultComparisonPair(
  timepoints: readonly RegionEventTimepoint[],
  serverDefault?: [number, number] | null,
): [number, number] | null {
  if (serverDefault) return serverDefault;
  const candidates = comparisonCandidates(timepoints);
  if (candidates.length < 2) return null;
  const first = candidates[0].target.target_id;
  const last = candidates[candidates.length - 1].target.target_id;
  return sameDay(candidates, first, last) ? null : [first, last];
}

/** Put `targetId` into one slot; returns the chronological pair or null if not allowed. */
export function assignComparisonSlot(
  timepoints: readonly RegionEventTimepoint[],
  pair: [number, number],
  slot: 'earlier' | 'later',
  targetId: number,
): [number, number] | null {
  const candidates = comparisonCandidates(timepoints);
  const order = new Map(candidates.map((point, index) => [point.target.target_id, index]));
  const other = slot === 'earlier' ? pair[1] : pair[0];
  if (!order.has(targetId) || targetId === other || sameDay(candidates, targetId, other)) {
    return null;
  }
  const next: [number, number] = [targetId, other];
  return (order.get(next[0]) ?? 0) <= (order.get(next[1]) ?? 0) ? next : [next[1], next[0]];
}

// ---------------------------------------------------------------- evidence

export function describeEvidence(
  line: string,
  timepoints: readonly InsightTimepointRef[],
): string | null {
  const match = EVIDENCE.exec(line.trim());
  if (!match) return null;
  const ref = timepoints.find(point => point.timepoint_id === match[1]);
  if (!ref) return null;
  const source = match[2] === '图' ? '照片' : '记录显示';
  return `${formatHistoryShortDate(ref.local_date)} · ${source}：${match[3]}`;
}

function dateOf(timepointId: string, timepoints: readonly InsightTimepointRef[]): string | null {
  const ref = timepoints.find(point => point.timepoint_id === timepointId);
  return ref ? formatHistoryShortDate(ref.local_date) : null;
}

// ---------------------------------------------------------------- comparison view

export type ComparisonView =
  | { kind: 'processing'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'insufficient'; headline: string; reasons: string[]; unknowns: string[] }
  | {
      kind: 'result';
      headline: string;
      reliabilityText: string;
      limits: string[];
      changes: { label: string; location: string; before: string; after: string; change: string; strength: string }[];
      unknowns: string[];
      summary: string;
    };

export function buildComparisonView(
  comparison: Pick<RegionComparison, 'status' | 'result' | 'failure_code'>,
): ComparisonView {
  const { status, result } = comparison;
  if (status === 'processing') {
    return { kind: 'processing', message: '正在整理两次记录的可见变化，可以先离开，稍后回来查看。' };
  }
  if (status === 'failed' && comparison.failure_code === 'quota_exceeded') {
    return { kind: 'failed', message: '今天的 AI 整理次数已用完，原始照片和记录仍然保留，明天可以重试。' };
  }
  if (status === 'failed' || !result) {
    return { kind: 'failed', message: '这次未能生成对比，原始照片和记录仍然保留，可以稍后重试。' };
  }
  if (status === 'degraded' || !result.headline || result.overall_change === '无法可靠判断') {
    return {
      kind: 'insufficient',
      headline: INSUFFICIENT_HEADLINE,
      reasons: result.comparison_reliability.reasons,
      unknowns: result.unknowns,
    };
  }
  return {
    kind: 'result',
    headline: result.headline,
    reliabilityText: `照片可比性：${result.comparison_reliability.level}`,
    limits: result.comparison_reliability.reasons,
    changes: result.changes.map(change => ({
      label: COMPARISON_LABELS[change.dimension] ?? change.dimension,
      location: change.location,
      before: change.photo_a,
      after: change.photo_b,
      change: change.change,
      strength: STRENGTH_TEXT[change.evidence_strength] ?? change.evidence_strength,
    })),
    unknowns: result.unknowns,
    summary: result.summary,
  };
}

// ---------------------------------------------------------------- trend view

export type TrendView =
  | { kind: 'locked'; message: string }
  | { kind: 'processing'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'insufficient'; headline: string; reasons: string[]; updating: boolean }
  | {
      kind: 'result';
      headline: string;
      reliabilityText: string;
      updating: boolean;
      dimensions: { label: string; trend: string; evidence: string[] }[];
      phases: string[];
      notable: { targetId: number; label: string; reason: string }[];
      unknowns: string[];
      summary: string;
    };

export function buildTrendView(
  insights: Pick<RegionInsights, 'trend_status' | 'trend' | 'trend_is_current' | 'trend_progress'>,
): TrendView {
  const { trend, trend_status: status } = insights;
  if (status === 'locked') {
    return { kind: 'locked', message: buildTrendProgressText(insights.trend_progress) ?? '' };
  }
  const shown = trend && trend.result && trend.status !== 'failed' ? trend : null;
  if (!shown || !shown.result) {
    if (status === 'failed') {
      return { kind: 'failed', message: '这次未能生成阶段趋势，原始记录不受影响，可以稍后重试。' };
    }
    return { kind: 'processing', message: '正在整理这段时间的可见变化，可以先离开，稍后回来查看。' };
  }
  const updating = !insights.trend_is_current;
  const result = shown.result;
  if (shown.status === 'degraded' || !result.headline || result.overall_trend === '无法可靠判断趋势') {
    return {
      kind: 'insufficient',
      headline: TREND_INSUFFICIENT_HEADLINE,
      reasons: result.series_reliability.reasons,
      updating,
    };
  }
  const refs = shown.timepoints;
  return {
    kind: 'result',
    headline: result.headline,
    reliabilityText: `序列可靠性：${result.series_reliability.level}`,
    updating,
    dimensions: TREND_DIMENSIONS
      .map(([key, label]) => ({ key, label, value: result.dimension_trends[key] }))
      .filter(item => item.value && item.value.trend !== '无法可靠判断')
      .map(({ label, value }) => ({
        label,
        trend: value.trend,
        evidence: value.evidence
          .map(line => describeEvidence(line, refs))
          .filter((line): line is string => line !== null),
      })),
    phases: result.phases.flatMap(phase => {
      const start = dateOf(phase.start_timepoint, refs);
      const end = dateOf(phase.end_timepoint, refs);
      return start && end ? [`${start}—${end}：${phase.pattern}`] : [];
    }),
    notable: result.notable_timepoints.flatMap(item => {
      const ref = refs.find(point => point.timepoint_id === item.timepoint_id);
      return ref
        ? [{ targetId: ref.target_id, label: formatHistoryShortDate(ref.local_date), reason: item.reason }]
        : [];
    }),
    unknowns: result.unknowns,
    summary: result.summary,
  };
}
