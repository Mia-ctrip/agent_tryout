import assert from 'node:assert/strict';
import test from 'node:test';

import { productImageFromPickerAsset } from '../src/lib/product-image-picker.ts';


test('picker asset becomes a native file descriptor without reading bytes', () => {
  assert.deepEqual(
    productImageFromPickerAsset({
      uri: 'file:///cache/product.png',
      fileName: 'product.png',
      mimeType: 'image/png',
    }),
    { uri: 'file:///cache/product.png', name: 'product.png', type: 'image/png' },
  );
});
