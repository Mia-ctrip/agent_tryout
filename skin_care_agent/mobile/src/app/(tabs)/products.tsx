import { router, useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { EditorialText } from '@/components/editorial-text';
import { MedicineArchiveHeader, ProductArchiveBackdrop } from '@/components/medicine-archive-header';
import { PersonalProductCard } from '@/components/personal-product-card';
import { SwipeableProductRow } from '@/components/swipeable-product-row';
import { productColors } from '@/constants/product-theme';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { listPersonalProducts, archiveProduct } from '@/lib/product-api';
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
    <View style={styles.screen}>
      <ProductArchiveBackdrop />
    <AppScreen backgroundColor="transparent" safeAreaEdges={['top', 'left', 'right']} contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <EditorialText role="sectionTitle" style={styles.title}>产品档案</EditorialText>
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
      <MedicineArchiveHeader />
      <Text style={styles.summary}>{productCabinetSummary(products)}</Text>
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
              onArchive={async () => {
                try {
                  await archiveProduct(request, product.product_id);
                  setProducts((prev) => prev.filter((p) => p.product_id !== product.product_id));
                  setArchiveNotice(`已归档”${product.name}”`);
                } catch (archiveError) {
                  setArchiveNotice(`归档失败: ${userFacingError(archiveError)}`);
                }
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ground },
  screenContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.hero },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg },
  headerCopy: { flex: 1, gap: 4 },
  title: { color: colors.earth, fontSize: 22, lineHeight: 30 },
  summary: { color: colors.earth, fontSize: 15, lineHeight: 24 },
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.paper, paddingHorizontal: spacing.lg },
  addSymbol: { color: colors.mossDeep, fontSize: 28, lineHeight: 32, fontWeight: '300' },
  addLabel: { color: colors.mossDeep, fontSize: 14, fontWeight: '500' },
  listHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xxxl, paddingBottom: spacing.md },
  sortLabel: { color: colors.earth, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  totalLabel: { color: colors.earth, fontSize: 13, opacity: 0.8 },
  list: { gap: spacing.md },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: 64 },
  muted: { color: colors.earth, opacity: 0.8, fontSize: 13 },
  emptyState: { gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.paper, padding: spacing.xl },
  emptyTitle: { color: colors.earth, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: colors.earth, opacity: 0.8, fontSize: 14, lineHeight: 22 },
  archiveNotice: { borderRadius: radii.md, backgroundColor: colors.paper, padding: spacing.md, marginBottom: spacing.md },
  archiveNoticeText: { color: productColors.actionPrimary, fontSize: 12, lineHeight: 18 },
  moreHint: { color: colors.earth, opacity: 0.8, fontSize: 11, textAlign: 'center', paddingVertical: spacing.md },
  pressed: { opacity: 0.82 },
});
