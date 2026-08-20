import type {
  CheckInAnalysisSummary,
  CheckInViewAnalysisSummary,
} from './analysis-api.ts';
import {
  buildAnalysisViewStates,
} from './analysis-flow.ts';
import type { AnalysisViewState } from './analysis-flow.ts';

export type DevelopmentAnalysisMode =
  | 'ready'
  | 'partial'
  | 'failed'
  | 'doctor';

type DevelopmentAnalysisFixture = {
  summary: CheckInAnalysisSummary;
  states: AnalysisViewState[];
};

const photos = [
  { photo_id: 90011, view_type: 'front' as const },
  { photo_id: 90012, view_type: 'left' as const },
  { photo_id: 90013, view_type: 'right' as const },
];

const viewSummaries: CheckInViewAnalysisSummary[] = [
  {
    view_type: 'front',
    photo_id: 90011,
    analysis_id: 90101,
    analysis_created_at: '2026-07-30T08:00:00Z',
    overall_severity: 4,
    skin_health_index: 68,
    needs_doctor: false,
    total_estimated_count: 12,
    region_estimated_counts: {
      forehead: 4,
      left_cheek: 3,
      right_cheek: 3,
      chin: 2,
    },
  },
  {
    view_type: 'left',
    photo_id: 90012,
    analysis_id: 90102,
    analysis_created_at: '2026-07-30T08:00:05Z',
    overall_severity: 5,
    skin_health_index: 62,
    needs_doctor: false,
    total_estimated_count: 9,
    region_estimated_counts: {
      forehead: 2,
      left_cheek: 5,
      chin: 2,
    },
  },
  {
    view_type: 'right',
    photo_id: 90013,
    analysis_id: 90103,
    analysis_created_at: '2026-07-30T08:00:10Z',
    overall_severity: 3,
    skin_health_index: 74,
    needs_doctor: false,
    total_estimated_count: 7,
    region_estimated_counts: {
      forehead: 2,
      right_cheek: 4,
      chin: 1,
    },
  },
];

function buildSummary(
  views: CheckInViewAnalysisSummary[],
  overrides: Partial<CheckInAnalysisSummary> = {},
): CheckInAnalysisSummary {
  const analyzedViews = new Set(views.map((view) => view.view_type));
  const missingAnalysisViews = photos
    .map((photo) => photo.view_type)
    .filter((view) => !analyzedViews.has(view));
  return {
    check_in_id: 9001,
    kind: 'standard',
    check_in_status: 'complete',
    observed_on: '2026-07-30',
    aggregation_status:
      missingAnalysisViews.length === 0 ? 'ready' : 'partial',
    required_views: ['front', 'left', 'right'],
    missing_photo_views: [],
    missing_analysis_views: missingAnalysisViews,
    photo_count: 3,
    analyzed_view_count: views.length,
    overall_severity:
      views.length > 0
        ? Math.max(...views.map((view) => view.overall_severity ?? 0))
        : null,
    skin_health_index:
      views.length > 0
        ? Math.round(
            (views.reduce(
              (total, view) => total + (view.skin_health_index ?? 0),
              0,
            ) /
              views.length) *
              10,
          ) / 10
        : null,
    needs_doctor: views.some((view) => view.needs_doctor),
    total_estimated_count: 16,
    region_estimated_counts: {
      forehead: 4,
      left_cheek: 5,
      right_cheek: 4,
      chin: 3,
    },
    latest_analysis_at:
      views.at(-1)?.analysis_created_at ?? null,
    diary: null,
    view_summaries: views,
    ...overrides,
  };
}

export function developmentAnalysisMode(
  isDevelopment: boolean,
  value: string | string[] | undefined,
): DevelopmentAnalysisMode | null {
  if (
    !isDevelopment ||
    typeof value !== 'string' ||
    !['ready', 'partial', 'failed', 'doctor'].includes(value)
  ) {
    return null;
  }
  return value as DevelopmentAnalysisMode;
}

export function developmentAnalysisFixture(
  mode: DevelopmentAnalysisMode,
): DevelopmentAnalysisFixture {
  if (mode === 'doctor') {
    const doctorViews = viewSummaries.map((view, index) => ({
      ...view,
      overall_severity: index === 0 ? 8 : view.overall_severity,
      skin_health_index: index === 0 ? 38 : view.skin_health_index,
      needs_doctor: index === 0,
    }));
    const summary = buildSummary(doctorViews, {
      overall_severity: 8,
      skin_health_index: 48,
      needs_doctor: true,
      total_estimated_count: 28,
    });
    return {
      summary,
      states: buildAnalysisViewStates(photos, summary),
    };
  }

  if (mode === 'partial') {
    const summary = buildSummary(viewSummaries.slice(0, 2));
    return {
      summary,
      states: buildAnalysisViewStates(photos, summary),
    };
  }

  if (mode === 'failed') {
    const summary = buildSummary([viewSummaries[0], viewSummaries[2]]);
    const states = buildAnalysisViewStates(photos, summary).map((state) =>
      state.viewType === 'left'
        ? {
            ...state,
            status: 'failed' as const,
            error: new Error('development fixture failure'),
          }
        : state,
    );
    return { summary, states };
  }

  const summary = buildSummary(viewSummaries);
  return {
    summary,
    states: buildAnalysisViewStates(photos, summary),
  };
}
