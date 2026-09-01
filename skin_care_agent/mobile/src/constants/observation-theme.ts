import { colors } from './theme.ts';

export const observationColors = {
  background: colors.background,
  surface: colors.surface,
  surfaceMuted: colors.surfaceMuted,
  text: colors.text,
  textMuted: colors.textMuted,
  forest: colors.text,
  action: colors.actionPrimary,
  sage: colors.brand,
  sageSoft: colors.surfaceMuted,
  warmLine: colors.border,
  portrait: colors.surfaceMuted,
  portraitSoft: colors.surface,
  overlaySurface: 'rgba(255,253,247,0.86)',
  overlayBorder: 'rgba(255,253,247,0.48)',
  guideBorder: 'rgba(255,253,247,0.62)',
  cameraOutline: 'rgba(255,253,247,0.42)',
  gridLine: 'rgba(255,253,247,0.28)',
  cameraPanelBorder: 'rgba(155,173,80,0.78)',
  mapLabelSurface: 'rgba(255,253,247,0.90)',
  cameraShade: 'rgba(70,80,44,0.24)',
  cameraTopBar: 'rgba(70,80,44,0.38)',
  statusShade: 'rgba(70,80,44,0.72)',
  completedStatusShade: 'rgba(70,80,44,0.82)',
  amber: colors.context,
  amberSoft: 'rgba(232,199,106,0.20)',
  error: colors.dangerSoft,
  statusSage: colors.brand,
  border: colors.border,
  scrimText: colors.white,
  shadow: colors.text,
} as const;

export const observationSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

export const observationRadii = {
  sm: 10,
  md: 16,
  lg: 24,
  camera: 28,
} as const;
