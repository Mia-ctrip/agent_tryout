import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { presentTimelineItem } from '@/lib/timeline-flow';
import type { TimelineItem } from '@/lib/timeline-api';

function occurredAtLabel(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TimelineItemCard({
  item,
  onPress,
}: {
  item: TimelineItem;
  onPress?: () => void;
}) {
  const presentation = presentTimelineItem(item);
  const content = (
    <>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{presentation.eyebrow}</Text>
        <Text style={styles.time}>{occurredAtLabel(item.occurred_at)}</Text>
      </View>
      <Text style={styles.title}>{presentation.title}</Text>
      <Text style={styles.detail}>{presentation.detail}</Text>
    </>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.78 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  eyebrow: { flex: 1, color: colors.irisStrong, fontSize: 12, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  detail: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
});
