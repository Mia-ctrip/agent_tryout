import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import { spacing } from '@/constants/theme';
import type { PersonalProduct } from '@/lib/product-api';
import { productLastUsedLabel } from '@/lib/product-ui';

export function PersonalProductCard({
  product,
  onPress,
}: {
  product: PersonalProduct;
  onPress: () => void;
}) {
  const meta = [product.brand_name, product.formula_version].filter(Boolean).join(' · ')
    || (product.source_type === 'custom' ? '自建产品' : '标准产品');

  return (
    <Pressable
      accessibilityLabel={`${product.name}，已记录 ${product.use_count} 次使用`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <ProductImage
        accessibilityLabel={`${product.name} 产品图片`}
        category={null}
        radius={15}
        size={76}
        uri={product.image_url}
      />
      <View style={styles.copy}>
        <View style={styles.heading}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          <View style={styles.countBadge}>
            <Text style={styles.count}>{product.use_count} 次</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
        <View style={styles.lastUsedRow}>
          <View style={styles.dot} />
          <Text style={styles.lastUsed}>{productLastUsedLabel(product.last_used_at)}</Text>
        </View>
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: productColors.border,
    backgroundColor: productColors.background,
    paddingVertical: spacing.lg,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  heading: { alignItems: 'flex-start', gap: spacing.xs },
  name: { color: productColors.textPrimary, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  countBadge: { paddingVertical: 2 },
  count: { color: productColors.actionPrimary, fontSize: 11, fontWeight: '500' },
  meta: { color: productColors.textSecondary, fontSize: 12, lineHeight: 17 },
  lastUsedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: productColors.brand },
  lastUsed: { color: productColors.textSecondary, fontSize: 11.5 },
  chevron: { color: productColors.textSecondary, fontSize: 24, lineHeight: 28, marginLeft: -4 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
});
