export type PrivacyPhotoState = {
  photoId: number;
  sourceUrl: string;
  displayUrl: string;
  automaticRefreshAllowed: boolean;
};

export type PrivacyPhotoAutomaticRefresh = {
  state: PrivacyPhotoState;
  shouldRefresh: boolean;
};

export function createPrivacyPhotoState(
  photoId: number,
  sourceUrl: string,
): PrivacyPhotoState {
  return {
    photoId,
    sourceUrl,
    displayUrl: sourceUrl,
    automaticRefreshAllowed: true,
  };
}

export function syncPrivacyPhotoSource(
  state: PrivacyPhotoState,
  photoId: number,
  sourceUrl: string,
): PrivacyPhotoState {
  if (state.photoId === photoId && state.sourceUrl === sourceUrl) return state;
  return createPrivacyPhotoState(photoId, sourceUrl);
}

export function beginPrivacyPhotoAutomaticRefresh(
  state: PrivacyPhotoState,
): PrivacyPhotoAutomaticRefresh {
  if (!state.automaticRefreshAllowed) {
    return { state, shouldRefresh: false };
  }
  return {
    state: { ...state, automaticRefreshAllowed: false },
    shouldRefresh: true,
  };
}

export function beginPrivacyPhotoManualRefresh(
  state: PrivacyPhotoState,
): PrivacyPhotoState {
  return { ...state, automaticRefreshAllowed: false };
}

export function applyPrivacyPhotoRefresh(
  state: PrivacyPhotoState,
  displayUrl: string,
): PrivacyPhotoState {
  return { ...state, displayUrl };
}

export function markPrivacyPhotoLoaded(
  state: PrivacyPhotoState,
): PrivacyPhotoState {
  return { ...state, automaticRefreshAllowed: true };
}
