import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { API_BASE_URL } from '@/lib/api';
import { analysisStageForTargets } from '@/lib/face-analysis-flow';
import {
  buildAnalysisGridSvg,
  buildFaceRegionOverlaySvg,
  svgDataUri,
} from '@/lib/face-analysis-visual';
import { resolveMediaUrl } from '@/lib/media-url';
import type { ObservationPhoto, ObservationTarget } from '@/lib/observation-api';
import { regionById } from '@/lib/region-catalog';

type AnalysisScannerProps = {
  photo: ObservationPhoto;
  targets: readonly ObservationTarget[];
};

export function AnalysisScanner({ photo, targets }: AnalysisScannerProps) {
  const reduceMotion = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const pulse = useSharedValue(0.62);
  const stage = analysisStageForTargets(targets);
  const selectedRegions = useMemo(
    () => targets.flatMap((target) => (target.region_id ? [target.region_id] : [])),
    [targets],
  );
  const sourceSize = useMemo(
    () => ({
      width: photo.width ?? Number(photo.quality_meta?.metrics.width ?? 3),
      height: photo.height ?? Number(photo.quality_meta?.metrics.height ?? 4),
    }),
    [photo.height, photo.quality_meta?.metrics.width, photo.quality_meta?.metrics.height, photo.width],
  );
  const overlay = useMemo(
    () =>
      viewport.width > 0 && viewport.height > 0 && photo.quality_meta
        ? buildFaceRegionOverlaySvg({
            geometry: photo.quality_meta.regions,
            selected: selectedRegions,
            activeRegion: stage.activeRegion,
            sourceSize,
            viewportSize: viewport,
            calloutMode: 'none',
          })
        : null,
    [photo.quality_meta, selectedRegions, sourceSize, stage.activeRegion, viewport],
  );
  const grid = useMemo(
    () =>
      viewport.width > 0 && viewport.height > 0
        ? svgDataUri(buildAnalysisGridSvg(viewport.width, viewport.height))
        : null,
    [viewport],
  );
  const photoUrl = useMemo(
    () => resolveMediaUrl(photo.url, API_BASE_URL),
    [photo.url],
  );

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.82;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [pulse, reduceMotion]);

  const gridStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.36 : 0.24 + pulse.value * 0.26,
    transform: [{ scale: reduceMotion ? 1 : 0.996 + pulse.value * 0.008 }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport({ width, height });
  };

  return (
    <View style={styles.root}>
      <View accessibilityLabel="AI 正在扫描本次照片" onLayout={onLayout} style={styles.photoFrame}>
        <Image contentFit="cover" source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} />
        {grid ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, gridStyle]}>
            <Image contentFit="fill" source={{ uri: grid }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        {overlay ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, outlineStyle]}>
            <Image
              contentFit="fill"
              source={{ uri: svgDataUri(overlay.svg) }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
        <View style={styles.completedRow}>
          {targets.map((target) => (
            <View
              key={target.target_id}
              style={[
                styles.regionStatus,
                target.status === 'completed' && styles.regionStatusCompleted,
              ]}>
              <Text style={styles.regionStatusLabel}>
                {target.status === 'completed' ? '✓ ' : ''}
                {target.region_id ? regionById(target.region_id).label : '全脸'}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View accessibilityLiveRegion="polite" style={styles.statusBar}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>{stage.message}</Text>
      </View>
      <Text style={styles.helper}>今日记录已自动保存，可以稍后从历程回来查看。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: observationSpacing.md },
  photoFrame: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: observationRadii.camera,
    backgroundColor: observationColors.forest,
    overflow: 'hidden',
  },
  completedRow: {
    position: 'absolute',
    right: observationSpacing.md,
    bottom: observationSpacing.md,
    left: observationSpacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: observationSpacing.xs,
  },
  regionStatus: {
    borderWidth: 1,
    borderColor: observationColors.overlayBorder,
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.statusShade,
    paddingHorizontal: observationSpacing.sm,
    paddingVertical: observationSpacing.xs,
  },
  regionStatusCompleted: {
    borderColor: observationColors.statusSage,
    backgroundColor: observationColors.completedStatusShade,
  },
  regionStatusLabel: { color: observationColors.scrimText, fontSize: 11, fontWeight: '600' },
  statusBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.sm,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.statusShade,
    paddingHorizontal: observationSpacing.lg,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: observationColors.statusSage },
  statusText: { color: observationColors.scrimText, fontSize: 14, fontWeight: '600' },
  helper: { color: observationColors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
