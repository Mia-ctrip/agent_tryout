import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { ProductUseCard } from '@/components/product-use-card';
import { colors, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { getPersonalProduct } from '@/lib/product-api';
import type { PersonalProductDetail } from '@/lib/product-api';
import { useSession } from '@/providers/session-provider';

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = Number(params.productId);
  const { request } = useSession();
  const [product, setProduct] = useState<PersonalProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        setLoading(false);
        setError('产品编号无效。');
        return () => {
          active = false;
        };
      }
      setLoading(true);
      setError(null);
      void getPersonalProduct(request, productId)
        .then((value) => {
          if (active) setProduct(value);
        })
        .catch((loadError) => {
          if (active) setError(userFacingError(loadError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [productId, request]),
  );

  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.irisStrong,
          title: product?.name ?? '产品详情',
        }}
      />
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {product ? (
        <View style={styles.content}>
          <Text style={styles.title}>{product.name}</Text>
          <ProductImage
            accessibilityLabel={`${product.name} 当前产品图片`}
            category={null}
            uri={product.image_url}
          />
          {product.brand_name ? <Text style={styles.metadata}>{product.brand_name}</Text> : null}
          {product.formula_version ? <Text style={styles.metadata}>版本：{product.formula_version}</Text> : null}
          <Text style={styles.description}>这里只列出你真实保存过的使用事实。</Text>
          {product.uses.length ? (
            <View style={styles.list}>
              {product.uses.map((productUse) => (
                <ProductUseCard key={productUse.product_use_id} productUse={productUse} />
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>还没有使用记录。</Text>
          )}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  metadata: { color: colors.irisStrong, fontSize: 14 },
  list: { gap: spacing.md, marginTop: spacing.md },
  empty: { color: colors.textMuted, fontSize: 15, paddingVertical: spacing.xl },
});
