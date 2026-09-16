import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media-url';
import {
  refreshObservationPhotoUrl,
  type ObservationPhoto,
} from '@/lib/observation-api';
import {
  applyPrivacyPhotoRefresh,
  beginPrivacyPhotoAutomaticRefresh,
  beginPrivacyPhotoManualRefresh,
  createPrivacyPhotoState,
  markPrivacyPhotoLoaded,
  syncPrivacyPhotoSource,
} from '@/lib/privacy-photo-flow';
import { useSession } from '@/providers/session-provider';

type FullObservationPhotoProps = {
  photo: ObservationPhoto;
  accessibilityLabel: string;
  privacyBlur?: boolean;
  compact?: boolean;
  onPress?: () => void;
};

export function FullObservationPhoto({
  photo,
  accessibilityLabel,
  privacyBlur = false,
  compact = false,
  onPress,
}: FullObservationPhotoProps) {
  const { request } = useSession();
  const [photoState, setPhotoState] = useState(() =>
    createPrivacyPhotoState(photo.photo_id, photo.url),
  );
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refreshing = useRef(false);

  const activePhotoState =
    photoState.photoId === photo.photo_id && photoState.sourceUrl === photo.url
      ? photoState
      : createPrivacyPhotoState(photo.photo_id, photo.url);

  const resolvedUrl = useMemo(
    () => resolveMediaUrl(activePhotoState.displayUrl, API_BASE_URL),
    [activePhotoState.displayUrl],
  );
  const aspectRatio = useMemo(() => {
    if (!photo.width || !photo.height) return 0.78;
    return Math.min(1.2, Math.max(0.62, photo.width / photo.height));
  }, [photo.height, photo.width]);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setPhase('loading');
    try {
      const signed = await refreshObservationPhotoUrl(request, photo.photo_id);
      setPhotoState(current => applyPrivacyPhotoRefresh(
        syncPrivacyPhotoSource(current, photo.photo_id, photo.url), signed.url,
      ));
      setRefreshVersion(value => value + 1);
    } catch {
      setPhase('error');
    } finally {
      refreshing.current = false;
    }
  }, [photo.photo_id, photo.url, request]);

  const handleImageError = () => {
    const attempt = beginPrivacyPhotoAutomaticRefresh(activePhotoState);
    setPhotoState(attempt.state);
    if (attempt.shouldRefresh) void refresh();
    else setPhase('error');
  };

  const handlePress = () => {
    if (phase === 'error') {
      setPhotoState(beginPrivacyPhotoManualRefresh(activePhotoState));
      void refresh();
      return;
    }
    onPress?.();
  };

  return (
    <Pressable
      accessibilityHint={phase === 'error' ? '重新加载完整照片' : onPress ? '打开这次观察' : undefined}
      accessibilityLabel={`${accessibilityLabel}${phase === 'error' ? '，照片暂不可用' : ''}`}
      accessibilityRole={onPress || phase === 'error' ? 'button' : 'image'}
      onPress={handlePress}
      style={({ pressed }) => [styles.frame, compact && styles.compactFrame, pressed && styles.pressed]}>
      <View style={[styles.viewport, compact && styles.compactViewport, { aspectRatio }]}>
        <Image
          key={`${photo.photo_id}-${refreshVersion}-${activePhotoState.displayUrl}`}
          accessibilityElementsHidden
          blurRadius={privacyBlur ? 10 : 0}
          cachePolicy="memory-disk"
          contentFit="contain"
          onError={handleImageError}
          onLoad={() => {
            setPhotoState(markPrivacyPhotoLoaded(activePhotoState));
            setPhase('ready');
          }}
          onLoadStart={() => setPhase('loading')}
          recyclingKey={`${photo.photo_id}-${activePhotoState.displayUrl}`}
          source={{ uri: resolvedUrl }}
          style={StyleSheet.absoluteFill}
          transition={0}
        />
        {privacyBlur ? <View pointerEvents="none" style={styles.privacyMask} /> : null}
        {phase === 'loading' ? (
          <View pointerEvents="none" style={styles.centered}>
            <ActivityIndicator color={colors.actionPrimary} size="small" />
          </View>
        ) : null}
        {phase === 'error' ? (
          <View pointerEvents="none" style={[styles.centered, styles.errorSurface]}>
            <Text style={styles.errorTitle}>照片暂不可用</Text>
            <Text style={styles.errorHint}>点按重新加载</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  compactFrame: { width: 116, flexShrink: 0, borderRadius: radii.md },
  pressed: { opacity: 0.76 },
  viewport: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.paper,
  },
  compactViewport: { borderRadius: radii.sm },
  privacyMask: { ...StyleSheet.absoluteFill, backgroundColor: colors.brandOverlay },
  centered: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  errorSurface: { backgroundColor: colors.surfaceMuted },
  errorTitle: { color: colors.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  errorHint: { marginTop: spacing.xs, color: colors.actionPrimary, fontSize: 11, textAlign: 'center' },
});
