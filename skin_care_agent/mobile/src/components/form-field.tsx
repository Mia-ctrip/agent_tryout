import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type FormFieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, hint, style, ...props },
  ref,
) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={[styles.input, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 16,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
