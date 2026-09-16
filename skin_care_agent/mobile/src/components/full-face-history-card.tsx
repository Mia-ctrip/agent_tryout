import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FullObservationPhoto } from '@/components/full-observation-photo';
import { colors, radii, spacing } from '@/constants/theme';
import {
  formatHistoryDateTime,
  type FullFaceHistoryRecord,
} from '@/lib/history-flow';

type FullFaceHistoryCardProps = {
  record: FullFaceHistoryRecord;
  onPress: () => void;
};

export function FullFaceHistoryCard({ record, onPress }: FullFaceHistoryCardProps) {
  const recordedAt = formatHistoryDateTime(
    record.recordedAt,
    record.recordedTimezoneOffsetMinutes,
  );
  return (
    <View style={styles.card}>
      <FullObservationPhoto
        accessibilityLabel={`${recordedAt}完整照片预览`}
        compact
        onPress={onPress}
        photo={record.photo}
        privacyBlur
      />
      <Pressable
        accessibilityHint="打开这次观察的全脸概览"
        accessibilityLabel={`${record.scopeLabel}，${recordedAt}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
        <Text style={styles.time}>{recordedAt}</Text>
        <Text style={styles.scope}>{record.scopeLabel}</Text>
        {record.isLegacyFullFace ? (
          <Text style={styles.legacy}>历史全脸记录 · 沿用原版本展示</Text>
        ) : null}
        <View style={styles.statuses}>
          {record.statuses.map((item) => (
            <Text key={item.targetId} style={styles.status}>
              {item.regionLabel} · {item.statusLabel}
            </Text>
          ))}
        </View>
        <Text style={styles.open}>查看本次概览 ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: spacing.lg,
  },
  copy: { minWidth: 0, flex: 1, gap: spacing.xs, borderRadius: radii.sm },
  pressed: { opacity: 0.7 },
  time: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  scope: { color: colors.earth, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  legacy: { color: colors.context, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  status: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  open: { minHeight: 44, color: colors.actionPrimary, fontSize: 13, lineHeight: 44, fontWeight: '700' },
});
