import { overlayOpacity } from '../constants/theme.ts';

export type BotanicalTraceKind = 'sprig' | 'leaf-shadow' | 'paper-echo' | 'bokeh';
export type BotanicalTraceIntensity = 'whisper' | 'soft' | 'medium';
export type BotanicalTracePlacement = 'topRight' | 'bottomRight' | 'bottomLeft';
export type QuietNoticeTone = 'neutral' | 'privacy' | 'medical' | 'nonCausal' | 'error';

type BotanicalTraceInput = {
  kind: BotanicalTraceKind;
  intensity?: BotanicalTraceIntensity;
  placement?: BotanicalTracePlacement;
};

export function buildBotanicalTraceModel({
  kind,
  intensity = 'whisper',
  placement = 'bottomRight',
}: BotanicalTraceInput) {
  return {
    kind,
    opacity: overlayOpacity[intensity],
    placement,
    pointerEvents: 'none' as const,
    accessible: false,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };
}

const noticePresentations: Record<
  QuietNoticeTone,
  { symbol: string; accessibilityLabel: string }
> = {
  neutral: { symbol: 'i', accessibilityLabel: '说明' },
  privacy: { symbol: '○', accessibilityLabel: '隐私说明' },
  medical: { symbol: '+', accessibilityLabel: '医疗边界说明' },
  nonCausal: { symbol: '≠', accessibilityLabel: '非因果说明' },
  error: { symbol: '!', accessibilityLabel: '错误提示' },
};

export function quietNoticePresentation(tone: QuietNoticeTone) {
  return noticePresentations[tone];
}
