export type ObservationDetailBackTarget = 'native' | '/(tabs)/history';
export type ObservationCaptureEntry = 'camera' | 'library';

export function observationCaptureHref(entry: ObservationCaptureEntry): string {
  return `/observation/new?entry=${entry}`;
}

export function observationDetailBackTarget(
  canGoBack: boolean,
): ObservationDetailBackTarget {
  return canGoBack ? 'native' : '/(tabs)/history';
}
