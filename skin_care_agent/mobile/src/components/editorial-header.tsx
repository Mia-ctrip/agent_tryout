import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BotanicalTrace } from '@/components/botanical-trace';
import { EditorialText } from '@/components/editorial-text';
import { colors, spacing } from '@/constants/theme';

type EditorialHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  trace?: 'none' | 'whisper' | 'soft';
};

export function EditorialHeader({
  eyebrow,
  title,
  description,
  action,
  trace = 'none',
}: EditorialHeaderProps) {
  return (
    <View style={styles.root}>
      {trace === 'none' ? null : (
        <BotanicalTrace intensity={trace} kind="leaf-shadow" placement="topRight" />
      )}
      <View style={styles.headingRow}>
        <View style={styles.copy}>
          {eyebrow ? (
            <EditorialText role="metadata" style={styles.eyebrow}>{eyebrow}</EditorialText>
          ) : null}
          <EditorialText accessibilityRole="header" role="pageTitle" style={styles.title}>
            {title}
          </EditorialText>
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {description ? (
        <EditorialText role="body" style={styles.description}>{description}</EditorialText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', gap: spacing.md, overflow: 'hidden' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  copy: { flex: 1, gap: spacing.sm },
  eyebrow: { color: colors.moss },
  title: { color: colors.ink },
  description: { maxWidth: 480, color: colors.textMuted },
  action: { minWidth: 44, minHeight: 44, alignItems: 'flex-end' },
});
