import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { ProductSearchPicker } from '@/components/product-search-picker';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { listPersonalProducts } from '@/lib/product-api';
import type { PersonalProduct } from '@/lib/product-api';
import { useSession } from '@/providers/session-provider';

function usageLabel(product: PersonalProduct): string {
  return product.use_count ? `已记录 ${product.use_count} 次使用` : '还没有使用记录';
}

export default function ProductsScreen() {
  const { request } = useSession();
  const [products, setProducts] = useState<PersonalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await listPersonalProducts(request));
    } catch (loadError) {
      setError(userFacingError(loadError));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <AppScreen>
      <View style={styles.header}>
        <Text style={styles.title}>产品</Text>
        <Text style={styles.description}>只记录你自己的产品和真实使用，不做推荐或疗效判断。</Text>
      </View>
      <AppButton label="记录一次使用" onPress={() => router.push('/product-use/new')} />
      <View style={styles.addPanel}>
        <ProductSearchPicker
          onOpenStandard={(standardProductId) =>
            router.push(`/product-catalog/${standardProductId}` as Href)
          }
          onProductReady={() => void reload()}
          selectedProductIds={[]}
        />
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {loading && products.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>正在读取个人产品柜</Text>
        </View>
      ) : null}
      {!loading && products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>产品柜还是空的</Text>
          <Text style={styles.emptyBody}>可以搜索、加入或自建产品，也可以直接记录一次“未注明产品”。</Text>
        </View>
      ) : null}
      {products.length > 0 ? (
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>我的产品</Text>
          {products.map((product) => (
            <Pressable
              accessibilityRole="button"
              key={product.product_id}
              onPress={() => router.push(`/product/${product.product_id}` as Href)}
              style={({ pressed }) => [styles.productCard, pressed && styles.pressed]}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.muted}>{usageLabel(product)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 32, lineHeight: 40, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  addPanel: {
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.lavender,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  muted: { color: colors.textMuted, fontSize: 13 },
  emptyState: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  listSection: { gap: spacing.md, marginTop: spacing.xxl },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  productCard: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  productName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.78 },
});
