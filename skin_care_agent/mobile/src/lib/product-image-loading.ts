import { resolveMediaUrl } from './media-url.ts';

export type ProductImageSource = {
  image_url: string | null;
  image_expires_at: string | null;
};

type ImageSnapshot = {
  uri: string | null;
  expiresAt: string | null;
  phase: 'missing' | 'loading' | 'ready' | 'error';
  attempt: number;
};

export function productImageRefreshDelay(expiresAt: string | null, now = Date.now()): number | null {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expiry) ? Math.max(0, expiry - now) : null;
}

/** One automatic re-sign per failed load; manual retries remain available. */
export function createProductImageLoader(
  source: ProductImageSource,
  apiBaseUrl: string,
  refreshSource?: () => Promise<ProductImageSource>,
  onChange: (value: ImageSnapshot) => void = () => {},
) {
  let state: ImageSnapshot = {
    uri: source.image_url ? resolveMediaUrl(source.image_url, apiBaseUrl) : null,
    expiresAt: source.image_expires_at,
    phase: source.image_url ? 'loading' : 'missing',
    attempt: 0,
  };
  let disposed = false;
  let refreshing = false;
  let automaticAttempted = false;
  const update = (patch: Partial<ImageSnapshot>) => {
    if (disposed) return;
    state = { ...state, ...patch };
    onChange(state);
  };
  const refresh = async (automatic: boolean) => {
    if (disposed || refreshing) return;
    if (automatic && (automaticAttempted || !refreshSource)) {
      update({ phase: 'error' });
      return;
    }
    automaticAttempted = true;
    refreshing = true;
    update({ phase: 'loading' });
    try {
      const fresh = refreshSource ? await refreshSource() : source;
      if (fresh.image_url && productImageRefreshDelay(fresh.image_expires_at) === 0) {
        throw new Error('Image signature is already expired');
      }
      update({
        uri: fresh.image_url ? resolveMediaUrl(fresh.image_url, apiBaseUrl) : null,
        expiresAt: fresh.image_expires_at,
        phase: fresh.image_url ? 'loading' : 'missing',
        attempt: state.attempt + 1,
      });
    } catch {
      update({ phase: 'error' });
    } finally {
      refreshing = false;
    }
  };
  return {
    current: () => state,
    loaded(attempt: number) {
      if (disposed || refreshing || attempt !== state.attempt) return;
      automaticAttempted = false;
      update({ phase: 'ready' });
    },
    failed(attempt: number) {
      if (attempt !== state.attempt) return Promise.resolve();
      return refresh(true);
    },
    retry: () => refresh(false),
    dispose() { disposed = true; },
  };
}
