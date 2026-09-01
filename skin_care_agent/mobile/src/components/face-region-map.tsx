import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { API_BASE_URL } from '@/lib/api';
import { buildFaceRegionOverlaySvg, svgDataUri } from '@/lib/face-analysis-visual';
import type { Size } from '@/lib/face-region-layout';
import type { ObservationRegionGeometry } from '@/lib/observation-quality-api';
import { resolveMediaUrl } from '@/lib/media-url';
import { regionById } from '@/lib/region-catalog';
import type { RegionId } from '@/lib/region-catalog';

type FaceRegionMapProps = {
  photoUri: string;
  sourceSize: Size;
  geometry: readonly ObservationRegionGeometry[];
  selected: readonly RegionId[];
  activeRegion: RegionId | null;
  required?: readonly RegionId[];
  onToggle: (regionId: RegionId) => void;
  disabled?: boolean;
  calloutMode?: 'active' | 'all';
};

export function FaceRegionMap({
  photoUri,
  sourceSize,
  geometry,
  selected,
  activeRegion,
  required = [],
  onToggle,
  disabled = false,
  calloutMode = 'active',
}: FaceRegionMapProps) {
  const [viewportSize, setViewportSize] = useState<Size>({ width: 0, height: 0 });
  const resolvedPhotoUri = useMemo(
    () => resolveMediaUrl(photoUri, API_BASE_URL),
    [photoUri],
  );
  const overlay = useMemo(
    () =>
      viewportSize.width > 0 && viewportSize.height > 0
        ? buildFaceRegionOverlaySvg({
            geometry,
            selected,
            activeRegion,
            sourceSize,
            viewportSize,
            calloutMode,
          })
        : null,
    [activeRegion, calloutMode, geometry, selected, sourceSize, viewportSize],
  );
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewportSize({ width, height });
  };
  return (
    <View
      accessibilityLabel="照片检测区域图"
      onLayout={onLayout}
      style={styles.root}>
      <Image contentFit="cover" source={{ uri: resolvedPhotoUri }} style={StyleSheet.absoluteFill} />
      {overlay ? (
        <Image
          contentFit="fill"
          pointerEvents="none"
          source={{ uri: svgDataUri(overlay.svg) }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {overlay?.hitTargets.map((target) => {
        const locked = required.includes(target.regionId);
        return (
          <Pressable
            accessibilityHint={locked ? '本次任务必检，无法取消' : '切换该区域的检测选择'}
            accessibilityLabel={`${regionById(target.regionId).label}${locked ? '，本次必检' : ''}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: target.selected, disabled: disabled || locked }}
            disabled={disabled}
            key={target.regionId}
            onPress={() => onToggle(target.regionId)}
            style={[
              styles.hitTarget,
              {
                left: target.bounds.x,
                top: target.bounds.y,
                width: target.bounds.width,
                height: target.bounds.height,
              },
            ]}>
            {target.selected ? (
              <View
                style={[
                  styles.check,
                  {
                    left:
                      target.visualBounds.x -
                      target.bounds.x +
                      target.visualBounds.width -
                      9,
                    top: target.visualBounds.y - target.bounds.y - 9,
                  },
                ]}>
                <Text style={styles.checkLabel}>✓</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {overlay?.callouts.map((callout) => (
        <View
          key={callout.regionId}
          pointerEvents="none"
          style={[
            styles.callout,
            callout.active && styles.calloutActive,
            { left: callout.labelPosition.x, top: callout.labelPosition.y },
          ]}>
          <View style={[styles.calloutDot, callout.active && styles.calloutDotActive]} />
          <Text style={styles.calloutLabel}>{callout.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: observationRadii.camera,
    backgroundColor: observationColors.forest,
    overflow: 'hidden',
  },
  hitTarget: { position: 'absolute' },
  check: {
    position: 'absolute',
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: observationColors.scrimText,
    borderRadius: 9,
    backgroundColor: observationColors.sage,
  },
  checkLabel: { color: observationColors.scrimText, fontSize: 10, fontWeight: '800' },
  callout: {
    position: 'absolute',
    width: 72,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.xs,
    borderWidth: 1,
    borderColor: observationColors.overlayBorder,
    borderRadius: observationRadii.sm,
    backgroundColor: observationColors.mapLabelSurface,
    paddingHorizontal: observationSpacing.xs,
  },
  calloutActive: { borderColor: observationColors.sage, borderWidth: 1.5 },
  calloutDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: observationColors.warmLine,
  },
  calloutDotActive: { backgroundColor: observationColors.sage },
  calloutLabel: {
    color: observationColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
