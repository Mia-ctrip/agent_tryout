import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { productColors } from '@/constants/product-theme';
import { radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { productImageFromPickerAsset } from '@/lib/product-image-picker';
import { buildCustomProductForm, createCustomProduct } from '@/lib/product-api';
import type { NativePhotoFile } from '@/lib/observation-api';
import { validateProductName } from '@/lib/product-use-flow';
import { useSession } from '@/providers/session-provider';

function ProductFormButton({
  label,
  onPress,
  primary = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
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
  onCreated,
}: {
  initialName?: string;
  onCreated: (productId: number) => void;
}) {
  const { request } = useSession();
  const [name, setName] = useState(initialName);
  const [requestId, setRequestId] = useState(() => createClientRequestId());
  const [image, setImage] = useState<NativePhotoFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseImage(fromCamera: boolean) {
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
    if (!result.canceled && result.assets[0]) {
      setImage(productImageFromPickerAsset(result.assets[0]));
      setError(null);
    }
  }

  async function save() {
    if (saving) return;
    const validation = validateProductName(name);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const product = await createCustomProduct(
        request,
        buildCustomProductForm({ clientRequestId: requestId, name: validation.value, image: image || undefined }),
      );
      onCreated(product.product_id);
      setName('');
      setImage(null);
      setRequestId(createClientRequestId());
    } catch (saveError) {
      setError(userFacingError(saveError));
    } finally {
      setSaving(false);
    }
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
      />
      {image ? (
        <View style={styles.preview}>
          <ProductImage accessibilityLabel="待上传的产品图片" category={null} radius={16} size={112} uri={image.uri} />
          <Pressable accessibilityRole="button" onPress={() => setImage(null)}>
            <Text style={styles.remove}>移除图片</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.imageActions}>
        <View style={styles.actionCell}><ProductFormButton label="拍摄产品图片" onPress={() => void chooseImage(true)} /></View>
        <View style={styles.actionCell}><ProductFormButton label="从相册选择" onPress={() => void chooseImage(false)} /></View>
      </View>
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {error && image ? <ProductFormButton label="重试上传" onPress={() => void save()} /> : null}
      <ProductFormButton label="创建并加入产品柜" loading={saving} onPress={() => void save()} primary />
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
