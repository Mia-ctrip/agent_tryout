import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type InlineNoticeProps = {
  message: string;
  tone?: 'info' | 'error';
};

export function InlineNotice({ message, tone = 'info' }: InlineNoticeProps) {
  return (
    <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[styles.container, tone === 'error' && styles.errorContainer]}>
      <Text accessibilityElementsHidden style={[styles.icon, tone === 'error' && styles.errorText]}>{tone === 'error' ? '!' : 'i'}</Text>
      <Text style={[styles.text, tone === 'error' && styles.errorText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  errorContainer: {
    backgroundColor: colors.dangerSoft,
  },
  text: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
  },
  icon: { color: colors.primary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  errorText: {
    color: colors.danger,
  },
});
