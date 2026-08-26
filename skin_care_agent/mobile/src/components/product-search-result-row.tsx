import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ProductImage } from '@/components/product-image';
import { colors, radii, spacing } from '@/constants/theme';
import type { ProductSearchItem } from '@/lib/product-api';

export function ProductSearchResultRow({
  item,
  onSelect,
  onAdd,
  onOpenStandard,
}: {
  item: ProductSearchItem;
  onSelect: () => void;
  onAdd: () => void;
  onOpenStandard?: () => void;
}) {
  const actionLabel =
    item.source_type === 'personal'
      ? '选中'
      : item.in_cabinet
        ? '已在产品柜'
        : '加入产品柜并选中';
  const action = item.source_type === 'standard' && !item.in_cabinet ? onAdd : onSelect;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={item.standard_product_id ? 'button' : undefined}
        onPress={item.standard_product_id ? onOpenStandard : undefined}
        style={styles.summary}>
        <ProductImage
          accessibilityLabel={`${item.name} 产品图片`}
          category={item.product_category}
          uri={item.image_url}
        />
        <View style={styles.copy}>
          <Text style={styles.name}>{item.name}</Text>
          {item.brand_name ? <Text style={styles.meta}>{item.brand_name}</Text> : null}
          {item.formula_version ? <Text style={styles.meta}>版本：{item.formula_version}</Text> : null}
          {item.regulatory_type ? <Text style={styles.meta}>类别：{item.regulatory_type}</Text> : null}
        </View>
      </Pressable>
      <AppButton label={actionLabel} onPress={action} variant="secondary" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.md },
  summary: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  copy: { flex: 1, gap: spacing.xs },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
});
