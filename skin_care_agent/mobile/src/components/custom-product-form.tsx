import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { InlineNotice } from '@/components/inline-notice';
import { ProductImage } from '@/components/product-image';
import { colors, radii, spacing } from '@/constants/theme';
import { createClientRequestId } from '@/lib/client-request-id';
import { userFacingError } from '@/lib/errors';
import { productImageFromPickerAsset } from '@/lib/product-image-picker';
import { buildCustomProductForm, createCustomProduct } from '@/lib/product-api';
import type { NativePhotoFile } from '@/lib/observation-api';
import { validateProductName } from '@/lib/product-use-flow';
import { useSession } from '@/providers/session-provider';

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
      <Text style={styles.title}>没有找到产品？创建自建产品</Text>
      <TextInput
        accessibilityLabel="自建产品名称"
        maxLength={120}
        onChangeText={setName}
        placeholder="输入产品名称"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={name}
      />
      {image ? <ProductImage accessibilityLabel="待上传的产品图片" category={null} uri={image.uri} /> : null}
      <View style={styles.actions}>
        <AppButton label="拍摄产品图片" onPress={() => void chooseImage(true)} variant="secondary" />
        <AppButton label="从相册选择" onPress={() => void chooseImage(false)} variant="secondary" />
      </View>
      {image ? <AppButton label="移除图片" onPress={() => setImage(null)} variant="text" /> : null}
      {error ? <InlineNotice tone="error" message={error} /> : null}
      {error && image ? <AppButton label="重试上传" onPress={() => void save()} variant="secondary" /> : null}
      <AppButton label="创建并选中" loading={saving} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.sage, padding: spacing.lg },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: spacing.lg },
  actions: { gap: spacing.sm },
});
