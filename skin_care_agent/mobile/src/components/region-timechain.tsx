import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrivacyPhotoThumbnail } from '@/components/privacy-photo-thumbnail';
import { colors, radii, spacing } from '@/constants/theme';
import { formatHistoryShortDate } from '@/lib/history-flow';
import type { AuthenticatedRequest } from '@/lib/observation-api';
import type { RegionEventTimepoint } from '@/lib/region-event-api';

type RegionTimechainProps = {
  timepoints: readonly RegionEventTimepoint[];
  selectedTargetId: number | null;
  regionLabel: string;
  request: AuthenticatedRequest;
  onSelect: (targetId: number) => void;
};

export function RegionTimechain({
  timepoints,
  selectedTargetId,
  regionLabel,
  request,
  onSelect,
}: RegionTimechainProps) {
  const [width, setWidth] = useState(350);
  const nodeSize = Math.max(52, Math.min(76, (width - 8) / 5));
  const scrollRef = useRef<ScrollView>(null);
  const scrollToSelected = useCallback(
    (animated: boolean) => {
      const selectedIndex = timepoints.findIndex(
        ({ target }) => target.target_id === selectedTargetId,
      );
      if (selectedIndex < 0) return;
      scrollRef.current?.scrollTo({
        x: Math.max(0, (selectedIndex - 4) * nodeSize),
        animated,
      });
    },
    [selectedTargetId, timepoints, nodeSize],
  );

  useEffect(() => {
    scrollToSelected(true);
  }, [scrollToSelected]);

  return (
    <ScrollView
      accessibilityLabel={`${regionLabel}图片时间链，共 ${timepoints.length} 个时间点`}
      contentContainerStyle={styles.content}
      horizontal
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onContentSizeChange={() => scrollToSelected(false)}
      ref={scrollRef}
      showsHorizontalScrollIndicator={false}>
      {timepoints.length > 1 ? (
        <View
          pointerEvents="none"
          style={[
            styles.line,
            { width: (timepoints.length - 1) * nodeSize, left: 4 + nodeSize / 2, top: 8 + nodeSize + 24 },
          ]}
        />
      ) : null}
      {timepoints.map((timepoint) => {
        const targetId = timepoint.target.target_id;
        const selected = selectedTargetId === targetId;
        const label = `${regionLabel}，${formatHistoryShortDate(timepoint.recorded_local_date)}，${
          timepoint.photo ? '照片预览' : '文字记录'
        }`;
        return (
          <View key={targetId} style={[styles.node, { width: nodeSize }]}>
            {timepoint.photo ? (
              <PrivacyPhotoThumbnail
                accessibilityLabel={label}
                key={`${timepoint.photo.photo_id}-${timepoint.photo.url}`}
                onPress={() => onSelect(targetId)}
                photo={timepoint.photo}
                regionId={timepoint.target.region_id}
                request={request}
                selected={selected}
                size={nodeSize}
              />
            ) : (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onSelect(targetId)}
                style={({ pressed }) => [
                  styles.textNode,
                  { width: nodeSize, height: nodeSize },
                  selected && styles.textNodeSelected,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.textNodeTitle}>文字记录</Text>
                <Text numberOfLines={2} style={styles.textNodeCopy}>
                  {timepoint.target.user_note?.trim() || '信息不足'}
                </Text>
              </Pressable>
            )}
            <View style={styles.stem} />
            <View style={[styles.dotRing, selected && styles.dotRingSelected]}>
              <View style={[styles.dot, selected && styles.dotSelected]} />
            </View>
            <Text style={[styles.date, selected && styles.dateSelected]}>
              {formatHistoryShortDate(timepoint.recorded_local_date)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    minWidth: '100%',
    position: 'relative',
    gap: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  line: {
    position: 'absolute',
    left: spacing.xs + 48,
    top: spacing.sm + 88 + 16 + 10,
    height: 1,
    backgroundColor: colors.moss,
  },
  node: { width: 96, alignItems: 'center' },
  stem: { width: 1, height: 16, backgroundColor: colors.hairline },
  textNode: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  textNodeSelected: { borderWidth: 3, borderColor: colors.actionPrimary },
  textNodeTitle: { color: colors.text, fontSize: 12, fontWeight: '700' },
  textNodeCopy: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  dotRing: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  dotRingSelected: { borderColor: colors.moss },
  dot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.moss },
  dotSelected: { backgroundColor: colors.actionPrimary },
  date: { marginTop: spacing.sm, color: colors.text, fontSize: 12 },
  dateSelected: { color: colors.actionPrimary, fontWeight: '600' },
  pressed: { opacity: 0.72 },
});
