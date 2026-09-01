export const REGION_IDS = [
  'forehead',
  'left_face',
  'right_face',
  'nose_area',
  'mouth_area',
  'chin',
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export type RegionDefinition = {
  id: RegionId;
  label: string;
  boundary: string;
};

export const REGIONS: readonly RegionDefinition[] = [
  { id: 'forehead', label: '额头', boundary: '面部中央上方的额头区域' },
  {
    id: 'left_face',
    label: '左脸颊',
    boundary: '用户本人真实左侧；自拍预览是否镜像都不改变这个方向',
  },
  {
    id: 'right_face',
    label: '右脸颊',
    boundary: '用户本人真实右侧；自拍预览是否镜像都不改变这个方向',
  },
  { id: 'nose_area', label: '鼻周', boundary: '鼻部及紧邻鼻翼范围' },
  { id: 'mouth_area', label: '口周', boundary: '嘴唇、嘴角及周围范围' },
  { id: 'chin', label: '下巴', boundary: '下唇下方至下巴下缘中央' },
] as const;

const REGION_ID_SET: ReadonlySet<string> = new Set(REGION_IDS);

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && REGION_ID_SET.has(value);
}

export function normalizeRegionIds(values: readonly unknown[]): RegionId[] {
  if (values.length < 1 || values.length > REGION_IDS.length) {
    throw new Error('请选择一到六个区域。');
  }
  if (!values.every(isRegionId)) {
    throw new Error('包含不支持的区域。');
  }
  if (new Set(values).size !== values.length) {
    throw new Error('区域不能重复。');
  }
  const selected = new Set(values);
  return REGION_IDS.filter((regionId) => selected.has(regionId));
}

export function regionById(regionId: RegionId): RegionDefinition {
  return REGIONS.find(({ id }) => id === regionId)!;
}
