import type { NativePhotoFile } from './observation-api.ts';

export type ProductPickerAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type ProductPickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: ProductPickerAsset[] };

export function productImageFromPickerAsset(asset: ProductPickerAsset): NativePhotoFile {
  return {
    uri: asset.uri,
    name: asset.fileName || 'product-image.jpg',
    type: asset.mimeType || 'image/jpeg',
  };
}

export function productImageFromPickerResult(
  result: ProductPickerResult,
): NativePhotoFile | null {
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('图片选择器没有返回图片。');
  return productImageFromPickerAsset(asset);
}
