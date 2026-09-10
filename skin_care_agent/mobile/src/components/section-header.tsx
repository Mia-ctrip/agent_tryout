import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { colors, spacing } from '@/constants/theme';

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
};

export function SectionHeader({ title, eyebrow, action }: SectionHeaderProps) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        {eyebrow ? <EditorialText role="metadata" style={styles.eyebrow}>{eyebrow}</EditorialText> : null}
        <EditorialText accessibilityRole="header" role="sectionTitle" style={styles.title}>
          {title}
        </EditorialText>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg },
  copy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.muted },
  title: { color: colors.ink },
  action: { minHeight: 44, justifyContent: 'center' },
});
