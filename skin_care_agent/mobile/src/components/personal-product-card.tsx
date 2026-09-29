import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { colors, radii, spacing } from '@/constants/theme';
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
        size={76}
        variant="archive"
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
    borderRadius: radii.md,
    backgroundColor: `${colors.paper}CC`,
    padding: spacing.md,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  openProduct: { flex: 1, minWidth: 0, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.earth, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  meta: { color: colors.earth, opacity: 0.8, fontSize: 13, lineHeight: 18 },
  lastUsed: { color: colors.earth, opacity: 0.8, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  chevron: { color: colors.earth, fontSize: 28, lineHeight: 32, marginRight: spacing.xs },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
});
