import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { PersonalProductCard } from '@/components/personal-product-card';
import { SwipeableProductRow } from '@/components/swipeable-product-row';
import { productColors } from '@/constants/product-theme';
import { radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { listPersonalProducts } from '@/lib/product-api';
import type { PersonalProduct } from '@/lib/product-api';
import { productCabinetSummary, sortPersonalProducts } from '@/lib/product-ui';
import { useSession } from '@/providers/session-provider';

export default function ProductsScreen() {
  const { request } = useSession();
  const [products, setProducts] = useState<PersonalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
  const orderedProducts = useMemo(() => sortPersonalProducts(products), [products]);

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
    <AppScreen backgroundColor={productColors.background} contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>MY VANITY</Text>
          <Text style={styles.title}>我的产品</Text>
          <Text style={styles.summary}>{productCabinetSummary(products)}</Text>
        </View>
        <Pressable
          accessibilityLabel="新增产品"
          accessibilityRole="button"
          onPress={() => router.push('/product/new')}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Text style={styles.addSymbol}>＋</Text>
          <Text style={styles.addLabel}>新增</Text>
        </Pressable>
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.sortLabel}>按使用频次排列</Text>
        <Text style={styles.totalLabel}>共 {products.length} 件</Text>
      </View>

      {error ? <InlineNotice tone="error" message={error} /> : null}
      {archiveNotice ? (
        <View style={styles.archiveNotice}>
          <Text style={styles.archiveNoticeText}>{archiveNotice}</Text>
        </View>
      ) : null}
      {loading && products.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={productColors.actionPrimary} />
          <Text style={styles.muted}>正在读取个人产品柜</Text>
        </View>
      ) : null}
      {!loading && products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>把正在使用的产品放进来</Text>
          <Text style={styles.emptyBody}>点击右上角“新增”，输入名称即可实时匹配；找不到时也可以创建自己的产品。</Text>
        </View>
      ) : null}
      {orderedProducts.length > 0 ? (
        <View style={styles.list}>
          {orderedProducts.map((product) => (
            <SwipeableProductRow
              key={product.product_id}
              onArchive={() => {
                // TODO(product-archive): call the backend soft-archive endpoint once available.
                setArchiveNotice(`“${product.name}”暂未归档：后端归档接口待完成。`);
              }}>
              <PersonalProductCard
                onPress={() => router.push(`/product/${product.product_id}` as Href)}
                product={product}
              />
            </SwipeableProductRow>
          ))}
          {orderedProducts.length > 4 ? <Text style={styles.moreHint}>继续下滑查看全部产品</Text> : null}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 96 },
  header: { minHeight: 124, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  headerCopy: { flex: 1, gap: 4 },
  eyebrow: { color: productColors.textSecondary, fontSize: 10, lineHeight: 16, fontWeight: '700', letterSpacing: 2.1 },
  title: { color: productColors.textPrimary, fontSize: 29, lineHeight: 37, fontWeight: '700' },
  summary: { color: productColors.textSecondary, fontSize: 13, lineHeight: 20 },
  addButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radii.pill, backgroundColor: productColors.actionPrimary, paddingHorizontal: 15 },
  addSymbol: { color: productColors.surface, fontSize: 18, lineHeight: 20, fontWeight: '600' },
  addLabel: { color: productColors.surface, fontSize: 13, fontWeight: '700' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sortLabel: { color: productColors.textSecondary, fontSize: 12, fontWeight: '600' },
  totalLabel: { color: productColors.textSecondary, fontSize: 11 },
  list: { gap: 12 },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: 64 },
  muted: { color: productColors.textSecondary, fontSize: 13 },
  emptyState: { gap: spacing.sm, borderRadius: 20, backgroundColor: productColors.surface, padding: spacing.xl },
  emptyTitle: { color: productColors.textPrimary, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: productColors.textSecondary, fontSize: 14, lineHeight: 22 },
  archiveNotice: { borderRadius: 14, backgroundColor: productColors.surfaceMuted, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 },
  archiveNoticeText: { color: productColors.actionPrimary, fontSize: 12, lineHeight: 18 },
  moreHint: { color: productColors.textSecondary, fontSize: 11, textAlign: 'center', paddingVertical: spacing.md },
  pressed: { opacity: 0.82 },
});
