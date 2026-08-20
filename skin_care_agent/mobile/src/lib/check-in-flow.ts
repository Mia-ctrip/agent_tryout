export type CheckInViewType = 'front' | 'left' | 'right';

export type CheckInViewSpec = {
  type: CheckInViewType;
  label: string;
  instruction: string;
};

export const CHECK_IN_VIEWS: readonly CheckInViewSpec[] = [
  {
    type: 'front',
    label: '正面',
    instruction: '正对镜头，让额头、两颊和下巴完整落在参考框内。',
  },
  {
    type: 'left',
    label: '左侧',
    instruction: '缓慢向左转头，保持脸部完整并按参考框对齐。',
  },
  {
    type: 'right',
    label: '右侧',
    instruction: '缓慢向右转头，保持脸部完整并按参考框对齐。',
  },
];

const QUALITY_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  image_too_small: '图片分辨率过低，请使用原相机重新拍摄。',
  image_blurry: '照片不够清晰，请保持手机稳定后重拍。',
  lighting_extreme: '光线过暗或过亮，请在均匀光线下重拍。',
  lighting_clipped: '画面存在明显过曝或死黑，请调整光线后重拍。',
  face_not_detected: '没有检测到完整人脸，请正对参考框重拍。',
  multiple_faces: '画面中只能出现一张脸，请单独重新拍摄。',
  face_cut_off: '面部被裁切，请确保额头、两颊和下巴都在画面内。',
  face_too_small: '面部距离镜头太远，请靠近后重新拍摄。',
  head_tilted: '头部倾斜幅度过大，请摆正后重新拍摄。',
  view_angle_mismatch: '拍摄角度与当前视角不符，请按参考姿势重拍。',
};

export function createClientRequestId(
  random: () => number = Math.random,
): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(random() * 16) & 0xf;
    const nibble = token === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function localObservedOn(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CheckInCandidate = {
  check_in_id: number;
  observed_on: string;
  kind: string;
  status: string;
};

export function selectTodayStandardCheckIn<T extends CheckInCandidate>(
  checkIns: readonly T[],
  observedOn: string,
): T | null {
  const todayStandard = checkIns.filter(
    (checkIn) =>
      checkIn.observed_on === observedOn && checkIn.kind === 'standard',
  );
  return (
    todayStandard.find((checkIn) => checkIn.status === 'complete') ??
    todayStandard.find((checkIn) => checkIn.status === 'draft') ??
    null
  );
}

type CheckInPhotoCandidate = {
  view_type: string | null;
};

export function capturedCheckInViews(
  photos: readonly CheckInPhotoCandidate[],
): CheckInViewType[] {
  const captured = new Set(photos.map((photo) => photo.view_type));
  return CHECK_IN_VIEWS.filter((view) => captured.has(view.type)).map(
    (view) => view.type,
  );
}

export function nextIncompleteView(
  capturedViews: readonly CheckInViewType[],
): CheckInViewType | null {
  const captured = new Set(capturedViews);
  return CHECK_IN_VIEWS.find((view) => !captured.has(view.type))?.type ?? null;
}

export function qualityFailureMessage(errorCode: string): string {
  return (
    QUALITY_FAILURE_MESSAGES[errorCode] ??
    '照片未通过质量检查，请按参考框重拍。'
  );
}

export function qualityFailureMessages(detail: unknown): string[] {
  if (
    typeof detail !== 'object' ||
    detail === null ||
    !('errors' in detail) ||
    !Array.isArray(detail.errors)
  ) {
    return [];
  }
  const messages = detail.errors
    .filter((errorCode): errorCode is string => typeof errorCode === 'string')
    .map(qualityFailureMessage);
  return [...new Set(messages)];
}
