import type { TextStyle } from 'react-native';

export type TypographyPlatform = 'android' | 'ios' | 'web' | 'default';
export type TypographyRole =
  | 'display'
  | 'pageTitle'
  | 'sectionTitle'
  | 'body'
  | 'caption'
  | 'metadata';

export type Typography = {
  displayFamily: string;
  bodyFamily: string;
  metadataFamily: string;
  display: TextStyle;
  pageTitle: TextStyle;
  sectionTitle: TextStyle;
  body: TextStyle;
  caption: TextStyle;
  metadata: TextStyle;
};

function familiesFor(platform: TypographyPlatform) {
  if (platform === 'android') {
    return { display: 'serif', body: 'sans-serif', metadata: 'sans-serif' };
  }
  if (platform === 'ios') {
    return { display: 'Georgia', body: 'System', metadata: 'System' };
  }
  if (platform === 'web') {
    return { display: 'Georgia, "Noto Serif SC", "Songti SC", SimSun, serif', body: 'system-ui', metadata: 'system-ui' };
  }
  return { display: 'serif', body: 'sans-serif', metadata: 'sans-serif' };
}

export function createTypography(platform: TypographyPlatform): Typography {
  const families = familiesFor(platform);
  return {
    displayFamily: families.display,
    bodyFamily: families.body,
    metadataFamily: families.metadata,
    display: {
      fontFamily: families.display,
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '400',
      letterSpacing: -0.4,
    },
    pageTitle: {
      fontFamily: families.display,
      fontSize: 30,
      lineHeight: 38,
      fontWeight: '400',
      letterSpacing: -0.25,
    },
    sectionTitle: {
      fontFamily: families.display,
      fontSize: 22,
      lineHeight: 30,
      fontWeight: '400',
    },
    body: {
      fontFamily: families.body,
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '400',
    },
    caption: {
      fontFamily: families.body,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '400',
    },
    metadata: {
      fontFamily: families.metadata,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '500',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
  };
}

export function typographyRoleStyle(
  type: Typography,
  role: TypographyRole,
): TextStyle {
  return type[role];
}

export const typography = createTypography('default');
