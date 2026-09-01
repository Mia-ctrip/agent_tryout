import type { NativePhotoFile } from './observation-api.ts';
import type { RegionId } from './region-catalog.ts';

export type ObservationQualityIssueCode =
  | 'face_not_found'
  | 'multiple_faces'
  | 'face_too_far'
  | 'face_too_close'
  | 'face_off_angle'
  | 'poor_lighting'
  | 'blurry'
  | 'occluded'
  | 'low_resolution';

export type ObservationQualityIssue = {
  code: ObservationQualityIssueCode;
  message: string;
  region_id?: RegionId | null;
};

export type NormalizedPoint = { x: number; y: number };

export type ObservationRegionGeometry = {
  region_id: RegionId;
  points: NormalizedPoint[];
};

export type ObservationQuality = {
  status: 'passed' | 'failed';
  primary_issue: ObservationQualityIssue | null;
  issues: ObservationQualityIssue[];
  metrics: Record<string, unknown>;
  regions: ObservationRegionGeometry[];
};

export type ObservationQualityForm = {
  append(name: string, value: string | NativePhotoFile): void;
};

export type QualityRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export function buildObservationQualityForm(
  file: NativePhotoFile,
  form: ObservationQualityForm = new FormData() as unknown as ObservationQualityForm,
): ObservationQualityForm {
  form.append('file', file);
  return form;
}

export async function checkObservationPhotoQuality(
  request: QualityRequest,
  form: ObservationQualityForm,
): Promise<ObservationQuality> {
  return request<ObservationQuality>('/observations/photo-quality', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
}

