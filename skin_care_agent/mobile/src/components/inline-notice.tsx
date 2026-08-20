import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type InlineNoticeProps = {
  message: string;
  tone?: 'info' | 'error';
};

export function InlineNotice({ message, tone = 'info' }: InlineNoticeProps) {
  return (
    <View style={[styles.container, tone === 'error' && styles.errorContainer]}>
      <Text style={[styles.text, tone === 'error' && styles.errorText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  errorContainer: {
    backgroundColor: colors.dangerSoft,
  },
  text: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
  },
});
