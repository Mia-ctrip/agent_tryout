import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';
import { ProductImage } from '@/components/product-image';
import { getProductUse, type ProductUse } from '@/lib/product-api';
import { formatUsedAt } from '@/lib/product-use-flow';
import { useSession } from '@/providers/session-provider';

export function ProductUseCard({ productUse }: { productUse: ProductUse }) {
  const { request } = useSession();
  const productLabel = productUse.products.length
    ? productUse.products.map((product) => product.name).join('、')
    : '未注明产品';
  return (
    <View accessibilityLabel={`产品使用：${productLabel}`} style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>{productLabel}</Text>
        <Text style={styles.time}>{formatUsedAt(productUse.used_at)}</Text>
      </View>
      {productUse.products.map((product) => (
        <View key={product.product_id} style={styles.snapshot}>
          <ProductImage
            accessibilityLabel={`${product.name} 使用时产品图片`}
            category={null}
            uri={product.image_url}
            expiresAt={product.image_expires_at}
            onRefresh={async () => {
              // Re-sign the historical snapshot, never substitute the current catalog image.
              const use = await getProductUse(request, productUse.product_use_id);
              const snapshot = use.products.find(value => value.product_id === product.product_id && value.image_asset_id === product.image_asset_id);
              if (!snapshot) throw new Error('Product image snapshot unavailable');
              return snapshot;
            }}
          />
          <View style={styles.snapshotCopy}>
            <Text style={styles.snapshotName}>{product.name}</Text>
            {product.formula_version ? <Text style={styles.time}>版本：{product.formula_version}</Text> : null}
          </View>
        </View>
      ))}
      {productUse.note ? <Text style={styles.note}>{productUse.note}</Text> : null}
      <Text style={styles.source}>来源：用户记录 · 只表示当时真实使用</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  heading: { gap: spacing.xs },
  snapshot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  snapshotCopy: { flex: 1, gap: spacing.xs },
  snapshotName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  time: { color: colors.textMuted, fontSize: 13 },
  note: { color: colors.text, fontSize: 15, lineHeight: 22 },
  source: { color: colors.irisStrong, fontSize: 12, lineHeight: 18 },
});
