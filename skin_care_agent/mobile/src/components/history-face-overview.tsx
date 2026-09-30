import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { journeyColors } from '@/constants/journey-theme';
import { svgDataUri } from '@/lib/face-analysis-visual';
import { buildHistoryFaceSvg, HISTORY_FACE_REGIONS } from '@/lib/history-face-visual';
import {
  historyFaceAccessibilityLabel,
  resolveRegionEntry,
} from '@/lib/history-flow';
import type { RegionOverviewItem } from '@/lib/history-flow';
import type { RegionId } from '@/lib/region-catalog';

type HistoryFaceOverviewProps = {
  regions: readonly RegionOverviewItem[];
  onPressRegion: (regionId: RegionId) => void;
  selectedRegionId?: RegionId | null;
};

export function HistoryFaceOverview({
  regions,
  onPressRegion,
  selectedRegionId = null,
}: HistoryFaceOverviewProps) {
  const [canvasWidth, setCanvasWidth] = useState(340);
  const [pressedRegion, setPressedRegion] = useState<RegionId | null>(null);
  const [focusedRegion, setFocusedRegion] = useState<RegionId | null>(null);
  // Native maxWidth can clamp width after aspectRatio has computed height.
  // Size both the portrait and its targets from the actual measured width.
  const scale = canvasWidth / 340;
  const highlightedRegion = pressedRegion ?? focusedRegion ?? selectedRegionId;
  const portraitLines = buildHistoryFaceSvg(regions, highlightedRegion);
  return (
    <View>
      <View
        testID="history-face-canvas"
        accessibilityLabel="六个固定面部区域总览，均指你本人真实左右"
        onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)}
        style={[styles.canvas, { height: 366 * scale }]}>
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
          const highlighted = highlightedRegion === region.regionId;
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
              accessibilityRole="button"
              accessibilityHint={interactive ? '查看这个区域的记录' : '选择区域，查看开始记录的入口'}
              accessibilityState={{ selected: selectedRegionId === region.regionId }}
              key={region.regionId}
              onPressIn={() => setPressedRegion(region.regionId)}
              onPressOut={() => setPressedRegion(null)}
              onFocus={() => setFocusedRegion(region.regionId)}
              onBlur={() => setFocusedRegion(null)}
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
              <View style={[styles.labelSurface, highlighted && styles.labelSurfaceSelected]}>
                <Text style={[styles.label, highlighted && styles.labelSelected]}>
                  {region.label}
                </Text>
              </View>
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
      <Text style={styles.hint}>轻触一个区域，查看它的历程</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    position: 'relative',
    borderRadius: radii.lg,
    backgroundColor: 'transparent',
  },
  region: {
    position: 'absolute',
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  labelSurface: {
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: journeyColors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  labelSurfaceSelected: { borderColor: journeyColors.moss },
  labelSelected: { color: journeyColors.moss, fontWeight: '600', textDecorationLine: 'underline' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing.xs },
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
});
