import type {
  RegionEventDecision,
  RegionEventPreview,
} from './region-event-api.ts';
import { regionById } from './region-catalog.ts';
import type { RegionId } from './region-catalog.ts';

export type RegionEventDecisions = Partial<Record<RegionId, RegionEventDecision>>;

export function choiceRequiredRegions(
  previews: readonly RegionEventPreview[],
): RegionId[] {
  return previews
    .filter(({ action }) => action === 'choice_required')
    .map(({ region_id }) => region_id);
}

export function regionEventDecisionError(
  previews: readonly RegionEventPreview[],
  decisions: RegionEventDecisions,
): string | null {
  for (const regionId of choiceRequiredRegions(previews)) {
    if (!decisions[regionId]) {
      return `请选择${regionById(regionId).label}是继续这段记录，还是开始一段新记录。`;
    }
  }
  return null;
}
