export type TrendGenerationGuard = {
  begin(): number;
  isCurrent(generation: number): boolean;
  invalidate(): void;
};

export const DEFAULT_TREND_RANGE_DAYS = 30;

export type TrendScreenState = 'loading' | 'error' | 'empty' | 'ready';

export function trendScreenState(
  loading: boolean,
  error: string | null,
  hasSummary: boolean,
  hasOverview: boolean,
): TrendScreenState {
  if (loading) {
    return 'loading';
  }
  if (error || !hasSummary) {
    return 'error';
  }
  return hasOverview ? 'ready' : 'empty';
}

export function createTrendGenerationGuard(): TrendGenerationGuard {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}

export async function loadCurrentTrend<T>({
  guard,
  load,
  onSuccess,
  onError,
  onSettled,
  isActive = () => true,
}: {
  guard: TrendGenerationGuard;
  load: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError?: (error: unknown) => void;
  onSettled?: () => void;
  isActive?: () => boolean;
}): Promise<void> {
  const generation = guard.begin();
  const isCurrent = () =>
    isActive() && guard.isCurrent(generation);

  try {
    const value = await load();
    if (isCurrent()) {
      onSuccess(value);
    }
  } catch (error) {
    if (isCurrent()) {
      onError?.(error);
    }
  } finally {
    if (isCurrent()) {
      onSettled?.();
    }
  }
}
