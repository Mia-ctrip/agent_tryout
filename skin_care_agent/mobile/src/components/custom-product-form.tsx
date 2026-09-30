import * as ImagePicker from 'expo-image-picker';
import { Image as DecorativeImage } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EditorialText } from '@/components/editorial-text';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import { radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { productImageFromPickerResult } from '@/lib/product-image-picker';
import { buildCustomProductForm, buildCustomProductUpdateForm, createCustomProduct, getPersonalProduct, updateCustomProduct } from '@/lib/product-api';
import type { PersonalProduct } from '@/lib/product-api';
import type { NativePhotoFile } from '@/lib/observation-api';
import { validateProductName } from '@/lib/product-use-flow';
import { useSession } from '@/providers/session-provider';

function ProductFormButton({
  label,
  onPress,
  primary = false,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading || disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, primary ? styles.primaryButton : styles.secondaryButton, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={productColors.surface} /> : (
        <Text style={primary ? styles.primaryButtonText : styles.secondaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function CustomProductForm({
  initialName = '',
  editingProduct,
  onCancel,
  onSaved,
  onSavingChange,
}: {
  initialName?: string;
  editingProduct?: PersonalProduct;
  onCancel: () => void;
  onSaved: (product: PersonalProduct) => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { request } = useSession();
  const [name, setName] = useState(editingProduct?.name ?? initialName);
  const [requestId, setRequestId] = useState(() => createClientRequestId());
  const [image, setImage] = useState<NativePhotoFile | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [removeImage, setRemoveImage] = useState(false);
  const previewUri = image?.uri ?? (removeImage ? null : editingProduct?.image_url ?? null);
  const [error, setError] = useState<string | null>(null);

  async function chooseImage(fromCamera: boolean) {
    if (savingRef.current) return;
    try {
      if (fromCamera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('需要相机权限才能拍摄产品图片。');
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const selected = productImageFromPickerResult(result);
      if (selected) {
        setImage(selected);
        setRemoveImage(false);
        setError(null);
      }
    } catch (pickerError) {
      setError(userFacingError(pickerError));
    }
  }

  async function save() {
    if (savingRef.current) return;
    const validation = validateProductName(name);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    savingRef.current = true;
    onSavingChange?.(true);
    setError(null);
    try {
      const upload = Platform.OS === 'web' ? undefined : image || undefined;
      const form = editingProduct
        ? buildCustomProductUpdateForm({ name: validation.value, image: upload, removeImage })
        : buildCustomProductForm({ clientRequestId: requestId, name: validation.value, image: upload });
      if (Platform.OS === 'web' && image) {
        const response = await fetch(image.uri);
        (form as FormData).append('file', await response.blob(), image.name);
      }
      const product = editingProduct
        ? await updateCustomProduct(request, editingProduct.product_id, form)
        : await createCustomProduct(request, form);
      onSaved(product);
      setName('');
      setImage(null);
      setRequestId(createClientRequestId());
    } catch (saveError) {
      setError(userFacingError(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  }

  if (editingProduct) {
    return (
      <View style={styles.editPage}>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.botanicalAccent, styles.botanicalTopRight]}>
          <DecorativeImage accessible={false} source={{ uri: botanicalArtworkUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.botanicalAccent, styles.botanicalBottomLeft]}>
          <DecorativeImage accessible={false} source={{ uri: botanicalArtworkUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </View>

        <View style={styles.editHeader}>
          <Pressable
            accessibilityLabel="返回产品详情"
            accessibilityRole="button"
            disabled={saving}
            hitSlop={10}
            onPress={onCancel}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              size={28}
              tintColor={productColors.iconStrong}
              weight="medium"
            />
          </Pressable>
          <EditorialText role="pageTitle" style={styles.editPageTitle}>编辑产品</EditorialText>
          <Pressable
            accessibilityLabel="保存产品修改"
            accessibilityRole="button"
            disabled={saving}
            hitSlop={10}
            onPress={() => void save()}
            style={({ pressed }) => [styles.saveAction, pressed && styles.pressed]}>
            {saving
              ? <ActivityIndicator color={productColors.actionPrimary} size="small" />
              : <Text style={styles.saveActionText}>保存</Text>}
          </Pressable>
        </View>

        <View style={styles.editContent}>
          <View style={styles.kickerRow}>
            <EditorialText role="metadata" style={styles.kicker}>PRODUCT DETAILS</EditorialText>
            <View style={styles.kickerLine} />
          </View>

          <View style={styles.editSection}>
            <EditorialText role="sectionTitle" style={styles.editLabel}>产品名称</EditorialText>
            <TextInput
              accessibilityLabel="自建产品名称"
              editable={!saving}
              maxLength={120}
              onChangeText={setName}
              placeholder="输入产品名称"
              placeholderTextColor={productColors.textSecondary}
              selectionColor={productColors.focus}
              style={styles.editInput}
              value={name}
            />
          </View>

          <View style={styles.photoSection}>
            <EditorialText role="sectionTitle" style={styles.editLabel}>产品图片</EditorialText>
            <View accessibilityLabel={previewUri ? undefined : '产品图片预览，暂无图片'} style={styles.photoFrame}>
              {previewUri ? (
                <ProductImage
                  accessibilityLabel="产品图片预览"
                  category={null}
                  expiresAt={!image && !removeImage ? editingProduct.image_expires_at : null}
                  onRefresh={!image && !removeImage ? () => getPersonalProduct(request, editingProduct.product_id) : undefined}
                  radius={radii.sm}
                  size={142}
                  uri={previewUri}
                  variant="archive"
                />
              ) : (
                <DecorativeImage
                  accessible={false}
                  source={require('../../assets/brand/product-placeholder.png')}
                  contentFit="contain"
                  style={styles.emptyPhotoArtwork}
                />
              )}
            </View>
            {previewUri ? (
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                hitSlop={8}
                onPress={() => { setImage(null); setRemoveImage(true); }}>
                <Text style={styles.remove}>移除图片</Text>
              </Pressable>
            ) : null}
            <Text style={styles.photoHint}>上传产品照片，方便日后快速识别该产品</Text>
          </View>

          <View style={styles.editImageActions}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void chooseImage(true)}
              style={({ pressed }) => [styles.imageActionButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }}
                size={23}
                tintColor={productColors.actionPrimary}
                weight="regular"
              />
              <Text style={styles.imageActionText}>拍摄产品照片</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void chooseImage(false)}
              style={({ pressed }) => [styles.imageActionButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'photo', android: 'image', web: 'image' }}
                size={23}
                tintColor={productColors.actionPrimary}
                weight="regular"
              />
              <Text style={styles.imageActionText}>从相册选择</Text>
            </Pressable>
          </View>

          {error ? <InlineNotice tone="error" message={error} /> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>自定义产品资料</Text>
      <TextInput
        accessibilityLabel="自建产品名称"
        maxLength={120}
        onChangeText={setName}
        placeholder="输入产品名称"
        placeholderTextColor={productColors.textSecondary}
        style={styles.input}
        value={name}
        editable={!saving}
      />
      {image ? (
        <View style={styles.preview}>
          <ProductImage accessibilityLabel="产品图片预览" category={null} radius={radii.md} size={112} variant="archive" uri={previewUri} />
          {previewUri ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setImage(null); setRemoveImage(true); }}>
            <Text style={styles.remove}>移除图片</Text>
          </Pressable> : null}
        </View>
      ) : null}
      <View style={styles.imageActions}>
        <View style={styles.actionCell}><ProductFormButton label="拍摄产品图片" disabled={saving} onPress={() => void chooseImage(true)} /></View>
        <View style={styles.actionCell}><ProductFormButton label="从相册选择" disabled={saving} onPress={() => void chooseImage(false)} /></View>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {error && image ? <ProductFormButton label="重试上传" onPress={() => void save()} /> : null}
      <ProductFormButton label="创建并加入产品柜" loading={saving} onPress={() => void save()} primary />
      <ProductFormButton label="取消新增" disabled={saving} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  editPage: { minHeight: 720, paddingBottom: spacing.ritual, position: 'relative' },
  botanicalAccent: { position: 'absolute', width: 120, height: 160, opacity: 0.16 },
  botanicalTopRight: { top: spacing.hero, right: -40 },
  botanicalBottomLeft: { bottom: -128, left: -40, transform: [{ scaleX: -1 }] },
  editHeader: { minHeight: 52, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headerAction: { width: 48, minHeight: 48, alignItems: 'flex-start', justifyContent: 'center' },
  editPageTitle: { color: productColors.textPrimary, fontSize: 28, lineHeight: 36, textAlign: 'center' },
  saveAction: { minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
  saveActionText: { color: productColors.actionPrimary, fontSize: 18, lineHeight: 26 },
  editContent: { gap: spacing.xxxl, paddingTop: spacing.hero },
  kickerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xl },
  kicker: { color: productColors.brand, flexShrink: 0, fontSize: 12, letterSpacing: 3.2 },
  kickerLine: { height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: productColors.border },
  editSection: { gap: spacing.lg },
  editLabel: { alignSelf: 'stretch', color: productColors.textPrimary, fontSize: 22, lineHeight: 30 },
  editInput: {
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: productColors.border,
    borderRadius: radii.md,
    backgroundColor: `${productColors.surface}99`,
    color: productColors.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    paddingHorizontal: spacing.lg,
  },
  photoSection: { alignItems: 'center', gap: spacing.md },
  photoFrame: {
    width: 174,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: productColors.brand,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    marginTop: spacing.sm,
  },
  emptyPhotoArtwork: { width: 142, height: 142 },
  photoHint: { color: productColors.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  editImageActions: { flexDirection: 'row', gap: spacing.md },
  imageActionButton: {
    minHeight: 50,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: productColors.border,
    borderRadius: radii.md,
    backgroundColor: `${productColors.surface}80`,
    paddingHorizontal: spacing.sm,
  },
  imageActionText: { color: productColors.actionPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  form: { gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: productColors.border, paddingTop: spacing.lg, marginTop: spacing.sm },
  title: { color: productColors.textPrimary, fontSize: 15, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: productColors.border, borderRadius: radii.md, backgroundColor: productColors.surface, color: productColors.textPrimary, paddingHorizontal: spacing.lg },
  preview: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, backgroundColor: productColors.background, padding: spacing.md },
  remove: { color: productColors.danger, fontSize: 12, fontWeight: '600' },
  imageActions: { flexDirection: 'row', gap: spacing.sm },
  actionCell: { flex: 1 },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, paddingHorizontal: 12 },
  primaryButton: { backgroundColor: productColors.actionPrimary },
  secondaryButton: { borderWidth: 1, borderColor: productColors.brand, backgroundColor: productColors.surfaceMuted },
  primaryButtonText: { color: productColors.surface, fontSize: 14, fontWeight: '700' },
  secondaryButtonText: { color: productColors.actionPrimary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});

const botanicalArtworkUri = 'data:image/svg+xml;base64,' + btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240" viewBox="0 0 180 240">
    <g fill="${productColors.brand}" stroke="${productColors.actionPrimary}" stroke-width=".8" stroke-linejoin="round">
      <path d="M155 230C147 185 118 119 78 48" fill="none" stroke-width="1.5"/>
      <path d="M92 73C66 63 48 35 45 8C70 26 87 43 92 73Z"/>
      <path d="M102 95C101 65 113 43 127 27C128 57 121 83 102 95Z"/>
      <path d="M119 130C86 135 53 117 28 99C62 96 96 102 119 130Z"/>
      <path d="M127 154C123 119 138 91 159 71C159 108 149 136 127 154Z"/>
      <path d="M143 190C107 194 83 173 66 154C99 153 128 167 143 190Z"/>
      <path d="M149 209C143 181 153 162 173 144C173 174 164 195 149 209Z"/>
      <g fill="none" stroke-width=".65">
        <path d="M92 73L45 8M102 95L127 27M119 130L28 99M127 154L159 71M143 190L66 154M149 209L173 144"/>
        <path d="M77 52L63 48M68 38L68 28M111 70L121 62M110 78L106 63M88 119L77 105M75 115L57 116M138 126L135 110M144 110L154 98M119 178L110 163M106 173L94 177M159 181L156 168"/>
      </g>
    </g>
  </svg>`,
);
