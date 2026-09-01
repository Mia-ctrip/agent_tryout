import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { buildRegionChoiceItems } from '@/lib/face-analysis-visual';
import type { RegionId } from '@/lib/region-catalog';

type RegionChoiceBarProps = {
  selected: readonly RegionId[];
  required?: readonly RegionId[];
  onToggle: (regionId: RegionId) => void;
  disabled?: boolean;
};

export function RegionChoiceBar({
  selected,
  required = [],
  onToggle,
  disabled = false,
}: RegionChoiceBarProps) {
  const items = buildRegionChoiceItems(selected, required);
  return (
    <View accessibilityLabel="检测区域文字选项" style={styles.list}>
      {items.map((item) => (
        <Pressable
          accessibilityHint={
            item.locked ? `${item.accessibilityHint}，本次任务必检，无法取消` : item.accessibilityHint
          }
          accessibilityLabel={`${item.label}${item.badge ? `，${item.badge}` : ''}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.selected, disabled: disabled || item.locked }}
          disabled={disabled}
          key={item.id}
          onPress={() => onToggle(item.id)}
          style={({ pressed }) => [
            styles.option,
            item.selected && styles.optionSelected,
            pressed && !item.locked && styles.pressed,
          ]}>
          <Text style={[styles.optionLabel, item.selected && styles.optionLabelSelected]}>
            {item.selected ? '✓ ' : ''}{item.label}
          </Text>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: observationSpacing.sm },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.surface,
    paddingHorizontal: observationSpacing.md,
    paddingVertical: observationSpacing.sm,
  },
  optionSelected: {
    borderColor: observationColors.sage,
    backgroundColor: observationColors.sageSoft,
  },
  optionLabel: { color: observationColors.text, fontSize: 14, fontWeight: '600' },
  optionLabelSelected: { color: observationColors.forest },
  badge: { color: observationColors.textMuted, fontSize: 10 },
  pressed: { opacity: 0.72 },
});

