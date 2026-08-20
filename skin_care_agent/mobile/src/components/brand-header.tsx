import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type BrandHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
};

export function BrandHeader({ eyebrow = 'SKIN CARE AGENT', title, description }: BrandHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <View style={styles.markInner} />
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  markInner: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  description: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 440,
  },
});
