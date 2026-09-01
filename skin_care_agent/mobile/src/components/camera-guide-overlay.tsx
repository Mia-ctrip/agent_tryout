import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import {
  observationColors,
  observationRadii,
  observationSpacing,
} from '@/constants/observation-theme';
import { captureGuidanceCopy } from '@/lib/face-analysis-flow';
import type { CaptureGuidanceStatus } from '@/lib/face-analysis-flow';
import { buildCameraMaskSvg, svgDataUri } from '@/lib/face-analysis-visual';

type CameraGuideOverlayProps = {
  status: CaptureGuidanceStatus;
};

export function CameraGuideOverlay({ status }: CameraGuideOverlayProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const guidance = captureGuidanceCopy(status);
  const maskUri = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? svgDataUri(buildCameraMaskSvg(size.width, size.height))
        : null,
    [size],
  );
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };
  return (
    <View onLayout={onLayout} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {maskUri ? (
        <Image contentFit="fill" source={{ uri: maskUri }} style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={[
          styles.oval,
          guidance.tone === 'adjust' && styles.ovalAdjust,
          guidance.tone === 'ready' && styles.ovalReady,
        ]}
      />
      <View accessibilityLiveRegion="polite" style={styles.statusBar}>
        <View
          style={[
            styles.statusDot,
            guidance.tone === 'adjust' && styles.statusDotAdjust,
            guidance.tone === 'ready' && styles.statusDotReady,
          ]}
        />
        <Text style={styles.statusText}>{guidance.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  oval: {
    position: 'absolute',
    left: '16%',
    top: '11%',
    width: '68%',
    height: '66%',
    borderWidth: 1.5,
    borderColor: observationColors.guideBorder,
    borderRadius: 999,
  },
  ovalAdjust: { borderColor: observationColors.amber },
  ovalReady: { borderColor: observationColors.statusSage, borderWidth: 2 },
  statusBar: {
    position: 'absolute',
    right: observationSpacing.lg,
    bottom: observationSpacing.lg,
    left: observationSpacing.lg,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: observationSpacing.sm,
    borderRadius: observationRadii.md,
    backgroundColor: observationColors.statusShade,
    paddingHorizontal: observationSpacing.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: observationColors.warmLine,
  },
  statusDotAdjust: { backgroundColor: observationColors.amber },
  statusDotReady: { backgroundColor: observationColors.statusSage },
  statusText: { color: observationColors.scrimText, fontSize: 14, fontWeight: '600' },
});
