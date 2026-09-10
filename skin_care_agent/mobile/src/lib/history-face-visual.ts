import { colors } from '../constants/theme.ts';
import type { HistoryRegionVisualState } from './history-flow.ts';
import type { RegionId } from './region-catalog.ts';

// One 340 × 366 coordinate system for the portrait, region silhouettes and labels.
// Left/right always refer to the user, not the viewer of this illustration.
export const HISTORY_FACE_REGIONS = {
  forehead: {
    path: 'M66 44 C69 21 113 18 170 18 C227 18 271 21 274 44 C280 65 249 69 223 76 C194 84 192 98 190 108 C185 112 180 115 170 115 C160 115 155 112 150 108 C148 98 146 84 117 76 C91 69 60 65 66 44 Z',
    x: 105, y: 32, width: 130, height: 44,
  },
  right_face: {
    path: 'M59 128 C65 119 85 128 106 136 C131 146 147 156 145 178 C143 201 127 227 105 236 C88 243 76 232 68 213 C58 190 52 143 59 128 Z',
    x: 66, y: 151, width: 74, height: 60,
  },
  left_face: {
    path: 'M281 128 C275 119 255 128 234 136 C209 146 193 156 195 178 C197 201 213 227 235 236 C252 243 264 232 272 213 C282 190 288 143 281 128 Z',
    x: 200, y: 151, width: 74, height: 60,
  },
  nose_area: {
    path: 'M170 123 C158 123 155 137 152 153 L145 191 C141 208 151 216 170 216 C189 216 199 208 195 191 L188 153 C185 137 182 123 170 123 Z',
    x: 148, y: 165, width: 44, height: 44,
  },
  mouth_area: {
    path: 'M145 222 C129 224 111 236 109 250 C106 269 133 282 170 282 C207 282 234 269 231 250 C229 236 211 224 195 222 C190 226 181 228 170 228 C159 228 150 226 145 222 Z',
    x: 124, y: 232, width: 92, height: 44,
  },
  chin: {
    path: 'M135 291 C148 286 192 286 205 291 C222 297 211 320 194 329 C180 337 160 337 146 329 C129 320 118 297 135 291 Z',
    x: 134, y: 289, width: 72, height: 44,
  },
} satisfies Record<RegionId, { path: string; x: number; y: number; width: number; height: number }>;

export const HISTORY_FACE_BOUNDARY = 'M44 16 C38 52 48 77 44 112 C42 189 65 252 102 295 C127 325 148 340 170 340 C192 340 213 325 238 295 C275 252 298 189 296 112 C292 77 302 52 296 16';

function statePaint(state: HistoryRegionVisualState) {
  if (state === 'active') return `fill="${colors.sageSoft}" stroke="${colors.actionPrimary}"`;
  if (state === 'historical') return `fill="${colors.paperElevated}" stroke="${colors.brand}"`;
  if (state === 'pending' || state === 'needs_input') {
    return `fill="${colors.surface}" stroke="${colors.context}" stroke-dasharray="4 3"`;
  }
  return `fill="none" stroke="${colors.border}"`;
}

export function buildHistoryFaceSvg(
  regions: readonly { regionId: RegionId; visualState: HistoryRegionVisualState }[],
) {
  const stateById = new Map(regions.map((region) => [region.regionId, region.visualState]));
  const shapes = (Object.keys(HISTORY_FACE_REGIONS) as RegionId[]).map((id) =>
    `<path data-region="${id}" d="${HISTORY_FACE_REGIONS[id].path}" ${statePaint(stateById.get(id) ?? 'neutral')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 366">
    <defs><clipPath id="face-boundary"><path d="${HISTORY_FACE_BOUNDARY} Z"/></clipPath></defs>
    <g clip-path="url(#face-boundary)" stroke-width="1.1" stroke-linejoin="round">${shapes}</g>
    <g fill="none" stroke="${colors.hairline}" stroke-width="1.1" stroke-linecap="round">
      <path d="${HISTORY_FACE_BOUNDARY}"/>
      <path d="M53 40Q41 67 46 106M287 40Q299 67 294 106M46 112C25 65 20 133 38 157L51 179M294 112C315 65 320 133 302 157L289 179M39 120Q22 90 33 135M301 120Q318 90 307 135M100 292Q108 330 93 355M240 292Q232 330 247 355"/>
      <path d="M75 105Q101 124 130 112M74 100Q104 119 132 108M208 112Q239 124 265 105M208 108Q236 119 266 100"/>
      <path d="M80 110l-3 4m11-1-2 5m10-3v5m8-3 1 5m8-5 2 4m128-12 3 4m-11-1 2 5m-10-3v5m-8-3-1 5m-8-5-2 4"/>
    </g>
  </svg>`;
}
