import ProductUseDateTimePicker from '@expo/ui/community/datetime-picker';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { InlineNotice } from '@/components/inline-notice';
import { ProductSearchPicker } from '@/components/product-search-picker';
import { colors, radii, spacing } from '@/constants/theme';
import { userFacingError } from '@/lib/errors';
import { createProductUse, listPersonalProducts } from '@/lib/product-api';
import type { PersonalProduct } from '@/lib/product-api';
import {
  buildProductUseInput,
  createProductUseDraft,
  formatUsedAt,
  mergeUsedAtPart,
  toggleProductSelection,
} from '@/lib/product-use-flow';
import { selectReadyProduct } from '@/lib/product-search-flow';
import { useSession } from '@/providers/session-provider';

export default function NewProductUseScreen() {
  const { request } = useSession();
  const [draft, setDraft] = useState(() => createProductUseDraft());
  const [products, setProducts] = useState<PersonalProduct[]>([]);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadProducts = useCallback(async () => {
    setProducts(await listPersonalProducts(request));
  }, [request]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void reloadProducts().catch((loadError) => {
        if (active) setError(userFacingError(loadError));
      });
      return () => {
        active = false;
      };
    }, [reloadProducts]),
  );

  async function saveUse() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await createProductUse(request, buildProductUseInput(draft));
      router.replace('/(tabs)/history');
    } catch (saveError) {
      setError(userFacingError(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen safeAreaEdges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.irisStrong,
          title: '记录产品使用',
        }}
      />
      <View style={styles.header}>
        <Text style={styles.title}>这次实际用了什么？</Text>
        <Text style={styles.description}>可以多选，也可以不选产品并保存“未注明产品”。</Text>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>个人产品柜</Text>
        {products.length ? (
          <View style={styles.chips}>
            {products.map((product) => {
              const selected = draft.productIds.includes(product.product_id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  key={product.product_id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      productIds: toggleProductSelection(
                        current.productIds,
                        product.product_id,
                      ),
                    }))
                  }
                  style={[styles.chip, selected && styles.chipSelected]}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {product.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.hint}>产品柜为空，也可以直接保存未注明产品。</Text>
        )}
      </View>
      <View style={styles.addPanel}>
        <ProductSearchPicker
          onOpenStandard={(standardProductId) =>
            router.push(`/product-catalog/${standardProductId}` as never)
          }
          onProductReady={(productId) => {
            setDraft((current) => ({
              ...current,
              productIds: selectReadyProduct(current.productIds, { product_id: productId }),
            }));
            void reloadProducts().catch((loadError) => setError(userFacingError(loadError)));
          }}
          selectedProductIds={draft.productIds}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>真实使用时间</Text>
        <Text style={styles.time}>{formatUsedAt(draft.usedAt)}</Text>
        <View style={styles.timeButtons}>
          <AppButton
            label="修改日期"
            onPress={() => setPicker('date')}
            variant="secondary"
          />
          <AppButton
            label="修改时间"
            onPress={() => setPicker('time')}
            variant="secondary"
          />
        </View>
        {picker ? (
          <ProductUseDateTimePicker
            accentColor={colors.primary}
            is24Hour
            maximumDate={new Date()}
            mode={picker}
            negativeButton={{ label: '取消' }}
            onDismiss={() => setPicker(null)}
            onValueChange={(_event, selected) => {
              setDraft((current) => ({
                ...current,
                usedAt: mergeUsedAtPart(current.usedAt, selected, picker),
              }));
              setPicker(null);
            }}
            positiveButton={{ label: '确定' }}
            presentation="dialog"
            value={draft.usedAt}
          />
        ) : null}
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>备注（选填）</Text>
        <TextInput
          accessibilityLabel="产品使用备注"
          maxLength={500}
          multiline
          onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
          placeholder="只记录真实发生的使用情况"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.note]}
          textAlignVertical="top"
          value={draft.note}
        />
        <Text style={styles.counter}>{draft.note.length}/500</Text>
      </View>
      <InlineNotice
        tone="info"
        message="产品使用只作为同时段事实，不代表与皮肤状态存在关联或疗效。"
      />
      <AppButton
        label={draft.productIds.length ? '保存这次使用' : '保存未注明产品'}
        loading={saving}
        onPress={() => void saveUse()}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.lavender },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: colors.irisStrong },
  hint: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  addPanel: {
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.sage,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    padding: spacing.lg,
  },
  note: { minHeight: 112 },
  counter: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 12 },
  time: { color: colors.irisStrong, fontSize: 18, fontWeight: '700' },
  timeButtons: { flexDirection: 'row', gap: spacing.sm },
});
