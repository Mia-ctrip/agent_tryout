import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  observationColors,
  observationSpacing,
} from '@/constants/observation-theme';

type ObservationActionBarProps = {
  layout?: 'stacked' | 'inline';
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
};

export function ObservationActionBar({
  layout = 'stacked',
  primaryLabel,
  onPrimaryPress,
  primaryDisabled = false,
  primaryLoading = false,
  secondaryLabel,
  onSecondaryPress,
}: ObservationActionBarProps) {
  const insets = useSafeAreaInsets();
  const unavailable = primaryDisabled || primaryLoading;
  const secondary = secondaryLabel && onSecondaryPress ? (
    <Pressable
      accessibilityLabel={secondaryLabel}
      accessibilityRole="button"
      onPress={onSecondaryPress}
      style={({ pressed }) => [
        styles.secondary,
        layout === 'inline' && styles.inlineAction,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.secondaryLabel}>{secondaryLabel}</Text>
    </Pressable>
  ) : null;
  return (
    <View
      style={[
        styles.root,
        layout === 'inline' && styles.rootInline,
        { paddingBottom: Math.max(insets.bottom, observationSpacing.md) },
      ]}>
      {layout === 'inline' ? secondary : null}
      <Pressable
        accessibilityLabel={primaryLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: unavailable, busy: primaryLoading }}
        disabled={unavailable}
        onPress={onPrimaryPress}
        style={({ pressed }) => [
          styles.primary,
          layout === 'inline' && styles.inlineAction,
          unavailable && styles.disabled,
          pressed && !unavailable && styles.pressed,
        ]}>
        <Text style={styles.primaryLabel}>{primaryLoading ? '请稍候…' : primaryLabel}</Text>
      </Pressable>
      {layout === 'stacked' ? secondary : null}
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
  },
  rootInline: { flexDirection: 'row', gap: observationSpacing.sm },
  inlineAction: { flex: 1 },
  primary: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: observationColors.action,
    paddingHorizontal: observationSpacing.xl,
  },
  primaryLabel: { color: observationColors.scrimText, fontSize: 16, fontWeight: '700' },
  secondary: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: observationColors.action,
    borderRadius: 999,
    paddingHorizontal: observationSpacing.md,
  },
  secondaryLabel: { color: observationColors.action, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.44 },
  pressed: { opacity: 0.8 },
});
