import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { CustomProductForm } from '@/components/custom-product-form';
import { InlineNotice } from '@/components/inline-notice';
import { ProductSearchResultRow } from '@/components/product-search-result-row';
import { colors, radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { addStandardProductToCabinet, searchProducts } from '@/lib/product-api';
import type { ProductSearchItem } from '@/lib/product-api';
import { createProductSearchGuard, selectedPersonalProductId } from '@/lib/product-search-flow';
import { useSession } from '@/providers/session-provider';

export function ProductSearchPicker({
  selectedProductIds,
  onProductReady,
  onOpenStandard,
}: {
  selectedProductIds: number[];
  onProductReady: (productId: number) => void;
  onOpenStandard?: (standardProductId: number) => void;
}) {
  const { request } = useSession();
  const [guard] = useState(() => createProductSearchGuard());
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ProductSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const generation = guard.begin(trimmed);
    if (!trimmed) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void searchProducts(request, { query: trimmed })
        .then((page) => {
          if (guard.accept(generation, trimmed)) setItems(page.items);
        })
        .catch((searchError) => {
          if (guard.accept(generation, trimmed)) setError(userFacingError(searchError));
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

  return (
    <View style={styles.picker}>
      <Text style={styles.title}>搜索或添加产品</Text>
      <TextInput
        accessibilityLabel="搜索或添加产品"
        onChangeText={(value) => {
          setQuery(value);
          if (!value.trim()) setItems([]);
          setError(null);
        }}
        placeholder="搜索个人产品柜或标准目录"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={query}
      />
      <Text style={styles.boundary}>搜索结果仅用于记录，不代表推荐。</Text>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {items.map((item) => (
        <ProductSearchResultRow
          item={item}
          key={`${item.source_type}-${item.personal_product_id ?? item.standard_product_id}`}
          onAdd={() => void choose(item)}
          onOpenStandard={
            item.standard_product_id ? () => onOpenStandard?.(item.standard_product_id as number) : undefined
          }
          onSelect={() => void choose(item)}
        />
      ))}
      {addingId ? <Text style={styles.progress}>正在加入个人产品柜…</Text> : null}
      <CustomProductForm initialName={query} onCreated={onProductReady} />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.lavender, padding: spacing.lg },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.lg },
  boundary: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  progress: { color: colors.irisStrong, fontSize: 14 },
});
