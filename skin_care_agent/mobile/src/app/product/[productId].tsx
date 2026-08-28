import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import { spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { getPersonalProduct, getStandardProduct } from '@/lib/product-api';
import type { PersonalProductDetail, StandardProductDetail } from '@/lib/product-api';
import { formatProductUseDate, productLastUsedLabel } from '@/lib/product-ui';
import { useSession } from '@/providers/session-provider';

export default function ProductDetailScreen() {
  const params = useLocalSearchParams<{ productId: string }>();
  const productId = Number(params.productId);
  const { request } = useSession();
  const [product, setProduct] = useState<PersonalProductDetail | null>(null);
  const [standard, setStandard] = useState<StandardProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        setLoading(false);
        setError('产品编号无效。');
        return () => { active = false; };
      }
      setLoading(true);
      setError(null);
      setDocumentError(null);
      setStandard(null);
      void getPersonalProduct(request, productId)
        .then(async (value) => {
          if (!active) return;
          setProduct(value);
          if (value.standard_product_id) {
            try {
              const catalogProduct = await getStandardProduct(request, value.standard_product_id);
              if (active) setStandard(catalogProduct);
            } catch (loadError) {
              if (active) setDocumentError(userFacingError(loadError));
            }
          }
        })
        .catch((loadError) => {
          if (active) setError(userFacingError(loadError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => { active = false; };
    }, [productId, request]),
  );

  const document = standard?.current_document;
  const productMeta = product
    ? [product.brand_name, product.formula_version].filter(Boolean).join(' · ')
    : '';

  return (
    <AppScreen
      backgroundColor={productColors.background}
      contentStyle={styles.screenContent}
      safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: productColors.background },
          headerTintColor: productColors.actionPrimary,
          title: '产品详情',
        }}
      />
      {loading && !product ? <ActivityIndicator color={productColors.actionPrimary} /> : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {product ? (
        <View style={styles.content}>
          <View style={styles.heroCard}>
            <ProductImage
              accessibilityLabel={`${product.name} 当前产品图片`}
              category={standard?.product_category ?? null}
              radius={22}
              size={132}
              uri={product.image_url}
            />
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>{product.source_type === 'standard' ? 'STANDARD PRODUCT' : 'MY PRODUCT'}</Text>
              <Text style={styles.title}>{product.name}</Text>
              {productMeta ? <Text style={styles.metadata}>{productMeta}</Text> : null}
              <Text style={styles.sourceType}>{product.source_type === 'standard' ? '标准目录产品' : '用户自建产品'}</Text>
            </View>
          </View>

          <View style={styles.factRow}>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>累计使用</Text>
              <Text style={styles.factValue}>{product.use_count}<Text style={styles.factUnit}> 次</Text></Text>
            </View>
            <View style={styles.factDivider} />
            <View style={styles.fact}>
              <Text style={styles.factLabel}>最近使用</Text>
              <Text numberOfLines={1} style={styles.factDate}>{productLastUsedLabel(product.last_used_at).replace('最后使用：', '')}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>官方说明书</Text>
            {documentError ? <InlineNotice tone="error" message={`说明书暂时无法读取：${documentError}`} /> : null}
            {document ? (
              <View style={styles.manualCard}>
                <Text style={styles.manualLabel}>【适应症】原文</Text>
                <Text style={styles.manualBody}>{document.indications_original_text || '当前资料未提供适应症原文。'}</Text>
                <Text style={styles.manualSource}>资料来源：{document.source_name} · 版本 {document.document_version}</Text>
                <Text style={styles.boundary}>原文仅作资料展示，不构成产品推荐或使用建议。</Text>
              </View>
            ) : !product.standard_product_id ? (
              <View style={styles.manualCard}>
                <Text style={styles.manualBody}>这是用户自建产品，暂无可追溯的官方说明书。</Text>
              </View>
            ) : !documentError ? (
              <Text style={styles.muted}>当前标准资料没有可展示的说明书原文。</Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>最近使用记录</Text>
              <Text style={styles.sectionCount}>全部 {product.use_count} 次</Text>
            </View>
            {product.uses.length ? (
              <View style={styles.uses}>
                {product.uses.map((productUse) => (
                  <View key={productUse.product_use_id} style={styles.useRow}>
                    <View style={styles.timelineDot} />
                    <View style={styles.useCard}>
                      <Text style={styles.useDate}>{formatProductUseDate(productUse.used_at, productUse.used_timezone_offset_minutes)}</Text>
                      <Text style={styles.useNote}>{productUse.note || '本次未填写补充说明'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>还没有使用记录。</Text>
            )}
            <Text style={styles.boundary}>使用记录只呈现个人事实，不作疗效或因果判断。</Text>
          </View>
        </View>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: 56 },
  content: { gap: 24 },
  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 18, borderRadius: 24, backgroundColor: productColors.surface, padding: 16 },
  heroCopy: { flex: 1, gap: 6 },
  eyebrow: { color: productColors.actionPrimary, fontSize: 9.5, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: productColors.textPrimary, fontSize: 24, lineHeight: 31, fontWeight: '700' },
  metadata: { color: productColors.textSecondary, fontSize: 13, lineHeight: 19 },
  sourceType: { alignSelf: 'flex-start', color: productColors.actionPrimary, fontSize: 11, fontWeight: '700', borderRadius: 99, backgroundColor: productColors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5 },
  factRow: { minHeight: 82, flexDirection: 'row', alignItems: 'stretch', borderRadius: 20, backgroundColor: productColors.surfaceMuted, paddingVertical: 14 },
  fact: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  factDivider: { width: StyleSheet.hairlineWidth, backgroundColor: productColors.border },
  factLabel: { color: productColors.textSecondary, fontSize: 11 },
  factValue: { color: productColors.textPrimary, fontSize: 23, fontWeight: '700' },
  factUnit: { fontSize: 12, fontWeight: '500' },
  factDate: { color: productColors.textPrimary, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  section: { gap: 11 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: productColors.textPrimary, fontSize: 17, fontWeight: '700' },
  sectionCount: { color: productColors.actionPrimary, fontSize: 12, fontWeight: '600' },
  manualCard: { gap: 10, borderRadius: 18, backgroundColor: productColors.surface, padding: 16 },
  manualLabel: { color: productColors.actionPrimary, fontSize: 12, fontWeight: '700' },
  manualBody: { color: productColors.textPrimary, fontSize: 14, lineHeight: 23 },
  manualSource: { color: productColors.textSecondary, fontSize: 11, lineHeight: 17 },
  boundary: { color: productColors.textSecondary, fontSize: 10.5, lineHeight: 17 },
  muted: { color: productColors.textSecondary, fontSize: 14, lineHeight: 21 },
  uses: { gap: 10 },
  useRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: productColors.background, backgroundColor: productColors.brand },
  useCard: { flex: 1, gap: 6, borderWidth: 1, borderColor: productColors.border, borderRadius: 16, backgroundColor: productColors.surface, paddingHorizontal: 15, paddingVertical: 12 },
  useDate: { color: productColors.textPrimary, fontSize: 12.5, fontWeight: '700' },
  useNote: { color: productColors.textSecondary, fontSize: 12, lineHeight: 18 },
});
