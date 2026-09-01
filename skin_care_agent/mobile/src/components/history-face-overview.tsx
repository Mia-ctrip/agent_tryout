import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
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

function stateStyle(state: HistoryRegionVisualState) {
  if (state === 'active') return styles.regionActive;
  if (state === 'historical') return styles.regionHistorical;
  if (state === 'pending' || state === 'needs_input') return styles.regionPending;
  return styles.regionNeutral;
}

function labelStyle(state: HistoryRegionVisualState) {
  return state === 'active' ? styles.labelActive : styles.label;
}

export function HistoryFaceOverview({
  regions,
  onPressRegion,
}: HistoryFaceOverviewProps) {
  return (
    <View>
      <View
        accessibilityLabel="六个固定面部区域总览"
        style={styles.canvas}>
        <View pointerEvents="none" style={styles.earLeft} />
        <View pointerEvents="none" style={styles.earRight} />
        <View pointerEvents="none" style={styles.faceOutline} />
        <View pointerEvents="none" style={[styles.eye, styles.eyeLeft]} />
        <View pointerEvents="none" style={[styles.eye, styles.eyeRight]} />
        {regions.map((region) => {
          const interactive = resolveRegionEntry(region) !== null;
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
                REGION_POSITION[region.regionId],
                stateStyle(region.visualState),
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
    height: 352,
    alignSelf: 'center',
    position: 'relative',
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  faceOutline: {
    position: 'absolute',
    top: 22,
    left: '14%',
    width: '72%',
    height: 304,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    borderBottomLeftRadius: 108,
    borderBottomRightRadius: 108,
  },
  earLeft: {
    position: 'absolute',
    top: 132,
    left: '9%',
    width: 24,
    height: 64,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.border,
    borderRadius: 18,
  },
  earRight: {
    position: 'absolute',
    top: 132,
    right: '9%',
    width: 24,
    height: 64,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border,
    borderRadius: 18,
  },
  eye: {
    position: 'absolute',
    top: 127,
    width: 44,
    height: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
  },
  eyeLeft: { left: '25%', transform: [{ rotate: '6deg' }] },
  eyeRight: { right: '25%', transform: [{ rotate: '-6deg' }] },
  region: {
    position: 'absolute',
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
  },
  forehead: {
    top: 48,
    left: '24%',
    width: '52%',
    height: 64,
    borderRadius: 44,
  },
  rightFace: {
    top: 146,
    left: '14%',
    width: '29%',
    height: 92,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 38,
    transform: [{ rotate: '6deg' }],
  },
  leftFace: {
    top: 146,
    right: '14%',
    width: '29%',
    height: 92,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 50,
    borderBottomLeftRadius: 38,
    borderBottomRightRadius: 48,
    transform: [{ rotate: '-6deg' }],
  },
  nose: {
    top: 132,
    left: '41%',
    width: '18%',
    height: 82,
    borderRadius: 28,
  },
  mouth: {
    top: 226,
    left: '31%',
    width: '38%',
    height: 58,
    borderRadius: 34,
  },
  chin: {
    top: 286,
    left: '36%',
    width: '28%',
    height: 46,
    borderRadius: 28,
  },
  regionActive: {
    borderColor: colors.actionPrimary,
    backgroundColor: colors.brandOverlay,
  },
  regionHistorical: {
    borderColor: colors.brand,
    backgroundColor: colors.surfaceMuted,
  },
  regionPending: {
    borderStyle: 'dashed',
    borderColor: colors.context,
    backgroundColor: colors.surface,
  },
  regionNeutral: {
    borderColor: colors.border,
    backgroundColor: 'transparent',
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
    fontWeight: '800',
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
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 14, height: 10, borderWidth: 1, borderRadius: 5 },
  legendActive: { borderColor: colors.actionPrimary, backgroundColor: colors.brandOverlay },
  legendHistorical: { borderColor: colors.brand, backgroundColor: colors.surfaceMuted },
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

const REGION_POSITION = {
  forehead: styles.forehead,
  left_face: styles.leftFace,
  right_face: styles.rightFace,
  nose_area: styles.nose,
  mouth_area: styles.mouth,
  chin: styles.chin,
} as const;
