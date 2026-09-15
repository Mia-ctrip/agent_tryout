import type { ObservationPhoto } from './observation-api.ts';
import type { RegionId } from './region-catalog.ts';

/** Display-only square crop in the saved photo's coordinates; never rewrites the photo. */
export function regionPhotoCrop(
  photo: Pick<ObservationPhoto, 'width' | 'height' | 'quality_meta'>,
  regionId: RegionId | null,
  previewSize: number,
) {
  const points = photo.quality_meta?.regions?.find(region => region.region_id === regionId)?.points;
  const width = photo.width ?? Number(photo.quality_meta?.metrics.width);
  const height = photo.height ?? Number(photo.quality_meta?.metrics.height);
  if (!points || points.length < 3 || !Number.isFinite(width) || !Number.isFinite(height) ||
      width <= 0 || height <= 0 || !Number.isFinite(previewSize) || previewSize <= 0 ||
      points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null;

  const left = Math.min(...points.map(point => point.x)) * width;
  const right = Math.max(...points.map(point => point.x)) * width;
  const top = Math.min(...points.map(point => point.y)) * height;
  const bottom = Math.max(...points.map(point => point.y)) * height;
  if (right <= left || bottom <= top) return null;
  // Square cover preview: focus inside the region instead of including adjacent features.
  const size = Math.min(right - left, bottom - top, width, height);
  const x = Math.max(0, Math.min((left + right - size) / 2, width - size));
  const y = Math.max(0, Math.min((top + bottom - size) / 2, height - size));
  const scale = previewSize / size;
  return { width: width * scale, height: height * scale, left: -x * scale, top: -y * scale };
}
