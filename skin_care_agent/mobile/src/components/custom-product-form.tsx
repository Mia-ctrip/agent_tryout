import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{editingProduct ? '编辑自建产品' : '自定义产品资料'}</Text>
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
      {image || editingProduct ? (
        <View style={styles.preview}>
          <ProductImage accessibilityLabel="产品图片预览" category={null} radius={radii.md} size={112} variant="archive" uri={previewUri}
            expiresAt={!image && !removeImage ? editingProduct?.image_expires_at : null}
            onRefresh={!image && !removeImage && editingProduct ? () => getPersonalProduct(request, editingProduct.product_id) : undefined} />
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
      <ProductFormButton label={editingProduct ? '保存修改' : '创建并加入产品柜'} loading={saving} onPress={() => void save()} primary />
      <ProductFormButton label={editingProduct ? '取消修改' : '取消新增'} disabled={saving} onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
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
