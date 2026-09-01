import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';

type ObservationActionBarProps = {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
};

export function ObservationActionBar({
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  primaryLoading = false,
  secondaryLabel,
  onSecondaryPress,
}: ObservationActionBarProps) {
  const insets = useSafeAreaInsets();
  const unavailable = primaryDisabled || primaryLoading;
  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, observationSpacing.md) }]}>
      <Pressable
        accessibilityLabel={primaryLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable, busy: primaryLoading }}
        disabled={unavailable}
        onPress={onPrimaryPress}
        style={({ pressed }) => [
          styles.primary,
          unavailable && styles.disabled,
          pressed && !unavailable && styles.pressed,
        ]}>
        <Text style={styles.primaryLabel}>{primaryLoading ? '请稍候…' : primaryLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondaryPress ? (
        <Pressable
          accessibilityLabel={secondaryLabel}
          accessibilityRole="button"
          onPress={onSecondaryPress}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: observationSpacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: observationColors.border,
    backgroundColor: observationColors.background,
    paddingTop: observationSpacing.md,
    paddingHorizontal: observationSpacing.lg,
    shadowColor: observationColors.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  primary: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.action,
    paddingHorizontal: observationSpacing.xl,
  },
  primaryLabel: { color: observationColors.scrimText, fontSize: 16, fontWeight: '700' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: observationColors.action, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.8 },
});

