import type { AuthenticatedRequest, Observation } from './observation-api.ts';

export const LIFE_CONTEXT_IDS = [
  'sleep',
  'stress',
  'diet',
  'mood',
  'menstrual_cycle',
  'care_change',
] as const;

export type LifeContextId = (typeof LIFE_CONTEXT_IDS)[number];

export const LIFE_CONTEXTS: readonly { id: LifeContextId; label: string }[] = [
  { id: 'sleep', label: '睡眠' },
  { id: 'stress', label: '压力' },
  { id: 'diet', label: '饮食' },
  { id: 'mood', label: '情绪' },
  { id: 'menstrual_cycle', label: '生理期' },
  { id: 'care_change', label: '护理变化' },
] as const;

const LIFE_CONTEXT_ID_SET: ReadonlySet<string> = new Set(LIFE_CONTEXT_IDS);

export function isLifeContextId(value: unknown): value is LifeContextId {
  return typeof value === 'string' && LIFE_CONTEXT_ID_SET.has(value);
}

export function normalizeLifeContextIds(values: readonly unknown[]): LifeContextId[] {
  if (!values.every(isLifeContextId)) {
    throw new Error('包含不支持的生活背景。');
  }
  if (new Set(values).size !== values.length) {
    throw new Error('生活背景不能重复。');
  }
  const selected = new Set(values);
  return LIFE_CONTEXT_IDS.filter((contextId) => selected.has(contextId));
}

export function lifeContextLabel(contextId: LifeContextId): string {
  return LIFE_CONTEXTS.find(({ id }) => id === contextId)!.label;
}

export async function updateObservationLifeContexts(
  request: AuthenticatedRequest,
  observationId: number,
  contextIds: readonly unknown[],
): Promise<Observation> {
  return request<Observation>(`/observations/${observationId}/life-contexts`, {
    method: 'PUT',
    body: JSON.stringify({ context_ids: normalizeLifeContextIds(contextIds) }),
  });
}
