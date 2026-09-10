import { StyleSheet, Text, View } from 'react-native';
import { EditorialText } from '@/components/editorial-text';

import { colors, spacing } from '@/constants/theme';

type BrandHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
};

export function BrandHeader({ eyebrow = 'SKIN CARE AGENT', title, description }: BrandHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <EditorialText role="pageTitle" style={styles.title}>{title}</EditorialText>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
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
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '400',
  },
  description: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 440,
  },
});
