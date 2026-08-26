import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { LIFE_CONTEXTS } from '@/lib/life-context';
import type { LifeContextId } from '@/lib/life-context';

type LifeContextSelectorProps = {
  selected: readonly LifeContextId[];
  onChange: (selected: LifeContextId[]) => void;
  disabled?: boolean;
};

export function LifeContextSelector({
  selected,
  onChange,
  disabled = false,
}: LifeContextSelectorProps) {
  const selectedSet = new Set(selected);

  return (
    <View accessibilityLabel="生活背景贴纸" style={styles.options}>
      {LIFE_CONTEXTS.map((context) => {
        const active = selectedSet.has(context.id);
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            key={context.id}
            onPress={() =>
              onChange(
                active
                  ? selected.filter((id) => id !== context.id)
                  : [...selected, context.id],
              )
            }
            style={({ pressed }) => [
              styles.option,
              active && styles.optionActive,
              pressed && !disabled && styles.optionPressed,
              disabled && styles.optionDisabled,
            ]}>
            <Text style={[styles.label, active && styles.labelActive]}>
              {context.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionPressed: { opacity: 0.78 },
  optionDisabled: { opacity: 0.55 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  labelActive: { color: colors.irisStrong },
});
