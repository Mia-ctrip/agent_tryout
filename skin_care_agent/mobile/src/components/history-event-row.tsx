import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { formatHistoryShortDate } from '@/lib/history-flow';
import type { RegionEvent } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';

type HistoryEventRowProps = {
  event: RegionEvent;
  timepointCount?: number | null;
  compact?: boolean;
  onPress: () => void;
};

export function HistoryEventRow({
  event,
  timepointCount,
  compact = false,
  onPress,
}: HistoryEventRowProps) {
  const region = regionById(event.region_id);
  const detail =
    typeof timepointCount === 'number'
      ? `${timepointCount} 个时间点`
      : `最近记录于 ${formatHistoryShortDate(event.last_valid_local_date)}`;
  return (
    <Pressable
      accessibilityHint="查看这段区域记录的时间链"
      accessibilityLabel={`${region.label}，${
        event.status === 'current' ? '正在记录' : '已结束'
      }，${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        pressed && styles.pressed,
      ]}>
      <View style={styles.marker}>
        <View
          style={[
            styles.markerCore,
            event.status === 'ended' && styles.markerHistorical,
          ]}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{region.label}</Text>
          <Text style={styles.status}>
            {event.status === 'current' ? '正在记录' : '已结束'}
          </Text>
        </View>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  rowCompact: { minHeight: 62, paddingVertical: spacing.sm },
  marker: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  markerCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.actionPrimary,
  },
  markerHistorical: {
    borderWidth: 1,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  copy: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  status: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 13 },
  chevron: { color: colors.actionPrimary, fontSize: 26, lineHeight: 28 },
  pressed: { opacity: 0.68 },
});
