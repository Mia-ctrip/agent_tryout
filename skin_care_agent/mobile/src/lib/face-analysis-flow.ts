import type { ObservationTargetStatus } from './observation-api.ts';
import type {
  ObservationQuality,
  ObservationQualityIssue,
} from './observation-quality-api.ts';
import { REGION_IDS, regionById } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';

export const FACE_ANALYSIS_STATUSES = [
  'permission_required',
  'camera_starting',
  'camera_ready',
  'face_not_found',
  'multiple_faces',
  'face_too_far',
  'face_too_close',
  'face_off_angle',
  'poor_lighting',
  'unstable',
  'occluded',
  'ready_to_capture',
  'photo_captured',
  'quality_checking',
  'quality_failed',
  'selecting_regions',
  'confirming_events',
  'analyzing_quality',
  'analyzing_landmarks',
  'analyzing_regions',
  'generating_result',
  'success',
  'error',
] as const;

export type FaceAnalysisStatus = (typeof FACE_ANALYSIS_STATUSES)[number];
export type CaptureGuidanceStatus =
  | 'camera_ready'
  | 'face_not_found'
  | 'multiple_faces'
  | 'face_too_far'
  | 'face_too_close'
  | 'face_off_angle'
  | 'poor_lighting'
  | 'unstable'
  | 'occluded'
  | 'ready_to_capture';
export type FacePhotoSource = 'camera' | 'library';

export type FaceAnalysisState = {
  status: FaceAnalysisStatus;
  clientRequestId: string;
  photoUri: string | null;
  photoSource: FacePhotoSource | null;
  quality: ObservationQuality | null;
  qualityIssue: ObservationQualityIssue | null;
  requiredRegions: RegionId[];
  selectedRegions: RegionId[];
  activeRegion: RegionId | null;
  errorMessage: string | null;
};

export type FaceAnalysisEvent =
  | { type: 'permission_required' }
  | { type: 'permission_granted' }
  | { type: 'camera_started' }
  | { type: 'guidance_changed'; status: CaptureGuidanceStatus }
  | { type: 'photo_captured'; photoUri: string; source: FacePhotoSource }
  | { type: 'quality_check_started' }
  | { type: 'quality_passed'; quality: ObservationQuality }
  | { type: 'quality_failed'; issue: ObservationQualityIssue }
  | { type: 'regions_suggested'; regionIds: RegionId[] }
  | { type: 'region_toggled'; regionId: RegionId }
  | { type: 'event_confirmation_required' }
  | { type: 'event_confirmation_cancelled' }
  | { type: 'analysis_started' }
  | { type: 'analysis_stage_changed'; status: FaceAnalysisStatus }
  | { type: 'analysis_succeeded' }
  | { type: 'analysis_failed'; message: string }
  | { type: 'retry_analysis' }
  | { type: 'retake' };

const ANALYZING = new Set<FaceAnalysisStatus>([
  'analyzing_quality',
  'analyzing_landmarks',
  'analyzing_regions',
  'generating_result',
]);

function orderedRegions(values: readonly RegionId[]): RegionId[] {
  const selected = new Set(values);
  return REGION_IDS.filter((regionId) => selected.has(regionId));
}

export function createFaceAnalysisState(
  clientRequestId: string,
  requiredRegions: readonly RegionId[] = [],
): FaceAnalysisState {
  const required = orderedRegions(requiredRegions);
  return {
    status: 'permission_required',
    clientRequestId,
    photoUri: null,
    photoSource: null,
    quality: null,
    qualityIssue: null,
    requiredRegions: required,
    selectedRegions: required,
    activeRegion: required[0] ?? null,
    errorMessage: null,
  };
}

export function faceAnalysisReducer(
  state: FaceAnalysisState,
  event: FaceAnalysisEvent,
): FaceAnalysisState {
  switch (event.type) {
    case 'permission_required':
      return { ...state, status: 'permission_required' };
    case 'permission_granted':
      return { ...state, status: 'camera_starting', errorMessage: null };
    case 'camera_started':
      return { ...state, status: 'camera_ready' };
    case 'guidance_changed':
      if (state.photoUri !== null || ANALYZING.has(state.status)) return state;
      return { ...state, status: event.status };
    case 'photo_captured':
      if (state.photoUri !== null || ANALYZING.has(state.status)) return state;
      return {
        ...state,
        status: 'photo_captured',
        photoUri: event.photoUri,
        photoSource: event.source,
        quality: null,
        qualityIssue: null,
      };
    case 'quality_check_started':
      if (!state.photoUri || state.status === 'quality_checking') return state;
      return { ...state, status: 'quality_checking', errorMessage: null };
    case 'quality_passed':
      return {
        ...state,
        status: 'selecting_regions',
        quality: event.quality,
        qualityIssue: null,
        selectedRegions: orderedRegions([
          ...state.requiredRegions,
          ...state.selectedRegions,
        ]),
        activeRegion: state.activeRegion ?? state.requiredRegions[0] ?? null,
      };
    case 'quality_failed':
      return {
        ...state,
        status: 'quality_failed',
        qualityIssue: event.issue,
        errorMessage: event.issue.message,
      };
    case 'regions_suggested': {
      if (state.quality !== null || state.photoUri !== null) return state;
      const selectedRegions = orderedRegions(event.regionIds);
      return {
        ...state,
        selectedRegions,
        activeRegion: selectedRegions[0] ?? null,
      };
    }
    case 'region_toggled': {
      if (state.status !== 'selecting_regions') return state;
      if (state.requiredRegions.includes(event.regionId)) {
        return { ...state, activeRegion: event.regionId };
      }
      const isSelected = state.selectedRegions.includes(event.regionId);
      if (isSelected) {
        const selectedRegions = orderedRegions(
          state.selectedRegions.filter((regionId) => regionId !== event.regionId),
        );
        return {
          ...state,
          selectedRegions,
          activeRegion: selectedRegions.at(-1) ?? null,
        };
      }
      return {
        ...state,
        selectedRegions: orderedRegions([...state.selectedRegions, event.regionId]),
        activeRegion: event.regionId,
      };
    }
    case 'event_confirmation_required':
      return { ...state, status: 'confirming_events', errorMessage: null };
    case 'event_confirmation_cancelled':
      return { ...state, status: 'selecting_regions', errorMessage: null };
    case 'analysis_started':
      if (ANALYZING.has(state.status) || state.selectedRegions.length === 0) return state;
      return { ...state, status: 'analyzing_quality', errorMessage: null };
    case 'analysis_stage_changed':
      if (!ANALYZING.has(event.status)) return state;
      return { ...state, status: event.status };
    case 'analysis_succeeded':
      return { ...state, status: 'success', errorMessage: null };
    case 'analysis_failed':
      return { ...state, status: 'error', errorMessage: event.message };
    case 'retry_analysis':
      if (!state.photoUri || state.selectedRegions.length === 0) return state;
      return { ...state, status: 'analyzing_quality', errorMessage: null };
    case 'retake':
      return {
        ...state,
        status: 'camera_ready',
        photoUri: null,
        photoSource: null,
        quality: null,
        qualityIssue: null,
        selectedRegions: state.selectedRegions,
        activeRegion: state.activeRegion,
        errorMessage: null,
      };
  }
}

export function photoRecoveryPrimaryLabel(source: FacePhotoSource | null): string {
  return source === 'library' ? '重新选择照片' : '重新拍摄';
}

export function captureGuidanceCopy(status: CaptureGuidanceStatus): {
  message: string;
  tone: 'neutral' | 'adjust' | 'ready';
} {
  const copy: Record<CaptureGuidanceStatus, { message: string; tone: 'neutral' | 'adjust' | 'ready' }> = {
    camera_ready: { message: '请将脸移入框内', tone: 'neutral' },
    face_not_found: { message: '请将脸移入框内', tone: 'adjust' },
    multiple_faces: { message: '画面中请只保留一张脸', tone: 'adjust' },
    face_too_far: { message: '请靠近一点', tone: 'adjust' },
    face_too_close: { message: '请稍微远离镜头', tone: 'adjust' },
    face_off_angle: { message: '请正视镜头', tone: 'adjust' },
    poor_lighting: { message: '当前光线较暗', tone: 'adjust' },
    unstable: { message: '请保持稳定', tone: 'adjust' },
    occluded: { message: '请移开头发、口罩或手部遮挡', tone: 'adjust' },
    ready_to_capture: { message: '状态良好，可以拍摄', tone: 'ready' },
  };
  return copy[status];
}

export function liveGuidanceFromQuality(
  quality: ObservationQuality,
): CaptureGuidanceStatus {
  if (quality.status === 'passed') return 'ready_to_capture';
  switch (quality.primary_issue?.code) {
    case 'multiple_faces':
      return 'multiple_faces';
    case 'face_too_far':
      return 'face_too_far';
    case 'face_too_close':
      return 'face_too_close';
    case 'face_off_angle':
      return 'face_off_angle';
    case 'poor_lighting':
      return 'poor_lighting';
    case 'blurry':
      return 'unstable';
    case 'occluded':
      return 'occluded';
    case 'face_not_found':
    default:
      return 'face_not_found';
  }
}

export function regionSelectionCta(regionIds: readonly RegionId[]): string {
  if (regionIds.length === 0) return '请选择检测区域';
  if (regionIds.length === 1) return `检测${regionById(regionIds[0]).label}`;
  return `检测 ${regionIds.length} 个区域`;
}

type AnalysisTarget = {
  status: ObservationTargetStatus;
  region_id: RegionId | null;
};

export function analysisStageForTargets(targets: readonly AnalysisTarget[]): {
  status: FaceAnalysisStatus;
  message: string;
  activeRegion: RegionId | null;
} {
  const active = targets.find((target) => target.status === 'processing') ??
    targets.find((target) => target.status === 'queued');
  const completedCount = targets.filter((target) => target.status === 'completed').length;
  if (active && completedCount > 0) {
    return {
      status: 'generating_result',
      message: '正在汇总已完成区域',
      activeRegion: active.region_id,
    };
  }
  if (active?.status === 'processing') {
    return {
      status: 'analyzing_regions',
      message: active.region_id
        ? `正在读取${regionById(active.region_id).label}的皮肤表现`
        : '正在读取皮肤表现',
      activeRegion: active.region_id,
    };
  }
  if (active?.status === 'queued') {
    return {
      status: 'analyzing_landmarks',
      message: active.region_id
        ? `正在定位${regionById(active.region_id).label}`
        : '正在定位面部区域',
      activeRegion: active.region_id,
    };
  }
  if (targets.some((target) => target.status === 'needs_input')) {
    return { status: 'error', message: '部分区域暂时无法完成分析', activeRegion: null };
  }
  return { status: 'success', message: '分析已完成', activeRegion: null };
}
