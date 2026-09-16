import ProductUseDateTimePicker from '@expo/ui/community/datetime-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { ProductSearchPicker } from '@/components/product-search-picker';
import { colors, radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { getObservation } from '@/lib/observation-api';
import { shouldPollObservationTargets } from '@/lib/observation-flow';
import {
  productUseExitTarget,
  type ProductUseSource,
} from '@/lib/observation-navigation';
import {
  createProductUse,
  getPersonalProduct,
  listPersonalProducts,
} from '@/lib/product-api';
import type { PersonalProduct } from '@/lib/product-api';
import {
  buildProductUseInput,
  createProductUseDraft,
  formatUsedAt,
  loadProductUseSession,
  mergeUsedAtPart,
  productUseObservationStatus,
  saveProductUseSession,
  toggleProductSelection,
  type ProductUseSubmissionIntent,
} from '@/lib/product-use-flow';
import { selectReadyProduct } from '@/lib/product-search-flow';
import { productLastUsedLabel, sortPersonalProducts } from '@/lib/product-ui';
import { useSession } from '@/providers/session-provider';

type RouteParams = {
  source?: string | string[];
  flowId?: string | string[];
  observationId?: string | string[];
  eventId?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveId(value: string | string[] | undefined): number | undefined {
  const parsed = Number(first(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function productUseSource(value: string | string[] | undefined): ProductUseSource {
  const source = first(value);
  return source === 'after_observation' ||
    source === 'observation' ||
    source === 'region_event' ||
    source === 'observe'
    ? source
    : 'observe';
}

export default function NewProductUseScreen() {
  const params = useLocalSearchParams<RouteParams>();
  const { request, user } = useSession();
  const [flowId] = useState(() => first(params.flowId)?.trim() || createClientRequestId());
  const source = productUseSource(params.source);
  const observationId = positiveId(params.observationId);
  const eventId = positiveId(params.eventId);
  const exitTarget = productUseExitTarget({ source, observationId, eventId });
  const fromSavedObservation = source === 'after_observation';
  const [draft, setDraft] = useState(() => createProductUseDraft(new Date(), () => flowId));
  const [products, setProducts] = useState<PersonalProduct[]>([]);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [customFormOpen, setCustomFormOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedProductUseId, setSavedProductUseId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(
    fromSavedObservation ? '照片已保存，正在读取后台分析状态。' : null,
  );
  const firstProductLoad = useRef(true);
  const storageQueue = useRef(Promise.resolve());

  const finish = useCallback(() => {
    if (source !== 'after_observation' && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(exitTarget as Href);
  }, [exitTarget, source]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (saving) return true;
        if (customFormOpen) setCustomFormOpen(false);
        else finish();
        return true;
      });
      return () => subscription.remove();
    }, [customFormOpen, finish, saving]),
  );

  useEffect(() => {
    if (!user) return;
    let active = true;
    void loadProductUseSession(user.user_id, flowId).then((session) => {
      if (!active) return;
      setDraft(session.draft);
      setSavedProductUseId(session.savedProductUseId);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [flowId, user]);

  useEffect(() => {
    if (!hydrated || !user) return;
    storageQueue.current = storageQueue.current
      .catch(() => undefined)
      .then(() =>
        saveProductUseSession(user.user_id, flowId, draft, savedProductUseId),
      )
      .catch(() => undefined);
  }, [draft, flowId, hydrated, savedProductUseId, user]);

  const reloadProducts = useCallback(async () => {
    const nextProducts = sortPersonalProducts(await listPersonalProducts(request));
    setProducts(nextProducts);
    if (firstProductLoad.current) {
      firstProductLoad.current = false;
      setSearchOpen(nextProducts.length === 0);
    }
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

  useFocusEffect(
    useCallback(() => {
      if (!observationId) return undefined;
      let active = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const load = async () => {
        try {
          const observation = await getObservation(request, observationId);
          if (!active) return;
          setAnalysisStatus(productUseObservationStatus(observation.targets));
          if (shouldPollObservationTargets(observation.targets)) {
            timer = setTimeout(() => void load(), 1800);
          }
        } catch {
          if (active) {
            setAnalysisStatus('照片已保存，分析状态暂时无法读取；可在观察详情重新查看。');
          }
        }
      };
      void load();
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    }, [observationId, request]),
  );

  async function saveUse(intent: ProductUseSubmissionIntent) {
    if (saving) return;
    if (savedProductUseId) {
      finish();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await createProductUse(request, buildProductUseInput(draft, intent));
      setSavedProductUseId(saved.product_use_id);
      if (user) {
        storageQueue.current = storageQueue.current
          .catch(() => undefined)
          .then(() =>
            saveProductUseSession(
              user.user_id,
              flowId,
              draft,
              saved.product_use_id,
            ),
          );
        await storageQueue.current;
      }
      try {
        finish();
      } catch {
        setError('使用记录已保存。返回页面暂时失败，请点击下方按钮继续。');
      }
    } catch (saveError) {
      setError(userFacingError(saveError));
    } finally {
      setSaving(false);
    }
  }

  const selectionCount = draft.productIds.length;

  return (
    <AppScreen
      backgroundColor={colors.paper}
      contentStyle={styles.screen}
      safeAreaEdges={['left', 'right', 'bottom']}
      variant="form">
      <Stack.Screen
        options={{
          gestureEnabled: false,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              accessibilityLabel="取消记录产品使用"
              accessibilityRole="button"
              disabled={saving}
              hitSlop={8}
              onPress={finish}
              style={styles.headerCancel}>
              <Text style={styles.headerCancelText}>取消</Text>
            </Pressable>
          ),
          headerShadowVisible: false,
          headerShown: true,
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.mossDeep,
          title: '记录产品使用',
        }}
      />

      <View style={styles.header}>
        {fromSavedObservation ? <Text style={styles.savedEyebrow}>照片已保存</Text> : null}
        <EditorialText role="pageTitle" style={styles.title}>今天用了哪些产品？</EditorialText>
        <Text style={styles.description}>只记录截至现在真实发生的使用，不需要填完全天。</Text>
      </View>

      {analysisStatus ? <InlineNotice tone="info" message={analysisStatus} /> : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}

      {savedProductUseId ? (
        <View style={styles.savedPanel}>
          <Text style={styles.savedTitle}>使用记录已保存</Text>
          <Text style={styles.hint}>服务器已确认这次记录，不会再次提交。</Text>
          <AppButton label="查看刚才的观察" onPress={finish} />
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>常用与最近产品</Text>
                <Text style={styles.hint}>按真实使用次数与最近时间排列，不会默认勾选。</Text>
              </View>
              {selectionCount ? <Text style={styles.selectionCount}>已选 {selectionCount}</Text> : null}
            </View>

            {products.length ? (
              <View style={styles.productList}>
                {products.map((product) => {
                  const selected = draft.productIds.includes(product.product_id);
                  return (
                    <Pressable
                      accessibilityLabel={`${selected ? '取消选择' : '选择'}${product.name}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={product.product_id}
                      onPress={() =>
                        setDraft((current) => ({
                          ...current,
                          productIds: toggleProductSelection(current.productIds, product.product_id),
                        }))
                      }
                      style={({ pressed }) => [
                        styles.productRow,
                        selected && styles.productRowSelected,
                        pressed && styles.pressed,
                      ]}>
                      <ProductImage
                        accessibilityLabel={`${product.name} 产品图片`}
                        category={null}
                        expiresAt={product.image_expires_at}
                        onRefresh={() => getPersonalProduct(request, product.product_id)}
                        size={58}
                        uri={product.image_url}
                      />
                      <View style={styles.productCopy}>
                        <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
                        <Text numberOfLines={1} style={styles.productMeta}>
                          {product.use_count > 0 ? `已记录 ${product.use_count} 次 · ` : ''}
                          {productLastUsedLabel(product.last_used_at)}
                        </Text>
                      </View>
                      <View style={[styles.check, selected && styles.checkSelected]}>
                        <Text style={[styles.checkLabel, selected && styles.checkLabelSelected]}>
                          {selected ? '✓' : ''}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.empty}>产品柜还是空的，可以直接搜索目录或自建产品。</Text>
            )}

            {!searchOpen ? (
              <AppButton label="搜索或添加产品" onPress={() => setSearchOpen(true)} variant="secondary" />
            ) : (
              <View style={styles.searchPanel}>
                {products.length ? (
                  <AppButton
                    label="收起搜索"
                    onPress={() => {
                      setCustomFormOpen(false);
                      setSearchOpen(false);
                    }}
                    variant="text"
                  />
                ) : null}
                <ProductSearchPicker
                  customFormOpen={customFormOpen}
                  onCustomFormOpenChange={setCustomFormOpen}
                  onOpenStandard={(standardProductId) =>
                    router.push(`/product-catalog/${standardProductId}` as Href)
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
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>使用时间与备注</Text>
                <Text style={styles.time}>{formatUsedAt(draft.usedAt)}</Text>
              </View>
              <AppButton label={detailsOpen ? '收起' : '修改'} onPress={() => setDetailsOpen((open) => !open)} variant="text" />
            </View>

            {detailsOpen ? (
              <View style={styles.details}>
                <View style={styles.timeButtons}>
                  <View style={styles.halfButton}><AppButton label="修改日期" onPress={() => setPicker('date')} variant="secondary" /></View>
                  <View style={styles.halfButton}><AppButton label="修改时间" onPress={() => setPicker('time')} variant="secondary" /></View>
                </View>
                {picker ? (
                  <ProductUseDateTimePicker
                    accentColor={colors.mossDeep}
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
                <Text style={styles.fieldLabel}>备注（选填）</Text>
                <TextInput
                  accessibilityLabel="产品使用备注"
                  maxLength={500}
                  multiline
                  onChangeText={(note) => setDraft((current) => ({ ...current, note }))}
                  placeholder="只记录真实发生的使用情况"
                  placeholderTextColor={colors.textMuted}
                  style={styles.note}
                  textAlignVertical="top"
                  value={draft.note}
                />
                <Text style={styles.counter}>{draft.note.length}/500</Text>
              </View>
            ) : null}
          </View>

          <InlineNotice tone="info" message="产品使用只作为同时段事实，不代表与皮肤状态存在关联或疗效。" />

          <View style={styles.actions}>
            <AppButton
              disabled={!hydrated || selectionCount === 0}
              label="保存使用记录"
              loading={saving}
              onPress={() => void saveUse('selected')}
            />
            {selectionCount === 0 ? (
              <AppButton
                disabled={!hydrated || saving}
                label="用过，但暂不注明产品"
                onPress={() => void saveUse('unnamed')}
                variant="secondary"
              />
            ) : null}
            <View style={styles.exitChoices}>
              <AppButton disabled={saving} label="今天还没用" onPress={finish} variant="text" />
              <Text style={styles.exitHint}>只表示截至现在还没用，不代表全天。</Text>
              <AppButton
                disabled={saving}
                label={fromSavedObservation ? '暂时跳过' : '取消'}
                onPress={finish}
                variant="text"
              />
            </View>
          </View>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.hero },
  headerCancel: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerCancelText: { color: colors.mossDeep, fontSize: 15, fontWeight: '600' },
  header: { gap: spacing.sm },
  savedEyebrow: { color: colors.mossDeep, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 38, fontWeight: '400' },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  sectionTitle: { color: colors.earth, fontSize: 17, fontWeight: '700' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  selectionCount: { color: colors.mossDeep, fontSize: 13, fontWeight: '700' },
  productList: { gap: spacing.sm },
  productRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.md, backgroundColor: colors.paperElevated, padding: spacing.sm },
  productRowSelected: { borderColor: colors.mossDeep, backgroundColor: colors.sageSoft },
  productCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  productName: { color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  productMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  check: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.hairline, borderRadius: 14, backgroundColor: colors.paperElevated },
  checkSelected: { borderColor: colors.mossDeep, backgroundColor: colors.mossDeep },
  checkLabel: { color: colors.textMuted, fontSize: 16, lineHeight: 18 },
  checkLabelSelected: { color: colors.paperElevated },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 21, borderRadius: radii.md, backgroundColor: colors.paperElevated, padding: spacing.lg },
  searchPanel: { gap: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.sageSoft, padding: spacing.lg },
  time: { color: colors.mossDeep, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  details: { gap: spacing.md },
  timeButtons: { flexDirection: 'row', gap: spacing.sm },
  halfButton: { flex: 1 },
  fieldLabel: { color: colors.earth, fontSize: 14, fontWeight: '700' },
  note: { minHeight: 112, borderWidth: 1, borderColor: colors.hairline, borderRadius: radii.md, backgroundColor: colors.paperElevated, color: colors.earth, fontSize: 16, lineHeight: 23, padding: spacing.lg },
  counter: { alignSelf: 'flex-end', color: colors.textMuted, fontSize: 12 },
  actions: { gap: spacing.sm },
  exitChoices: { gap: spacing.xs, marginTop: spacing.sm },
  exitHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  savedPanel: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.paperElevated, padding: spacing.xl },
  savedTitle: { color: colors.earth, fontSize: 18, fontWeight: '700' },
  pressed: { opacity: 0.78 },
});
