import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';

import { spacing } from '@/constants/theme';
import { appButtonPresentation } from '@/lib/app-shell';
import type { AppButtonVariant } from '@/lib/app-shell';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: AppButtonVariant;
  style?: StyleProp<ViewStyle>;
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
  const presentation = appButtonPresentation(variant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: presentation.minHeight,
          borderRadius: presentation.borderRadius,
          backgroundColor: presentation.backgroundColor,
          borderColor: presentation.borderColor,
          borderWidth: presentation.borderColor === 'transparent' ? 0 : 1,
        },
        pressed && !unavailable && styles.pressed,
        unavailable && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={presentation.labelColor} />
      ) : (
        <Text style={[styles.label, { color: presentation.labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
});
