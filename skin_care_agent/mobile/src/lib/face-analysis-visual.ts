import {
  mapNormalizedPolygonToCoverLayout,
  polygonHitBounds,
} from './face-region-layout.ts';
import { observationColors } from '../constants/observation-theme.ts';
import type { LayoutBounds, LayoutPoint, Size } from './face-region-layout.ts';
import type { ObservationRegionGeometry } from './observation-quality-api.ts';
import { REGIONS } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';

export type RegionChoiceItem = {
  id: RegionId;
  label: string;
  accessibilityHint: string;
  selected: boolean;
  locked: boolean;
  badge: '本次必检' | '我想关注' | null;
};

export type RegionHitTarget = {
  regionId: RegionId;
  bounds: LayoutBounds;
  visualBounds: LayoutBounds;
  selected: boolean;
};

export type RegionCallout = {
  regionId: RegionId;
  label: string;
  anchor: LayoutPoint;
  labelPosition: LayoutPoint;
  side: 'left' | 'right';
  active: boolean;
};

export type FaceRegionOverlayModel = {
  svg: string;
  hitTargets: RegionHitTarget[];
  callouts: RegionCallout[];
};

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function midpoint(first: LayoutPoint, second: LayoutPoint): LayoutPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function smoothClosedPath(points: readonly LayoutPoint[]): string {
  if (points.length < 3) return '';
  const start = midpoint(points.at(-1)!, points[0]);
  const commands = points.map((point, index) => {
    const end = midpoint(point, points[(index + 1) % points.length]);
    return `Q${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  });
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)}${commands.join('')}Z`;
}

const REGION_VISUAL_SCALE: Record<RegionId, { x: number; y: number }> = {
  forehead: { x: 0.76, y: 0.7 },
  left_face: { x: 0.7, y: 0.72 },
  right_face: { x: 0.7, y: 0.72 },
  nose_area: { x: 0.74, y: 0.76 },
  mouth_area: { x: 0.8, y: 0.68 },
  chin: { x: 0.76, y: 0.64 },
};

const CALLOUT_LAYOUT: Record<
  RegionId,
  { side: 'left' | 'right'; verticalPosition: number }
> = {
  forehead: { side: 'left', verticalPosition: 0.22 },
  right_face: { side: 'left', verticalPosition: 0.46 },
  mouth_area: { side: 'left', verticalPosition: 0.65 },
  nose_area: { side: 'right', verticalPosition: 0.36 },
  left_face: { side: 'right', verticalPosition: 0.5 },
  chin: { side: 'right', verticalPosition: 0.72 },
};

const CALLOUT_ORDER: readonly RegionId[] = [
  'forehead',
  'right_face',
  'mouth_area',
  'nose_area',
  'left_face',
  'chin',
];

function scalePolygon(
  points: readonly LayoutPoint[],
  regionId: RegionId,
): LayoutPoint[] {
  if (points.length === 0) return [];
  const bounds = polygonHitBounds(points, 0);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const scale = REGION_VISUAL_SCALE[regionId];
  return points.map((point) => ({
    x: centerX + (point.x - centerX) * scale.x,
    y: centerY + (point.y - centerY) * scale.y,
  }));
}

function buildFaceOutline(points: readonly LayoutPoint[]): string {
  if (points.length === 0) return '';
  const bounds = polygonHitBounds(points, 0);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const radiusX = bounds.width * 0.56;
  const radiusY = bounds.height * 0.53;
  return [
    `<ellipse data-role="face-outline" cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" rx="${radiusX.toFixed(2)}" ry="${radiusY.toFixed(2)}" fill="none" stroke="${observationColors.scrimText}" stroke-opacity="0.68" stroke-width="1.25"/>`,
    `<ellipse data-role="face-outline-inner" cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" rx="${Math.max(1, radiusX - 5).toFixed(2)}" ry="${Math.max(1, radiusY - 5).toFixed(2)}" fill="none" stroke="${observationColors.scrimText}" stroke-opacity="0.42" stroke-width="1" stroke-dasharray="3 4"/>`,
  ].join('');
}

export function buildAnalysisGridSvg(width: number, height: number): string {
  const lines: string[] = [];
  for (let x = 28; x < width; x += 28) lines.push(`<path d="M${x} 0V${height}"/>`);
  for (let y = 28; y < height; y += 28) lines.push(`<path d="M0 ${y}H${width}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="${observationColors.gridLine}" stroke-width="0.8">${lines.join('')}</g></svg>`;
}

export function buildRegionChoiceItems(
  selected: readonly RegionId[],
  required: readonly RegionId[],
): RegionChoiceItem[] {
  const selectedSet = new Set(selected);
  const requiredSet = new Set(required);
  return REGIONS.map((region) => {
    const isSelected = selectedSet.has(region.id);
    const locked = requiredSet.has(region.id);
    return {
      id: region.id,
      label: region.label,
      accessibilityHint: region.boundary,
      selected: isSelected,
      locked,
      badge: locked ? '本次必检' : isSelected ? '我想关注' : null,
    };
  });
}

export function buildCameraMaskSvg(width: number, height: number): string {
  const ovalWidth = width * 0.68;
  const ovalHeight = Math.min(height * 0.7, ovalWidth * 1.38);
  const centerX = width / 2;
  const centerY = height * 0.46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="M0 0H${width}V${height}H0Z M${centerX - ovalWidth / 2} ${centerY}a${ovalWidth / 2} ${ovalHeight / 2} 0 1 0 ${ovalWidth} 0a${ovalWidth / 2} ${ovalHeight / 2} 0 1 0 -${ovalWidth} 0" fill="${observationColors.cameraShade}" fill-rule="evenodd"/><ellipse cx="${centerX}" cy="${centerY}" rx="${ovalWidth / 2}" ry="${ovalHeight / 2}" fill="none" stroke="${observationColors.cameraOutline}" stroke-width="1.5"/></svg>`;
}

export function buildFaceRegionOverlaySvg({
  geometry,
  selected,
  activeRegion,
  sourceSize,
  viewportSize,
  calloutMode = 'active',
}: {
  geometry: readonly ObservationRegionGeometry[];
  selected: readonly RegionId[];
  activeRegion: RegionId | null;
  sourceSize: Size;
  viewportSize: Size;
  calloutMode?: 'active' | 'all' | 'none';
}): FaceRegionOverlayModel {
  const selectedSet = new Set(selected);
  const mapped = geometry.map((region) => {
    const hitPoints = mapNormalizedPolygonToCoverLayout(
      region.points,
      sourceSize,
      viewportSize,
    );
    const points = scalePolygon(hitPoints, region.region_id);
    const bounds = polygonHitBounds(hitPoints);
    const visualBounds = polygonHitBounds(points, 0);
    return {
      ...region,
      hitPoints,
      points,
      bounds,
      visualBounds,
      selected: selectedSet.has(region.region_id),
    };
  });
  const callouts = CALLOUT_ORDER.flatMap((regionId) => {
    const region = mapped.find(
      (candidate) =>
        candidate.region_id === regionId &&
        candidate.selected &&
        calloutMode !== 'none' &&
        (calloutMode === 'all' || candidate.region_id === activeRegion),
    );
    if (!region) return [];
    const layout = CALLOUT_LAYOUT[regionId];
    const labelWidth = 72;
    const labelHeight = 34;
    const labelX = layout.side === 'left' ? 10 : viewportSize.width - labelWidth - 10;
    const labelY = Math.min(
      Math.max(viewportSize.height * layout.verticalPosition - labelHeight / 2, 10),
      viewportSize.height - labelHeight - 10,
    );
    return [
      {
        regionId,
        label: REGIONS.find((candidate) => candidate.id === regionId)?.label ?? '',
        side: layout.side,
        active: regionId === activeRegion,
        labelPosition: { x: labelX, y: labelY },
        anchor: {
          x:
            layout.side === 'left'
              ? region.visualBounds.x
              : region.visualBounds.x + region.visualBounds.width,
          y: region.visualBounds.y + region.visualBounds.height / 2,
        },
      },
    ];
  });
  const polygons = mapped
    .map((region) => {
      const selectedStyle = region.selected
        ? `stroke="${observationColors.sage}" stroke-width="2" fill="none"`
        : `stroke="${observationColors.warmLine}" stroke-width="1.5" stroke-dasharray="5 4" fill="none"`;
      return `<path data-region="${region.region_id}" d="${smoothClosedPath(region.points)}" ${selectedStyle} stroke-linejoin="round"/>`;
    })
    .join('');
  const faceOutline = buildFaceOutline(mapped.flatMap((region) => region.hitPoints));
  const calloutLines = callouts
    .map((callout) => {
      const endX = callout.side === 'left' ? callout.labelPosition.x + 72 : callout.labelPosition.x;
      const endY = callout.labelPosition.y + 17;
      const lineColor = callout.active ? observationColors.sage : observationColors.scrimText;
      const lineOpacity = callout.active ? '1' : '0.68';
      return `<line data-callout-region="${callout.regionId}" x1="${callout.anchor.x.toFixed(2)}" y1="${callout.anchor.y.toFixed(2)}" x2="${endX.toFixed(2)}" y2="${endY.toFixed(2)}" stroke="${lineColor}" stroke-opacity="${lineOpacity}" stroke-width="1.2"/>`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${viewportSize.width}" height="${viewportSize.height}" viewBox="0 0 ${viewportSize.width} ${viewportSize.height}">${faceOutline}${polygons}${calloutLines}</svg>`;
  return {
    svg,
    hitTargets: mapped.map((region) => ({
      regionId: region.region_id,
      bounds: region.bounds,
      visualBounds: region.visualBounds,
      selected: region.selected,
    })),
    callouts,
  };
}
