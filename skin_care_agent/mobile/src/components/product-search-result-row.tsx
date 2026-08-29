import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import type { ProductSearchItem } from '@/lib/product-api';

export function ProductSearchResultRow({
  item,
  onSelect,
  onAdd,
  onOpenStandard,
  selected = false,
}: {
  item: ProductSearchItem;
  onSelect: () => void;
  onAdd: () => void;
  onOpenStandard?: () => void;
  selected?: boolean;
}) {
  const actionLabel = selected
    ? '已选中'
    : item.source_type === 'personal' || item.in_cabinet
      ? '选中产品'
      : '加入产品柜';
  const action = item.source_type === 'standard' && !item.in_cabinet ? onAdd : onSelect;
  const meta = [item.brand_name, item.formula_version].filter(Boolean).join(' · ')
    || (item.source_type === 'personal' ? '我的产品' : item.product_category || '标准产品');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole={onOpenStandard ? 'button' : undefined}
        disabled={!onOpenStandard}
        onPress={onOpenStandard}
        style={styles.summary}>
        <ProductImage accessibilityLabel={`${item.name} 产品图片`} category={item.product_category} radius={14} size={72} uri={item.image_url} />
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
          <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceText}>{item.source_type === 'personal' ? '我的产品' : '标准产品'}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={actionLabel}
        accessibilityRole="button"
        disabled={selected}
        onPress={action}
        style={({ pressed }) => [styles.action, selected && styles.selected, pressed && styles.pressed]}>
        <Text style={styles.actionText}>{selected ? '✓' : '+'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: productColors.border, borderRadius: 18, backgroundColor: productColors.surface, padding: 10 },
  summary: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: productColors.textPrimary, fontSize: 14.5, lineHeight: 19, fontWeight: '700' },
  meta: { color: productColors.textSecondary, fontSize: 10.8, lineHeight: 16 },
  sourceBadge: { alignSelf: 'flex-start', borderRadius: 10, backgroundColor: productColors.surfaceMuted, paddingHorizontal: 9, paddingVertical: 4 },
  sourceText: { color: productColors.actionPrimary, fontSize: 9.5, fontWeight: '700' },
  action: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: productColors.actionPrimary },
  selected: { backgroundColor: productColors.brand },
  actionText: { color: productColors.surface, fontSize: 21, lineHeight: 23, fontWeight: '600' },
  pressed: { opacity: 0.76 },
});
