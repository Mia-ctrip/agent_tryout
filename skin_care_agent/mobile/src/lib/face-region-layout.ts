import type { NormalizedPoint } from './observation-quality-api.ts';

export type Size = { width: number; height: number };
export type LayoutPoint = { x: number; y: number };
export type LayoutBounds = LayoutPoint & Size;

export function mapNormalizedPolygonToCoverLayout(
  points: readonly NormalizedPoint[],
  source: Size,
  viewport: Size,
): LayoutPoint[] {
  if (
    source.width <= 0 ||
    source.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return [];
  }
  const scale = Math.max(
    viewport.width / source.width,
    viewport.height / source.height,
  );
  const offsetX = (viewport.width - source.width * scale) / 2;
  const offsetY = (viewport.height - source.height * scale) / 2;
  return points.map((point) => ({
    x: point.x * source.width * scale + offsetX,
    y: point.y * source.height * scale + offsetY,
  }));
}

export function polygonHitBounds(
  points: readonly LayoutPoint[],
  minimumSize = 44,
): LayoutBounds {
  if (points.length === 0) {
    return { x: 0, y: 0, width: minimumSize, height: minimumSize };
  }
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const naturalWidth = maxX - minX;
  const naturalHeight = maxY - minY;
  const width = Math.max(minimumSize, naturalWidth);
  const height = Math.max(minimumSize, naturalHeight);
  return {
    x: minX - (width - naturalWidth) / 2,
    y: minY - (height - naturalHeight) / 2,
    width,
    height,
  };
}

export function polygonPointsAttribute(points: readonly LayoutPoint[]): string {
  return points.map(({ x, y }) => `${x},${y}`).join(' ');
}

