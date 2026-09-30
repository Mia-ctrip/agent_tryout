import type { AuthenticatedRequest } from '@/lib/observation-api.ts';

export type DataExportObservationTarget = {
  scope_type: string;
  region_id: string | null;
  status: string;
  result_source: string | null;
  user_note: string | null;
  facts: Record<string, unknown> | null;
  completed_at: string | null;
};

export type DataExportObservation = {
  observation_id: number;
  recorded_at: string;
  user_note: string | null;
  life_context: string[];
  targets: DataExportObservationTarget[];
};

export type DataExportRegionEvent = {
  region_event_id: number;
  region_id: string;
  status: string;
  started_local_date: string;
  last_valid_local_date: string | null;
  ended_local_date: string | null;
  end_reason: string | null;
};

export type DataExportPersonalProduct = {
  product_id: number;
  name: string;
  standard_product_id: number | null;
  created_at: string;
};

export type DataExportProductUse = {
  product_use_id: number;
  used_at: string;
  note: string | null;
  products: { name_snapshot: string; brand_snapshot: string | null }[];
};

export type DataExportConsent = {
  consent_type: string;
  version: string;
  accepted: boolean;
  accepted_at: string | null;
};

export type DataExportPayload = {
  generated_at: string;
  user: { user_id: number; email: string | null; nickname: string | null; created_at: string };
  consents: DataExportConsent[];
  observations: DataExportObservation[];
  region_events: DataExportRegionEvent[];
  personal_products: DataExportPersonalProduct[];
  product_uses: DataExportProductUse[];
};

export async function fetchDataExport(
  request: AuthenticatedRequest,
): Promise<DataExportPayload> {
  return request<DataExportPayload>('/me/export');
}

export function summarizeDataExport(payload: DataExportPayload): string {
  return [
    `${payload.observations.length} 次观察记录`,
    `${payload.region_events.length} 个区域事件`,
    `${payload.personal_products.length} 件个人产品`,
    `${payload.product_uses.length} 条使用记录`,
  ].join(' · ');
}
