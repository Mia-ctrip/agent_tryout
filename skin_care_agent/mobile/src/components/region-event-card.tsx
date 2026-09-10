import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import type { RegionEvent } from '@/lib/region-event-api';
import { regionById } from '@/lib/region-catalog';

export function RegionEventCard({
  event,
  onPress,
}: {
  event: RegionEvent;
  onPress: () => void;
}) {
  const region = regionById(event.region_id);
  return (
    <Pressable
      accessibilityHint="查看这段区域记录的全部时间点"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.heading}>
        <Text style={styles.region}>{region.label}</Text>
        <Text style={styles.status}>{event.status === 'current' ? '记录中' : '已结束'}</Text>
      </View>
      <Text style={styles.date}>
        {event.started_local_date} 至 {event.last_valid_local_date}
      </Text>
      <Text style={styles.boundary}>按时间点回看原始证据，不生成区域趋势或疗效结论。</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  region: { color: colors.earth, fontSize: 17, fontWeight: '500' },
  status: { color: colors.irisStrong, fontSize: 13, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12 },
  boundary: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.76 },
});
