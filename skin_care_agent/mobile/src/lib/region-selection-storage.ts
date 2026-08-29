import { normalizeRegionIds } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';

const LAST_REGION_SELECTION_KEY = 'skin-care-agent.last-region-selection';

export type RegionSelectionStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

async function defaultStorage(): Promise<RegionSelectionStorage> {
  return import('expo-secure-store');
}

export async function loadLastRegionSelection(
  storage?: RegionSelectionStorage,
): Promise<RegionId[]> {
  try {
    const resolvedStorage = storage ?? (await defaultStorage());
    const raw = await resolvedStorage.getItemAsync(LAST_REGION_SELECTION_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    return normalizeRegionIds(parsed);
  } catch {
    return [];
  }
}

export async function saveLastRegionSelection(
  regionIds: readonly RegionId[],
  storage?: RegionSelectionStorage,
): Promise<void> {
  const resolvedStorage = storage ?? (await defaultStorage());
  await resolvedStorage.setItemAsync(
    LAST_REGION_SELECTION_KEY,
    JSON.stringify(normalizeRegionIds(regionIds)),
  );
}
