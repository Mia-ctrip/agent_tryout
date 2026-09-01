export const colors = {
  brand: '#9BAD50',
  selected: '#9BAD50',
  actionPrimary: '#71813C',
  focus: '#71813C',
  context: '#E8C76A',
  brandOverlay: 'rgba(155,173,80,0.18)',
  background: '#F8F0DD',
  surface: '#FFFDF7',
  surfaceMuted: '#EDF1DF',
  text: '#46502C',
  textMuted: '#7A8069',
  border: '#DED8C6',
  danger: '#6A3E35',
  dangerSoft: '#F2E2D4',
  white: '#FFFDF7',
  scrimTextMuted: 'rgba(255,253,247,0.82)',
  cameraScrim: 'rgba(70,80,44,0.58)',
  cameraScrimStrong: 'rgba(70,80,44,0.72)',
  cameraGuide: 'rgba(255,253,247,0.90)',

  // Compatibility aliases for legacy routes. New code should use the semantic keys above.
  iris: '#9BAD50',
  irisStrong: '#71813C',
  lavender: '#EDF1DF',
  sage: '#EDF1DF',
  amber: '#E8C76A',
  warmGray: '#46502C',
  warmWhite: '#FFFDF7',
  primary: '#71813C',
  primaryPressed: '#46502C',
  primarySoft: '#EDF1DF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  hero: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const maxContentWidth = 560;
