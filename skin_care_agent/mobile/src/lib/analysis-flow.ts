import { createPhotoAnalysis } from './analysis-api.ts';
import type {
  CheckInAnalysisSummary,
  PhotoAnalysis,
} from './analysis-api.ts';
import type { AuthenticatedRequest } from './check-in-api.ts';
import { CHECK_IN_VIEWS } from './check-in-flow.ts';
import type { CheckInViewType } from './check-in-flow.ts';

export type AnalysisViewStatus =
  | 'pending'
  | 'analyzing'
  | 'success'
  | 'failed';

export type AnalysisViewState = {
  viewType: CheckInViewType;
  photoId: number;
  status: AnalysisViewStatus;
  analysisId: number | null;
  analysis: PhotoAnalysis | null;
  error: unknown;
};

export type AnalysisRecoveryAction =
  | 'retry_views'
  | 'refresh_summary'
  | null;

export type AnalysisGenerationGuard = {
  begin(): number;
  isCurrent(generation: number): boolean;
  invalidate(): void;
};

type PhotoCandidate = {
  photo_id: number;
  view_type: CheckInViewType;
};

type SummaryCandidate = Pick<CheckInAnalysisSummary, 'view_summaries'>;

export function buildAnalysisViewStates(
  photos: readonly PhotoCandidate[],
  summary: SummaryCandidate,
): AnalysisViewState[] {
  const photoByView = new Map(
    photos.map((photo) => [photo.view_type, photo] as const),
  );
  const summaryByPhoto = new Map(
    summary.view_summaries.map((view) => [view.photo_id, view] as const),
  );

  return CHECK_IN_VIEWS.flatMap((view) => {
    const photo = photoByView.get(view.type);
    if (!photo) {
      return [];
    }
    const existing = summaryByPhoto.get(photo.photo_id);
    return [
      {
        viewType: view.type,
        photoId: photo.photo_id,
        status: existing ? 'success' : 'pending',
        analysisId: existing?.analysis_id ?? null,
        analysis: null,
        error: null,
      } satisfies AnalysisViewState,
    ];
  });
}

export function completedAnalysisCount(
  states: readonly AnalysisViewState[],
): number {
  return states.filter((state) => state.status === 'success').length;
}

export function analysisRecoveryAction(
  states: readonly AnalysisViewState[],
  summaryRefreshFailed: boolean,
): AnalysisRecoveryAction {
  if (
    states.some(
      (state) => state.status === 'pending' || state.status === 'failed',
    )
  ) {
    return 'retry_views';
  }
  if (
    summaryRefreshFailed &&
    states.length > 0 &&
    states.every((state) => state.status === 'success')
  ) {
    return 'refresh_summary';
  }
  return null;
}

export function createAnalysisGenerationGuard(): AnalysisGenerationGuard {
  let currentGeneration = 0;
  return {
    begin() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent(generation) {
      return generation === currentGeneration;
    },
    invalidate() {
      currentGeneration += 1;
    },
  };
}

export async function runMissingViewAnalyses(
  request: AuthenticatedRequest,
  initialStates: readonly AnalysisViewState[],
  onUpdate?: (states: readonly AnalysisViewState[]) => void,
): Promise<AnalysisViewState[]> {
  const states = initialStates.map((state) => ({ ...state }));

  for (let index = 0; index < states.length; index += 1) {
    if (
      states[index].status !== 'pending' &&
      states[index].status !== 'failed'
    ) {
      continue;
    }

    states[index] = {
      ...states[index],
      status: 'analyzing',
      error: null,
    };
    onUpdate?.(states.map((state) => ({ ...state })));

    try {
      const analysis = await createPhotoAnalysis(
        request,
        states[index].photoId,
      );
      states[index] = {
        ...states[index],
        status: 'success',
        analysisId: analysis.analysis_id,
        analysis,
        error: null,
      };
    } catch (error) {
      states[index] = {
        ...states[index],
        status: 'failed',
        error,
      };
    }
    onUpdate?.(states.map((state) => ({ ...state })));
  }

  return states;
}
