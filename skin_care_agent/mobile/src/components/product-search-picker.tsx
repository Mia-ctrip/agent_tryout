import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { CustomProductForm } from '@/components/custom-product-form';
import { InlineNotice } from '@/components/inline-notice';
import { ProductSearchResultRow } from '@/components/product-search-result-row';
import { productColors } from '@/constants/product-theme';
import { radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { addStandardProductToCabinet, searchProducts } from '@/lib/product-api';
import type { ProductSearchItem } from '@/lib/product-api';
import { createProductSearchGuard, selectedPersonalProductId } from '@/lib/product-search-flow';
import { shouldOfferCustomProduct } from '@/lib/product-ui';
import { useSession } from '@/providers/session-provider';

export function ProductSearchPicker({
  selectedProductIds,
  onProductReady,
  onOpenStandard,
  autoFocus = false,
}: {
  selectedProductIds: number[];
  onProductReady: (productId: number) => void;
  onOpenStandard?: (standardProductId: number) => void;
  autoFocus?: boolean;
}) {
  const { request } = useSession();
  const [guard] = useState(() => createProductSearchGuard());
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    const generation = guard.begin(trimmed);
    if (!trimmed) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void searchProducts(request, { query: trimmed })
        .then((page) => {
          if (!guard.accept(generation, trimmed)) return;
          setItems(page.items);
          setHasSearched(true);
          setLoading(false);
        })
        .catch((searchError) => {
          if (!guard.accept(generation, trimmed)) return;
          setError(userFacingError(searchError));
          setHasSearched(true);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [guard, query, request]);

  async function choose(item: ProductSearchItem) {
    const existing = selectedPersonalProductId(item);
    if (item.source_type === 'personal' && item.personal_product_id) {
      onProductReady(item.personal_product_id);
      return;
    }
    if (existing) {
      onProductReady(existing);
      return;
    }
    if (!item.standard_product_id || addingId) return;
    setAddingId(item.standard_product_id);
    setError(null);
    try {
      const product = await addStandardProductToCabinet(request, {
        clientRequestId: createClientRequestId(),
        standardProductId: item.standard_product_id,
      });
      onProductReady(product.product_id);
    } catch (addError) {
      setError(userFacingError(addError));
    } finally {
      setAddingId(null);
    }
  }

  const offerCustom = hasSearched && shouldOfferCustomProduct({
    query,
    loading,
    resultCount: items.length,
    error,
  });

  function changeQuery(value: string) {
    setQuery(value);
    setItems([]);
    setError(null);
    setHasSearched(false);
    setCustomOpen(false);
    setLoading(Boolean(value.trim()));
  }

  return (
    <View style={styles.picker}>
      <View style={styles.searchHeading}>
        <Text style={styles.label}>搜索产品</Text>
        <Text style={styles.live}>实时匹配</Text>
      </View>
      <View style={styles.inputFrame}>
        <Text accessibilityElementsHidden style={styles.searchIcon}>⌕</Text>
        <TextInput
          accessibilityLabel="搜索或添加产品"
          autoFocus={autoFocus}
          onChangeText={changeQuery}
          placeholder="输入产品名称、品牌或简称"
          placeholderTextColor={productColors.textSecondary}
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        {query ? (
          <Pressable accessibilityLabel="清空搜索" accessibilityRole="button" onPress={() => changeQuery('')} style={styles.clear}>
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.searchHint}>同时匹配产品名称、品牌、简称和受控别名</Text>

      {error ? <InlineNotice tone="error" message={error} /> : null}
      {loading ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color={productColors.actionPrimary} size="small" />
          <Text style={styles.progress}>正在匹配产品…</Text>
        </View>
      ) : null}
      {hasSearched && items.length > 0 ? (
        <View style={styles.results}>
          <View style={styles.resultHeading}>
            <Text style={styles.resultTitle}>找到 {items.length} 个匹配结果</Text>
            <Text style={styles.resultOrder}>按匹配程度排列</Text>
          </View>
          {items.map((item) => (
            <ProductSearchResultRow
              item={item}
              key={`${item.source_type}-${item.personal_product_id ?? item.standard_product_id}`}
              onAdd={() => void choose(item)}
              onOpenStandard={
                item.standard_product_id && onOpenStandard
                  ? () => onOpenStandard(item.standard_product_id as number)
                  : undefined
              }
              onSelect={() => void choose(item)}
              selected={Boolean(item.personal_product_id && selectedProductIds.includes(item.personal_product_id))}
            />
          ))}
          <Text style={styles.continueHint}>继续输入可进一步缩小范围</Text>
        </View>
      ) : null}
      {addingId ? <Text style={styles.progress}>正在加入个人产品柜…</Text> : null}

      {offerCustom ? (
        <View style={styles.noMatch}>
          <Text style={styles.noMatchEyebrow}>没有匹配结果</Text>
          <Text style={styles.noMatchTitle}>没有找到你的产品？</Text>
          <Text style={styles.noMatchBody}>可以用“{query.trim()}”作为名称创建自定义产品，图片可稍后再补。</Text>
          {!customOpen ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Keyboard.dismiss();
                setCustomOpen(true);
              }}
              style={({ pressed }) => [styles.customButton, pressed && styles.pressed]}>
              <Text style={styles.customButtonText}>创建自定义产品</Text>
            </Pressable>
          ) : (
            <CustomProductForm initialName={query.trim()} onCreated={onProductReady} />
          )}
        </View>
      ) : null}

      <View style={styles.boundaryCard}>
        <Text style={styles.boundaryTitle}>搜索结果只帮助识别产品</Text>
        <Text style={styles.boundary}>搜索结果仅用于记录，不代表推荐、疗效或适用程度。</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 12 },
  searchHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: productColors.textPrimary, fontSize: 12, fontWeight: '700' },
  live: { color: productColors.actionPrimary, fontSize: 11, fontWeight: '600' },
  inputFrame: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1.4, borderColor: productColors.brand, borderRadius: 17, backgroundColor: productColors.surface, paddingHorizontal: 14 },
  searchIcon: { color: productColors.actionPrimary, fontSize: 23, lineHeight: 25, marginRight: 8 },
  input: { flex: 1, minHeight: 52, color: productColors.textPrimary, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
  clear: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: productColors.surfaceMuted },
  clearText: { color: productColors.textSecondary, fontSize: 19, lineHeight: 21 },
  searchHint: { color: productColors.textSecondary, fontSize: 10.5, lineHeight: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  progress: { color: productColors.actionPrimary, fontSize: 13 },
  results: { gap: 12, marginTop: spacing.sm },
  resultHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultTitle: { color: productColors.textPrimary, fontSize: 12, fontWeight: '700' },
  resultOrder: { color: productColors.textSecondary, fontSize: 10.5 },
  continueHint: { color: productColors.textSecondary, fontSize: 11, textAlign: 'center', paddingVertical: spacing.md },
  noMatch: { gap: 10, borderRadius: 20, backgroundColor: productColors.surface, padding: 18, marginTop: spacing.sm },
  noMatchEyebrow: { color: productColors.actionPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  noMatchTitle: { color: productColors.textPrimary, fontSize: 19, fontWeight: '700' },
  noMatchBody: { color: productColors.textSecondary, fontSize: 13, lineHeight: 20 },
  customButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: productColors.actionPrimary, marginTop: 4 },
  customButtonText: { color: productColors.surface, fontSize: 14, fontWeight: '700' },
  boundaryCard: { gap: 4, borderRadius: 18, backgroundColor: productColors.surfaceMuted, paddingHorizontal: 16, paddingVertical: 14, marginTop: 18 },
  boundaryTitle: { color: productColors.actionPrimary, fontSize: 11, fontWeight: '700' },
  boundary: { color: productColors.textSecondary, fontSize: 10.5, lineHeight: 17 },
  pressed: { opacity: 0.82 },
});
