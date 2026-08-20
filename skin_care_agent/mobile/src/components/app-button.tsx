import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'text';
  style?: ViewStyle;
};

export function AppButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
}: AppButtonProps) {
  const unavailable = disabled || loading;
  const labelStyle =
    variant === 'primary'
      ? styles.primaryLabel
      : variant === 'secondary'
        ? styles.secondaryLabel
        : styles.textLabel;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.white : colors.primary} />
      ) : (
        <Text style={[styles.label, labelStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.primarySoft,
  },
  text: {
    minHeight: 44,
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
  primaryLabel: {
    color: colors.white,
  },
  secondaryLabel: {
    color: colors.primary,
  },
  textLabel: {
    color: colors.primary,
  },
});
