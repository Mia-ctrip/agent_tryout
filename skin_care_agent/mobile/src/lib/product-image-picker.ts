import type { NativePhotoFile } from './observation-api.ts';

export type ProductPickerAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export function productImageFromPickerAsset(asset: ProductPickerAsset): NativePhotoFile {
  return {
    uri: asset.uri,
    name: asset.fileName || 'product-image.jpg',
    type: asset.mimeType || 'image/jpeg',
  };
}
