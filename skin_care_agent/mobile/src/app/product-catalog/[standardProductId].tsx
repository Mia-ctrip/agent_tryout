import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { colors, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { getStandardProduct } from '@/lib/product-api';
import type { StandardProductDetail } from '@/lib/product-api';
import { useSession } from '@/providers/session-provider';

export default function StandardProductDetailScreen() {
  const { standardProductId } = useLocalSearchParams<{ standardProductId: string }>();
  const id = Number(standardProductId);
  const { request } = useSession();
  const [product, setProduct] = useState<StandardProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!Number.isSafeInteger(id) || id <= 0) {
        setError('标准产品编号无效。');
        return undefined;
      }
      let active = true;
      void getStandardProduct(request, id)
        .then((value) => active && setProduct(value))
        .catch((loadError) => active && setError(userFacingError(loadError)));
      return () => {
        active = false;
      };
    }, [id, request]),
  );

  const document = product?.current_document;
  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: product?.official_name || '标准产品资料' }} />
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {!product && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {product ? (
        <View style={styles.content}>
          <Text style={styles.title}>{product.official_name}</Text>
          <ProductImage accessibilityLabel={`${product.official_name} 官方产品图片`} category={product.product_category} uri={product.image_url} />
          <Text style={styles.meta}>{product.brand_name} · {product.formula_version}</Text>
          <Text style={styles.boundary}>产品资料仅用于记录，不构成诊断或使用建议。</Text>
          {document ? (
            <View style={styles.document}>
              <Text style={styles.heading}>【适应症】原文</Text>
              <Text style={styles.body}>{document.indications_original_text || '该产品没有可展示的适应症原文。'}</Text>
              <Text style={styles.heading}>官方来源</Text>
              <Text style={styles.body}>{document.source_name} · 版本 {document.document_version}</Text>
            </View>
          ) : null}
          {product.regulatory_type !== 'cosmetic' ? <Text style={styles.boundary}>请以当前官方说明书及专业人员指导为准。</Text> : null}
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  meta: { color: colors.irisStrong, fontSize: 15 },
  boundary: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  document: { gap: spacing.sm, marginTop: spacing.md },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
