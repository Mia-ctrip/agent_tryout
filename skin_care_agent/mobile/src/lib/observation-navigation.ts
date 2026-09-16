export type ObservationDetailSource = 'history_full_face';
export type ObservationDetailBackTarget =
  | 'native'
  | '/(tabs)/history'
  | '/(tabs)/history?view=full_face';
export type ObservationCaptureEntry = 'camera' | 'library';
export type ProductUseSource =
  | 'after_observation'
  | 'observation'
  | 'region_event'
  | 'observe';

export type ProductUseRouteContext = {
  source: ProductUseSource;
  flowId: string;
  observationId?: number;
  eventId?: number;
};

export function observationCaptureHref(entry: ObservationCaptureEntry): string {
  return `/observation/new?entry=${entry}`;
}

export function observationDetailBackTarget(
  canGoBack: boolean,
  source?: string,
): ObservationDetailBackTarget {
  if (canGoBack) return 'native';
  return source === 'history_full_face'
    ? '/(tabs)/history?view=full_face'
    : '/(tabs)/history';
}

export function observationDetailHref(
  observationId: number,
  source?: ObservationDetailSource,
): string {
  if (source === 'history_full_face') {
    return `/observation/${observationId}?view=overview&source=history_full_face`;
  }
  return `/observation/${observationId}`;
}

export function productUseHref({
  source,
  flowId,
  observationId,
  eventId,
}: ProductUseRouteContext): string {
  const params = new URLSearchParams({ source, flowId });
  if (observationId !== undefined) params.set('observationId', String(observationId));
  if (eventId !== undefined) params.set('eventId', String(eventId));
  return `/product-use/new?${params.toString()}`;
}

export function productUseExitTarget({
  source,
  observationId,
  eventId,
}: Omit<ProductUseRouteContext, 'flowId'>): string {
  if (
    (source === 'after_observation' || source === 'observation') &&
    Number.isSafeInteger(observationId) &&
    observationId! > 0
  ) {
    return `/observation/${observationId}`;
  }
  if (source === 'region_event' && Number.isSafeInteger(eventId) && eventId! > 0) {
    return `/region-event/${eventId}`;
  }
  return '/(tabs)/observe';
}
