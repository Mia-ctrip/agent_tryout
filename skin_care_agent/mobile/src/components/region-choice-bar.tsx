import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { buildRegionChoiceItems } from '@/lib/face-analysis-visual';
import { hasAllRegions } from '@/lib/region-catalog';
import type { RegionId } from '@/lib/region-catalog';

type RegionChoiceBarProps = {
  selected: readonly RegionId[];
  required?: readonly RegionId[];
  onToggle: (regionId: RegionId) => void;
  onSelectAll: () => void;
  disabled?: boolean;
};

export function RegionChoiceBar({
  selected,
  required = [],
  onToggle,
  onSelectAll,
  disabled = false,
}: RegionChoiceBarProps) {
  const items = buildRegionChoiceItems(selected, required);
  const allSelected = hasAllRegions(selected);
  return (
    <View accessibilityLabel="检测区域文字选项" style={styles.list}>
      <Pressable
        accessibilityHint="一次选择固定的全部六个面部区域"
        accessibilityLabel="全脸，选择全部 6 个区域"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allSelected, disabled }}
        disabled={disabled}
        onPress={onSelectAll}
        style={({ pressed }) => [
          styles.fullFaceOption,
          allSelected && styles.optionSelected,
          pressed && styles.pressed,
        ]}>
        <View style={styles.fullFaceCopy}>
          <Text style={[styles.optionLabel, allSelected && styles.optionLabelSelected]}>
            {allSelected ? '✓ ' : ''}全脸
          </Text>
          <Text style={styles.fullFaceHint}>选择全部 6 个区域</Text>
        </View>
      </Pressable>
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
  fullFaceOption: {
    width: '100%',
    minHeight: 56,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: observationColors.border,
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.surface,
    paddingHorizontal: observationSpacing.md,
    paddingVertical: observationSpacing.sm,
  },
  fullFaceCopy: { gap: 2 },
  fullFaceHint: { color: observationColors.textMuted, fontSize: 12, lineHeight: 18 },
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
