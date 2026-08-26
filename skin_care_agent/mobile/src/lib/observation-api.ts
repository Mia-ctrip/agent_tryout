import type { RegionId } from './region-catalog.ts';
import type { RegionEventDecision } from './region-event-api.ts';
import type { LifeContextId } from './life-context.ts';

export type ObservationTargetStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'needs_input';

export type ObservationResultSource = 'photo_analysis' | 'user_record';

export type FullFaceObservationFacts = {
  main_locations: string[];
  estimated_amount: string;
  distribution: string;
  coverage: string;
  daily_appearance: string[];
  unknowns: string[];
  summary: string;
};

export type ObservationPhoto = {
  photo_id: number;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  url: string;
  url_expires_at: string;
};

export type ObservationTarget = {
  target_id: number;
  scope_type: 'full_face' | 'region';
  region_id: RegionId | null;
  user_note: string | null;
  status: ObservationTargetStatus;
  result_source: ObservationResultSource | null;
  facts: FullFaceObservationFacts | null;
  completed_at: string | null;
};

export type Observation = {
  observation_id: number;
  client_request_id: string;
  recorded_at: string;
  recorded_timezone_offset_minutes: number | null;
  recorded_local_date: string | null;
  status: 'saved';
  created_at: string;
  life_context_ids: LifeContextId[];
  life_context_completed_at: string | null;
  photo: ObservationPhoto | null;
  targets: ObservationTarget[];
};

export type AuthenticatedRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export type NativePhotoFile = {
  uri: string;
  name: string;
  type: string;
};

export type CreateObservationInput = {
  clientRequestId: string;
  recordedAt: string;
  timezoneOffsetMinutes: number;
  targets: {
    regionId: RegionId;
    userNote?: string;
    eventDecision?: RegionEventDecision;
  }[];
  takenAt?: string;
  file?: NativePhotoFile;
};

export type FormDataLike = {
  append(name: string, value: string | NativePhotoFile): void;
};

export type ListObservationsOptions = {
  limit?: number;
  beforeId?: number;
};

export function buildObservationForm(
  input: CreateObservationInput,
  form: FormDataLike = new FormData() as unknown as FormDataLike,
): FormDataLike {
  form.append('client_request_id', input.clientRequestId);
  form.append('recorded_at', input.recordedAt);
  form.append(
    'recorded_timezone_offset_minutes',
    String(input.timezoneOffsetMinutes),
  );
  form.append(
    'targets_json',
    JSON.stringify(
      input.targets.map((target) => ({
        region_id: target.regionId,
        ...(target.userNote !== undefined ? { user_note: target.userNote } : {}),
        ...(target.eventDecision !== undefined
          ? { event_decision: target.eventDecision }
          : {}),
      })),
    ),
  );
  if (input.takenAt !== undefined) {
    form.append('taken_at', input.takenAt);
  }
  if (input.file !== undefined) {
    form.append('file', input.file);
  }
  return form;
}

export async function createObservation(
  request: AuthenticatedRequest,
  form: FormDataLike,
): Promise<Observation> {
  return request<Observation>('/observations', {
    method: 'POST',
    body: form as unknown as BodyInit,
  });
}

export async function listObservations(
  request: AuthenticatedRequest,
  { limit = 30, beforeId }: ListObservationsOptions = {},
): Promise<Observation[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId !== undefined) {
    params.set('before_id', String(beforeId));
  }
  return request<Observation[]>(`/observations?${params.toString()}`);
}

export async function getObservation(
  request: AuthenticatedRequest,
  observationId: number,
): Promise<Observation> {
  return request<Observation>(`/observations/${observationId}`);
}

export async function updateObservationNote(
  request: AuthenticatedRequest,
  observationId: number,
  targetId: number,
  userNote: string,
): Promise<Observation> {
  return request<Observation>(
    `/observations/${observationId}/targets/${targetId}/note`,
    {
      method: 'PUT',
      body: JSON.stringify({ user_note: userNote }),
    },
  );
}
