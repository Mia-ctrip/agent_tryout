import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';
import { regionPhotoCrop } from '@/lib/region-photo-crop';
import type { RegionId } from '@/lib/region-catalog';
import {
  refreshObservationPhotoUrl,
  type AuthenticatedRequest,
  type ObservationPhoto,
} from '@/lib/observation-api';
import {
  applyPrivacyPhotoRefresh,
  beginPrivacyPhotoAutomaticRefresh,
  beginPrivacyPhotoManualRefresh,
  createPrivacyPhotoState,
  markPrivacyPhotoLoaded,
} from '@/lib/privacy-photo-flow';

type PrivacyPhotoThumbnailProps = {
  photo: ObservationPhoto;
  regionId: RegionId | null;
  request: AuthenticatedRequest;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

export function PrivacyPhotoThumbnail({
  photo,
  regionId,
  request,
  selected,
  accessibilityLabel,
  onPress,
}: PrivacyPhotoThumbnailProps) {
  const [photoState, setPhotoState] = useState(() =>
    createPrivacyPhotoState(photo.photo_id, photo.url),
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshingRef = useRef(false);
  const crop = regionPhotoCrop(photo, regionId, 80);

  const resolvedUrl = useMemo(
    () => resolveMediaUrl(photoState.displayUrl, API_BASE_URL),
    [photoState.displayUrl],
  );

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setPhase('loading');
    try {
      const signed = await refreshObservationPhotoUrl(request, photo.photo_id);
      setPhotoState((current) => applyPrivacyPhotoRefresh(current, signed.url));
      setRefreshVersion((value) => value + 1);
    } catch {
      setPhase('error');
    } finally {
      refreshingRef.current = false;
    }
  }, [photo.photo_id, request]);

  const handlePress = () => {
    onPress();
    if (phase === 'error') {
      setPhotoState((current) => beginPrivacyPhotoManualRefresh(current));
      void refresh();
    }
  };

  const handleImageError = () => {
    const attempt = beginPrivacyPhotoAutomaticRefresh(photoState);
    setPhotoState(attempt.state);
    if (attempt.shouldRefresh) {
      void refresh();
      return;
    }
    setPhase('error');
  };

  return (
    <Pressable
      accessibilityHint={
        phase === 'error' ? '选择此时间点并重新加载照片' : '选择此时间点'
      }
      accessibilityLabel={`${accessibilityLabel}，${crop ? '区域局部' : '原图预览，缺少区域定位'}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.frame,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.viewport} testID={crop ? 'region-photo-crop' : 'region-photo-original'}>
        <Image
          accessibilityElementsHidden
          blurRadius={crop ? 0 : 10}
          cachePolicy="memory-disk"
          contentFit={crop ? 'fill' : 'cover'}
          onError={handleImageError}
          onLoad={() => {
            setPhotoState((current) => markPrivacyPhotoLoaded(current));
            setPhase('ready');
          }}
          onLoadStart={() => setPhase('loading')}
          recyclingKey={`${photo.photo_id}-${refreshVersion}-${photoState.sourceUrl}`}
          source={{ uri: resolvedUrl }}
          style={crop ? [styles.croppedImage, crop] : styles.image}
          transition={0}
        />
        {!crop ? (
          <View pointerEvents="none" style={styles.originalLabel}>
            <Text style={styles.originalText}>原图预览</Text>
          </View>
        ) : null}
        {phase === 'loading' ? (
          <View pointerEvents="none" style={styles.centered}>
            <ActivityIndicator color={colors.actionPrimary} size="small" />
          </View>
        ) : null}
        {phase === 'error' ? (
          <View pointerEvents="none" style={[styles.centered, styles.errorSurface]}>
            <Text style={styles.errorText}>照片暂不可用</Text>
            <Text style={styles.retryText}>点按重试</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  selected: {
    borderColor: colors.actionPrimary,
  },
  pressed: { opacity: 0.74 },
  image: { width: '100%', height: '100%' },
  viewport: { width: 80, height: 80, overflow: 'hidden', borderRadius: radii.sm, backgroundColor: colors.surfaceMuted },
  croppedImage: { position: 'absolute' },
  originalLabel: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  originalText: { color: colors.textMuted, fontSize: 10 },
  centered: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorSurface: { backgroundColor: colors.surfaceMuted, padding: spacing.xs },
  errorText: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  retryText: { marginTop: 2, color: colors.actionPrimary, fontSize: 10, textAlign: 'center' },
});
