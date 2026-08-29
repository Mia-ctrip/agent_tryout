import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import type { Observation } from '@/lib/observation-api';
import { presentObservation } from '@/lib/observation-flow';
import { regionById } from '@/lib/region-catalog';
import { squareThumbnailFrame } from '@/lib/observation-list-layout';

type ObservationListItemProps = {
  observation: Observation;
  onPress: () => void;
};

function recordedAtLabel(recordedAt: string): string {
  return new Date(recordedAt).toLocaleString('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function itemCopy(observation: Observation) {
  const presentation = presentObservation(observation);
  const regionLabels = observation.targets
    .filter((target) => target.scope_type === 'region' && target.region_id)
    .map((target) => regionById(target.region_id!).label);
  const completed = observation.targets.filter((target) => target.status === 'completed').length;
  const needsInput = observation.targets.filter(
    (target) => target.status === 'needs_input',
  ).length;
  const processing = observation.targets.length - completed - needsInput;
  if (regionLabels.length > 0) {
    const statuses = [
      completed > 0 ? `${completed} 个已完成` : null,
      processing > 0 ? `${processing} 个处理中` : null,
      needsInput > 0 ? `${needsInput} 个需要补充` : null,
    ].filter(Boolean);
    return {
      source: regionLabels.join('、'),
      summary: statuses.join('，'),
    };
  }
  if (presentation.kind === 'photo') {
    return {
      source: '全脸照片整理',
      summary: presentation.sections.at(-1)?.value ?? presentation.title,
    };
  }
  if (presentation.kind === 'user') {
    return { source: '用户原文', summary: presentation.note };
  }
  return { source: presentation.title, summary: presentation.body };
}

export function ObservationListItem({
  observation,
  onPress,
}: ObservationListItemProps) {
  const copy = itemCopy(observation);
  return (
    <Pressable
      accessibilityHint="打开这次观察详情"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      {observation.photo ? (
        <View style={styles.thumbnailFrame}>
          <Image
            accessibilityLabel="已遮罩的观察照片缩略图"
            blurRadius={9}
            contentFit="cover"
            source={{ uri: observation.photo.url }}
            style={styles.thumbnail}
          />
          <View pointerEvents="none" style={styles.thumbnailMask} />
        </View>
      ) : (
        <View style={styles.textThumbnail}>
          <Text style={styles.textThumbnailLabel}>文字</Text>
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.time}>{recordedAtLabel(observation.recorded_at)}</Text>
        <Text numberOfLines={2} style={styles.summary}>
          {copy.summary}
        </Text>
        <Text style={styles.source}>{copy.source}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 112,
    flexDirection: 'row',
    gap: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: { opacity: 0.78 },
  thumbnailFrame: {
    ...squareThumbnailFrame(84),
    overflow: 'hidden',
    borderRadius: radii.sm,
    backgroundColor: colors.lavender,
  },
  thumbnail: { width: '100%', height: '100%' },
  thumbnailMask: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(111, 99, 183, 0.18)',
  },
  textThumbnail: {
    width: 84,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    backgroundColor: colors.sage,
  },
  textThumbnailLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  copy: { flex: 1, justifyContent: 'center', gap: spacing.xs },
  time: { color: colors.textMuted, fontSize: 12 },
  summary: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  source: { color: colors.irisStrong, fontSize: 12, fontWeight: '600' },
});
