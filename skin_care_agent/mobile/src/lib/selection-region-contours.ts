import { polygonHitBounds } from './face-region-layout.ts';
import type { LayoutPoint } from './face-region-layout.ts';
import type { RegionId } from './region-catalog.ts';

type Command = readonly ['M' | 'C' | 'L' | 'Z', ...number[]];

// Normalized adaptations of the history portrait's six silhouettes, not a
// fixed face mask. Each is fitted to its own detected region in photo space.
const CONTOURS: Record<RegionId, readonly Command[]> = {
  forehead: [
    ['M', .03, .22], ['C', .03, .02, .25, 0, .5, 0], ['C', .75, 0, .97, .02, .97, .22],
    ['C', 1, .5, .8, .56, .68, .65], ['C', .59, .73, .6, 1, .5, 1],
    ['C', .4, 1, .41, .73, .32, .65], ['C', .2, .56, 0, .5, .03, .22], ['Z'],
  ],
  right_face: [
    ['M', .05, .08], ['C', .14, 0, .35, .08, .57, .19], ['C', .85, .31, 1, .35, .98, .53],
    ['C', .96, .75, .7, .96, .48, .99], ['C', .28, 1, .16, .85, .1, .67],
    ['C', .02, .43, 0, .16, .05, .08], ['Z'],
  ],
  left_face: [
    ['M', .95, .08], ['C', .86, 0, .65, .08, .43, .19], ['C', .15, .31, 0, .35, .02, .53],
    ['C', .04, .75, .3, .96, .52, .99], ['C', .72, 1, .84, .85, .9, .67],
    ['C', .98, .43, 1, .16, .95, .08], ['Z'],
  ],
  nose_area: [
    ['M', .5, 0], ['C', .29, 0, .27, .18, .22, .35], ['L', .04, .75],
    ['C', 0, .93, .16, 1, .5, 1], ['C', .84, 1, 1, .93, .96, .75],
    ['L', .78, .35], ['C', .73, .18, .71, 0, .5, 0], ['Z'],
  ],
  mouth_area: [
    ['M', .29, .02], ['C', .14, .04, .02, .26, .01, .47],
    ['C', 0, .82, .23, 1, .5, 1], ['C', .77, 1, 1, .82, .99, .47],
    ['C', .98, .26, .86, .04, .71, .02], ['C', .64, .11, .57, .13, .5, .13],
    ['C', .43, .13, .36, .11, .29, .02], ['Z'],
  ],
  chin: [
    ['M', .13, .08], ['C', .27, 0, .73, 0, .87, .08],
    ['C', 1, .18, .92, .59, .75, .83], ['C', .62, 1, .38, 1, .25, .83],
    ['C', .08, .59, 0, .18, .13, .08], ['Z'],
  ],
};

type MappedRegion = { region_id: RegionId; points: readonly LayoutPoint[] };

export function selectionFaceAxes(regions: readonly MappedRegion[]) {
  const center = (id: RegionId) => {
    const points = regions.find(r => r.region_id === id)?.points;
    if (!points?.length) return null;
    return { x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  };
  const top = center('forehead'), bottom = center('chin');
  if (top && bottom) {
    const length = Math.hypot(bottom.x - top.x, bottom.y - top.y);
    if (length > 1) return { x: { x: (bottom.y - top.y) / length, y: -(bottom.x - top.x) / length },
      y: { x: (bottom.x - top.x) / length, y: (bottom.y - top.y) / length } };
  }
  return { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } };
}

export function buildSelectionContour(region: MappedRegion, axes: ReturnType<typeof selectionFaceAxes>, faceBounds?: { x: number; y: number; width: number; height: number }) {
  const local = region.points.map(p => ({ x: p.x * axes.x.x + p.y * axes.x.y, y: p.x * axes.y.x + p.y * axes.y.y }));
  const box = polygonHitBounds(local, 0);
  const project = (x: number, y: number) => {
    const u = box.x + box.width * (.02 + x * .96);
    const v = box.y + box.height * (.02 + y * .96);
    const point = { x: u * axes.x.x + v * axes.y.x, y: u * axes.x.y + v * axes.y.y };
    // Constrain the entire Bezier control hull, so the curve stays inside the
    // same oval at any viewport size. Leave room for both outline strokes.
    if (region.region_id === 'forehead' && faceBounds) {
      const cx = faceBounds.x + faceBounds.width / 2;
      const cy = faceBounds.y + faceBounds.height / 2;
      const rx = Math.max(1, faceBounds.width * .56 - 7);
      const ry = Math.max(1, faceBounds.height * .53 - 7);
      const distance = Math.hypot((point.x - cx) / rx, (point.y - cy) / ry);
      if (distance > 1) return { x: cx + (point.x - cx) / distance, y: cy + (point.y - cy) / distance };
    }
    return point;
  };
  const corners = [project(0, 0), project(1, 0), project(1, 1), project(0, 1)];
  const path = CONTOURS[region.region_id].map(([command, ...values]) => {
    const coordinates: string[] = [];
    for (let i = 0; i < values.length; i += 2) {
      const p = project(values[i], values[i + 1]);
      coordinates.push(p.x.toFixed(2), p.y.toFixed(2));
    }
    return command + coordinates.join(' ');
  }).join('');
  return { path, bounds: polygonHitBounds(corners, 0) };
}
