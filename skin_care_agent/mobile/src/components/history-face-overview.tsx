import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { svgDataUri } from '@/lib/face-analysis-visual';
import { buildHistoryFaceSvg, HISTORY_FACE_REGIONS } from '@/lib/history-face-visual';
import {
  historyFaceAccessibilityLabel,
  resolveRegionEntry,
} from '@/lib/history-flow';
import type {
  HistoryRegionVisualState,
  RegionOverviewItem,
} from '@/lib/history-flow';
import type { RegionId } from '@/lib/region-catalog';

type HistoryFaceOverviewProps = {
  regions: readonly RegionOverviewItem[];
  onPressRegion: (regionId: RegionId) => void;
};

function labelStyle(state: HistoryRegionVisualState) {
  return state === 'active' ? styles.labelActive : styles.label;
}

export function HistoryFaceOverview({
  regions,
  onPressRegion,
}: HistoryFaceOverviewProps) {
  const [canvasWidth, setCanvasWidth] = useState(340);
  const scale = canvasWidth / 340;
  const portraitLines = buildHistoryFaceSvg(regions);
  return (
    <View>
      <View
        accessibilityLabel="六个固定面部区域总览"
        onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)}
        style={styles.canvas}>
        <Image
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          contentFit="fill"
          source={{ uri: svgDataUri(portraitLines) }}
          style={StyleSheet.absoluteFill}
        />
        {regions.map((region) => {
          const interactive = resolveRegionEntry(region) !== null;
          const shape = HISTORY_FACE_REGIONS[region.regionId];
          const targetWidth = Math.max(44, shape.width * scale);
          const targetHeight = Math.max(44, shape.height * scale);
          const needsInput = region.pendingRecords.some(
            ({ status }) => status === 'needs_input',
          );
          return (
            <Pressable
              accessibilityLabel={historyFaceAccessibilityLabel(
                region.regionId,
                region.visualState,
                region.pendingRecords,
              )}
              accessibilityRole={interactive ? 'button' : undefined}
              accessibilityState={{ disabled: !interactive }}
              disabled={!interactive}
              key={region.regionId}
              onPress={() => onPressRegion(region.regionId)}
              style={({ pressed }) => [
                styles.region,
                {
                  left: (shape.x + shape.width / 2) * scale - targetWidth / 2,
                  top: (shape.y + shape.height / 2) * scale - targetHeight / 2,
                  width: targetWidth,
                  height: targetHeight,
                },
                pressed && interactive && styles.pressed,
              ]}>
              <Text style={labelStyle(region.visualState)}>{region.label}</Text>
              {region.pendingRecords.length ? (
                <Text
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.statusBadge,
                    needsInput && styles.statusBadgeNeedsInput,
                  ]}>
                  {needsInput ? '补文字' : '整理中'}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendActive]} />
          <Text style={styles.legendLabel}>正在记录</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendHistorical]} />
          <Text style={styles.legendLabel}>历史记录</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendNeutral]} />
          <Text style={styles.legendLabel}>尚无时间点</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, styles.legendPending]} />
          <Text style={styles.legendLabel}>整理中或需补充</Text>
        </View>
      </View>
      <Text style={styles.directionNote}>
        图中左脸颊位于画面右侧、右脸颊位于画面左侧，均指你本人真实左右。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 340 / 366,
    alignSelf: 'center',
    position: 'relative',
    borderRadius: radii.lg,
    backgroundColor: colors.paper,
  },
  region: {
    position: 'absolute',
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  label: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelActive: {
    color: colors.actionPrimary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: -8,
    right: -6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.context,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  statusBadgeNeedsInput: { borderColor: colors.danger, color: colors.danger },
  pressed: { opacity: 0.72 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 14, height: 10, borderWidth: 1, borderRadius: 5 },
  legendActive: { borderColor: colors.actionPrimary, backgroundColor: colors.sageSoft },
  legendHistorical: { borderColor: colors.brand, backgroundColor: colors.paperElevated },
  legendNeutral: { borderColor: colors.border, backgroundColor: 'transparent' },
  legendPending: { borderStyle: 'dashed', borderColor: colors.context },
  legendLabel: { color: colors.textMuted, fontSize: 11 },
  directionNote: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
