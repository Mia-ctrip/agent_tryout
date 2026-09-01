import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radii, spacing } from '@/constants/theme';
import { productColors } from '@/constants/product-theme';
import { REGIONS } from '@/lib/region-catalog';
import type { RegionId } from '@/lib/region-catalog';

type RegionSelectorProps = {
  selected: readonly RegionId[];
  onChange: (regionIds: RegionId[]) => void;
  disabled?: boolean;
};

export function RegionSelector({
  selected,
  onChange,
  disabled = false,
}: RegionSelectorProps) {
  const selectedSet = new Set(selected);
  return (
    <View accessibilityLabel="固定观察区域" style={styles.list}>
      {REGIONS.map((region) => {
        const active = selectedSet.has(region.id);
        return (
          <Pressable
            accessibilityHint={region.boundary}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            key={region.id}
            onPress={() => {
              const next = active
                ? selected.filter((regionId) => regionId !== region.id)
                : [...selected, region.id];
              onChange(next);
            }}
            style={({ pressed }) => [
              styles.option,
              active && styles.optionSelected,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.checkbox, active && styles.checkboxSelected]}>
              <Text style={styles.checkmark}>{active ? '✓' : ''}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.label}>{region.label}</Text>
              <Text style={styles.boundary}>{region.boundary}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  option: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: productColors.border,
    borderRadius: radii.md,
    backgroundColor: productColors.surface,
    padding: spacing.md,
  },
  optionSelected: { borderColor: productColors.selected, backgroundColor: productColors.surfaceMuted },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: productColors.border,
    borderRadius: 7,
  },
  checkboxSelected: { borderColor: productColors.actionPrimary, backgroundColor: productColors.actionPrimary },
  checkmark: { color: productColors.surface, fontSize: 15, fontWeight: '800' },
  copy: { flex: 1, gap: spacing.xs },
  label: { color: productColors.textPrimary, fontSize: 16, fontWeight: '700' },
  boundary: { color: productColors.textSecondary, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.74 },
});
