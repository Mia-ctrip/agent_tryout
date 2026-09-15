import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { API_BASE_URL } from '@/lib/api';
import { createProductImageLoader, productImageRefreshDelay, type ProductImageSource } from '@/lib/product-image-loading';

type ProductImageProps = {
  uri: string | null;
  expiresAt?: string | null;
  onRefresh?: () => Promise<ProductImageSource>;
  onPress?: () => void;
  category: string | null;
  accessibilityLabel: string;
  size?: number;
  radius?: number;
};

export function ProductImage(props: ProductImageProps) {
  // Remount for a new source; late requests cannot replace another product.
  return <ProductImageContent key={`${props.uri}:${props.expiresAt}`} {...props} />;
}

function ProductImageContent({ uri, expiresAt = null, onRefresh, onPress, category, accessibilityLabel, size = 72, radius = radii.sm }: ProductImageProps) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);
  const [snapshot, setSnapshot] = useState(() => createProductImageLoader({ image_url: uri, image_expires_at: expiresAt }, API_BASE_URL).current());
  const loaderRef = useRef<ReturnType<typeof createProductImageLoader> | null>(null);
  const canRefresh = Boolean(onRefresh);

  useEffect(() => {
    const loader = createProductImageLoader(
      { image_url: uri, image_expires_at: expiresAt },
      API_BASE_URL,
      canRefresh ? () => refreshRef.current!() : undefined,
      setSnapshot,
    );
    loaderRef.current = loader;
    return () => { loader.dispose(); loaderRef.current = null; };
  }, [uri, expiresAt, canRefresh]);

  useEffect(() => {
    if (!canRefresh || !snapshot.uri || snapshot.phase === 'error') return;
    const delay = productImageRefreshDelay(snapshot.expiresAt);
    if (delay === null) return;
    const refresh = () => { void loaderRef.current?.failed(snapshot.attempt); };
    const timer = setTimeout(refresh, Math.min(delay, 2_147_483_647));
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && productImageRefreshDelay(snapshot.expiresAt) === 0) refresh();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [canRefresh, snapshot.uri, snapshot.expiresAt, snapshot.attempt, snapshot.phase]);

  const frame = { width: size, height: size, borderRadius: radius };
  const imageSize = size - spacing.md * 2;
  const failed = snapshot.phase === 'error';
  const interactive = failed || Boolean(onPress);
  const Frame = interactive ? Pressable : View;
  return (
    <Frame
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={failed ? `重新加载${accessibilityLabel}` : onPress ? `查看${accessibilityLabel}` : undefined}
      onPress={interactive ? event => {
        event.stopPropagation();
        if (failed) void loaderRef.current?.retry();
        else onPress?.();
      } : undefined}
      style={[styles.frame, frame]}>
      {snapshot.uri && snapshot.phase !== 'error' ? (
        <Image
          key={snapshot.attempt}
          accessibilityLabel={accessibilityLabel}
          resizeMode="contain"
          source={{ uri: snapshot.uri }}
          onLoad={() => loaderRef.current?.loaded(snapshot.attempt)}
          onError={() => { void loaderRef.current?.failed(snapshot.attempt); }}
          style={{ width: imageSize, height: imageSize }}
        />
      ) : snapshot.phase === 'error' ? (
        <View style={styles.fallback}>
          <Text style={styles.placeholderText}>加载失败</Text>
          <Text style={styles.retryText}>点按重试</Text>
        </View>
      ) : (
        <View accessibilityLabel={`${accessibilityLabel}，暂无图片`} style={styles.fallback}>
          <Text numberOfLines={1} style={styles.placeholderText}>{category || '产品'}</Text>
          <Text style={styles.placeholderText}>暂无图片</Text>
        </View>
      )}
      {snapshot.phase === 'loading' ? (
        <ActivityIndicator accessibilityLabel="正在加载产品图片" pointerEvents="none" color={colors.moss} size="small" style={styles.loading} />
      ) : null}
    </Frame>
  );
}

const styles = StyleSheet.create({
  frame: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paperElevated, borderWidth: 1, borderColor: colors.hairline },
  fallback: { width: '100%', height: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs },
  placeholderText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  retryText: { color: colors.actionPrimary, fontSize: 11, lineHeight: 16 },
  loading: { position: 'absolute' },
});
