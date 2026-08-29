export type ObservationDetailBackTarget = 'native' | '/(tabs)/history';

export function observationDetailBackTarget(
  canGoBack: boolean,
): ObservationDetailBackTarget {
  return canGoBack ? 'native' : '/(tabs)/history';
}
