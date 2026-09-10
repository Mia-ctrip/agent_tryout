import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { colors, radii, spacing } from '@/constants/theme';
import { quietNoticePresentation } from '@/lib/quiet-visuals';
import type { QuietNoticeTone } from '@/lib/quiet-visuals';

type QuietNoticeProps = {
  tone: QuietNoticeTone;
  title?: string;
  children: ReactNode;
};

export function QuietNotice({ tone, title, children }: QuietNoticeProps) {
  const presentation = quietNoticePresentation(tone);
  return (
    <View
      accessibilityLabel={presentation.accessibilityLabel}
      style={[styles.root, tone === 'error' && styles.error]}>
      <View style={[styles.symbol, tone === 'error' && styles.errorSymbol]}>
        <Text style={[styles.symbolText, tone === 'error' && styles.errorSymbolText]}>
          {presentation.symbol}
        </Text>
      </View>
      <View style={styles.copy}>
        {title ? <EditorialText role="sectionTitle" style={styles.title}>{title}</EditorialText> : null}
        <EditorialText role="caption" style={styles.body}>{children}</EditorialText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.md,
    backgroundColor: colors.paperElevated,
    padding: spacing.lg,
  },
  error: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  symbol: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.moss,
    borderRadius: radii.pill,
  },
  errorSymbol: { borderColor: colors.clay },
  symbolText: { color: colors.mossDeep, fontSize: 13, fontWeight: '700' },
  errorSymbolText: { color: colors.clay },
  copy: { flex: 1, gap: spacing.xs },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  body: { color: colors.textMuted },
});
