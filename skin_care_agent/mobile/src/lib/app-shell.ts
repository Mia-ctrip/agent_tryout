import { colors, radii, spacing } from '../constants/theme.ts';

export type AppScreenVariant = 'paper' | 'form' | 'camera';
export type AppButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export function appScreenPresentation(variant: AppScreenVariant) {
  if (variant === 'form') {
    return {
      background: colors.paper,
      horizontalPadding: 20,
      verticalPadding: spacing.xl,
      edgeToEdge: false,
      decorationAllowed: false,
    };
  }
  if (variant === 'camera') {
    return {
      background: colors.mossDeep,
      horizontalPadding: 0,
      verticalPadding: 0,
      edgeToEdge: true,
      decorationAllowed: false,
    };
  }
  return {
    background: colors.paper,
    horizontalPadding: spacing.xl,
    verticalPadding: spacing.xxl,
    edgeToEdge: false,
    decorationAllowed: true,
  };
}

export function appButtonPresentation(variant: AppButtonVariant) {
  const base = { minHeight: 52, borderRadius: radii.pill };
  if (variant === 'secondary') {
    return {
      ...base,
      backgroundColor: 'transparent',
      borderColor: colors.moss,
      labelColor: colors.mossDeep,
    };
  }
  if (variant === 'danger') {
    return {
      ...base,
      backgroundColor: 'transparent',
      borderColor: colors.clay,
      labelColor: colors.clay,
    };
  }
  if (variant === 'text') {
    return {
      minHeight: 44,
      borderRadius: radii.pill,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      labelColor: colors.mossDeep,
    };
  }
  return {
    ...base,
    backgroundColor: colors.mossDeep,
    borderColor: colors.mossDeep,
    labelColor: colors.paperElevated,
  };
}
