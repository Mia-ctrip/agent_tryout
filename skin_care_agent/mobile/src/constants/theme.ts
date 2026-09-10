export const colors = {
  ground: '#EFE8D6',
  paper: '#F7F1E1',
  paperElevated: '#FBF6E8',
  sage: '#A9B58F',
  sageSoft: '#C8CFAF',
  moss: '#6D7A54',
  mossDeep: '#4A5638',
  earth: '#3E362B',
  ink: '#2E2A21',
  text: '#46502C',
  textMuted: '#6E6A55',
  muted: '#8A8670',
  hairline: '#D9D2BB',
  hairlineSoft: '#E4DEC8',
  amber: '#C89A45',
  clay: '#8A4D3E',
  claySoft: '#E7D4C4',

  brand: '#A9B58F',
  selected: '#A9B58F',
  actionPrimary: '#4A5638',
  focus: '#6D7A54',
  context: '#C89A45',
  brandOverlay: 'rgba(169,181,143,0.16)',
  background: '#F7F1E1',
  surface: '#FBF6E8',
  surfaceMuted: '#C8CFAF',
  border: '#D9D2BB',
  danger: '#8A4D3E',
  dangerSoft: '#E7D4C4',
  white: '#FBF6E8',
  scrimTextMuted: 'rgba(251,246,232,0.82)',
  cameraScrim: 'rgba(62,54,43,0.58)',
  cameraScrimStrong: 'rgba(62,54,43,0.72)',
  cameraGuide: 'rgba(251,246,232,0.90)',

  // Compatibility aliases for legacy routes. New code should use the semantic keys above.
  iris: '#A9B58F',
  irisStrong: '#4A5638',
  lavender: '#C8CFAF',
  warmGray: '#46502C',
  warmWhite: '#FBF6E8',
  primary: '#4A5638',
  primaryPressed: '#3E362B',
  primarySoft: '#C8CFAF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  hero: 48,
  ritual: 64,
} as const;

export const overlayOpacity = {
  whisper: 0.08,
  soft: 0.16,
  medium: 0.28,
  strong: 0.45,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const maxContentWidth = 560;
