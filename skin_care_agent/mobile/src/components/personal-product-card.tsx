import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import { radii, spacing } from '@/constants/theme';
import { getPersonalProduct, type PersonalProduct } from '@/lib/product-api';
import { productLastUsedLabel } from '@/lib/product-ui';
import { useSession } from '@/providers/session-provider';

export function PersonalProductCard({
  product,
  onPress,
}: {
  product: PersonalProduct;
  onPress: () => void;
}) {
  const { request } = useSession();
  const meta = [product.brand_name, product.formula_version].filter(Boolean).join(' · ')
    || (product.source_type === 'custom' ? '自建产品' : '标准产品');

  return (
    <View style={styles.card}>
      <ProductImage
        accessibilityLabel={`${product.name} 产品图片`}
        category={null}
        radius={radii.sm}
        size={80}
        uri={product.image_url}
        expiresAt={product.image_expires_at}
        onRefresh={() => getPersonalProduct(request, product.product_id)}
        onPress={onPress}
      />
      <Pressable
        accessibilityLabel={`${product.name}，已记录 ${product.use_count} 次使用`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.openProduct, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
          <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
          <Text style={styles.lastUsed}>
            {product.use_count > 0 ? `${product.use_count} 次记录 · ${productLastUsedLabel(product.last_used_at).replace('最后使用：', '最近 ')}` : '尚无使用记录'}
          </Text>
        </View>
        <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
      </Pressable>
    </View>
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
    paddingVertical: spacing.lg,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  openProduct: { flex: 1, minWidth: 0, minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: productColors.textPrimary, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  meta: { color: productColors.textSecondary, fontSize: 12, lineHeight: 17 },
  lastUsed: { color: productColors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  chevron: { color: productColors.textSecondary, fontSize: 24, lineHeight: 28, marginLeft: -4 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
});
