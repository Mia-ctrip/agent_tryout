import { colors } from '../constants/theme.ts';
import { journeyColors } from '../constants/journey-theme.ts';
import type { HistoryRegionVisualState } from './history-flow.ts';
import type { RegionId } from './region-catalog.ts';

// One 340 × 366 coordinate system for the portrait, region silhouettes and labels.
// Left/right always refer to the user, not the viewer of this illustration.
export const HISTORY_FACE_REGIONS = {
  forehead: {
    path: 'M78 16 C103 9 138 9 170 9 C202 9 237 9 262 16 C270 25 277 39 280 51 C254 46 225 49 204 59 C193 65 183 74 170 75 C157 74 147 65 136 59 C115 49 86 46 60 51 C63 39 70 25 78 16 Z',
    x: 66, y: 10, width: 208, height: 60,
  },
  right_face: {
    path: 'M51 123 C62 117 72 125 88 128 C105 133 118 124 130 130 C144 137 142 152 137 168 C130 191 119 218 106 234 C98 244 86 245 77 237 C59 222 49 194 46 170 C42 150 42 132 51 123 Z',
    x: 44, y: 138, width: 96, height: 72,
  },
  left_face: {
    path: 'M289 123 C278 117 268 125 252 128 C235 133 222 124 210 130 C196 137 198 152 203 168 C210 191 221 218 234 234 C242 244 254 245 263 237 C281 222 291 194 294 170 C298 150 298 132 289 123 Z',
    x: 200, y: 138, width: 96, height: 72,
  },
  nose_area: {
    path: 'M170 111 C159 111 156 127 155 147 C153 167 145 183 139 195 C132 210 145 219 170 219 C195 219 208 210 201 195 C195 183 187 167 185 147 C184 127 181 111 170 111 Z',
    x: 147, y: 152, width: 46, height: 52,
  },
  mouth_area: {
    path: 'M147 229 C130 234 114 245 114 255 C114 268 139 278 170 278 C201 278 226 268 226 255 C226 245 210 234 193 229 C184 233 178 235 170 235 C162 235 156 233 147 229 Z',
    x: 118, y: 215, width: 104, height: 44,
  },
  chin: {
    path: 'M133 287 C143 281 157 284 170 284 C183 284 197 281 207 287 C221 295 213 310 199 320 C181 334 159 334 141 320 C127 310 119 295 133 287 Z',
    x: 124, y: 282, width: 92, height: 46,
  },
} satisfies Record<RegionId, { path: string; x: number; y: number; width: number; height: number }>;

export const HISTORY_FACE_BOUNDARY = 'M72 6 C53 28 42 56 38 85 C33 116 40 159 49 195 C57 230 70 256 92 279 C118 306 145 331 170 331 C195 331 222 306 248 279 C270 256 283 230 291 195 C300 159 307 116 302 85 C298 56 287 28 268 6';

function statePaint(state: HistoryRegionVisualState) {
  if (state === 'active') return `fill="${journeyColors.sage}" stroke="${journeyColors.sage}"`;
  if (state === 'historical') return `fill="${colors.paperElevated}" stroke="${colors.brand}"`;
  if (state === 'pending' || state === 'needs_input') {
    return `fill="${colors.surface}" stroke="${colors.context}" stroke-dasharray="4 3"`;
  }
  return `fill="${colors.hairline}" fill-opacity="0.32" stroke="${colors.hairline}"`;
}

export function buildHistoryFaceSvg(
  regions: readonly { regionId: RegionId; visualState: HistoryRegionVisualState }[],
  highlightedRegion: RegionId | null = null,
) {
  const stateById = new Map(regions.map((region) => [region.regionId, region.visualState]));
  const shapes = (Object.keys(HISTORY_FACE_REGIONS) as RegionId[]).map((id) =>
    `<path data-region="${id}" d="${HISTORY_FACE_REGIONS[id].path}" ${statePaint(stateById.get(id) ?? 'neutral')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 366">
    <defs>
      <clipPath id="face-boundary"><path d="${HISTORY_FACE_BOUNDARY} L268 -8 L72 -8 Z"/></clipPath>
      <linearGradient id="face-paper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${journeyColors.background}"/>
        <stop offset="0.22" stop-color="${colors.paper}"/>
        <stop offset="1" stop-color="${colors.ground}"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#face-boundary)" stroke-width="0.85" stroke-linejoin="round">
      <path d="${HISTORY_FACE_BOUNDARY} L268 -8 L72 -8 Z" fill="url(#face-paper)"/>
      ${shapes}
      ${highlightedRegion ? `<path data-highlight="${highlightedRegion}" d="${HISTORY_FACE_REGIONS[highlightedRegion].path}" fill="${journeyColors.sage}" fill-opacity="0.6" stroke="${journeyColors.moss}" stroke-width="1.5"/>` : ''}
    </g>
    <g fill="none" stroke="${colors.muted}" stroke-opacity="0.65" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round">
      <path d="${HISTORY_FACE_BOUNDARY}" stroke-width="1.15"/>
      <path d="M29 14 C17 42 18 78 34 111 M311 14 C323 42 322 78 306 111"/>
      <path d="M64 17 C48 43 37 72 37 100 M276 17 C292 43 303 72 303 100" stroke-opacity="0.65"/>
      <path d="M36 120 C29 104 22 97 15 101 C3 107 8 136 14 157 C20 180 29 207 41 207 C44 207 46 203 47 199 M304 120 C311 104 318 97 325 101 C337 107 332 136 326 157 C320 180 311 207 299 207 C296 207 294 203 293 199"/>
      <path d="M31 133 C27 115 20 107 17 112 C11 124 22 157 28 172 C31 181 35 187 40 190 M309 133 C313 115 320 107 323 112 C329 124 318 157 312 172 C309 181 305 187 300 190" stroke-opacity="0.75"/>
      <path d="M25 126 C32 134 29 145 35 151 C39 157 33 166 36 174 M315 126 C308 134 311 145 305 151 C301 157 307 166 304 174" stroke-opacity="0.5"/>
      <path d="M89 277 C91 308 90 339 77 355 M251 277 C249 308 250 339 263 355"/>
      <path d="M54 76 C67 54 92 54 126 65 C133 67 137 72 140 78 M54 76 C74 59 104 66 137 80 M200 78 C203 72 207 67 214 65 C248 54 273 54 286 76 M203 80 C236 66 266 59 286 76"/>
      <path d="M58 89 C59 102 66 112 79 117 C96 124 112 116 125 118 M215 118 C228 116 244 124 261 117 C274 112 281 102 282 89" stroke-opacity="0.6"/>
      <path d="M64 108 C79 126 96 125 113 121 M227 121 C244 125 261 126 276 108"/>
      <path d="M140 86 C151 100 156 122 154 143 M200 86 C189 100 184 122 186 143" stroke-opacity="0.38"/>
      <path d="M154 143 C153 165 144 184 138 196 C131 209 140 212 147 213 M186 143 C187 165 196 184 202 196 C209 209 200 212 193 213"/>
      <path d="M147 207 C153 202 159 207 162 211 M178 211 C181 207 187 202 193 207"/>
      <path d="M162 212 C166 216 174 216 178 212" stroke-opacity="0.45"/>
      <path d="M120 255 C132 253 142 245 152 245 C160 244 164 249 170 249 C176 249 180 244 188 245 C198 245 208 253 220 255 M120 255 C136 270 153 276 170 276 C187 276 204 270 220 255" stroke-opacity="0.65"/>
      <path d="M120 255 C138 258 145 253 155 255 C161 255 165 258 170 258 C175 258 179 255 185 255 C195 253 202 258 220 255"/>
    </g>
  </svg>`;
}
