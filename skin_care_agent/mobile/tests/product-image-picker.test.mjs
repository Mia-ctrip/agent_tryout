import assert from 'node:assert/strict';
import test from 'node:test';

import * as productImagePicker from '../src/lib/product-image-picker.ts';

const { productImageFromPickerAsset } = productImagePicker;


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

test('picker results preserve a selected image and treat system cancellation as no change', () => {
  assert.equal(typeof productImagePicker.productImageFromPickerResult, 'function');
  assert.deepEqual(
    productImagePicker.productImageFromPickerResult({
      canceled: false,
      assets: [{ uri: 'file:///cache/new.jpg', fileName: null, mimeType: null }],
    }),
    { uri: 'file:///cache/new.jpg', name: 'product-image.jpg', type: 'image/jpeg' },
  );
  assert.equal(
    productImagePicker.productImageFromPickerResult({ canceled: true, assets: null }),
    null,
  );
});
