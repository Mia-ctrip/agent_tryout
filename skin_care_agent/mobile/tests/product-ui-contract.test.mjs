import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function source(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}


test('product picker exposes the searchable catalog boundary and accessible entry point', () => {
  const picker = source('../src/components/product-search-picker.tsx');
  assert.match(picker, /accessibilityLabel="搜索或添加产品"/);
  assert.match(picker, /搜索结果仅用于记录，不代表推荐/);
  assert.match(picker, /250/);
  assert.match(picker, /shouldOfferCustomProduct/);
  assert.match(picker, /!customOpen[\s\S]*<CustomProductForm/);
  assert.match(picker, /Keyboard\.dismiss\(\)/);
});


test('custom product form keeps image optional with capture, library, retry and removal controls', () => {
  const form = source('../src/components/custom-product-form.tsx');
  assert.match(form, /拍摄产品图片/);
  assert.match(form, /从相册选择/);
  assert.match(form, /重试上传/);
  assert.match(form, /移除图片/);
});


test('standard detail shows original sourced material without recommendation language', () => {
  const detail = source('../src/app/product-catalog/[standardProductId].tsx');
  assert.match(detail, /【适应症】原文/);
  assert.match(detail, /官方来源/);
  assert.match(detail, /不构成诊断或使用建议/);
  assert.doesNotMatch(detail, /推荐使用|适合你的皮肤/);
});


test('products tab keeps one add entry, usage sorting, and no record-use action', () => {
  const products = source('../src/app/(tabs)/products.tsx');
  assert.match(products, /我的产品/);
  assert.match(products, /按使用频次排列/);
  assert.match(products, /productCabinetSummary/);
  assert.match(products, /\/product\/new/);
  assert.match(products, /SwipeableProductRow/);
  assert.doesNotMatch(products, /记录一次使用|常用优先/);
});


test('personal product detail renders compact facts and the official manual in place', () => {
  const detail = source('../src/app/product/[productId].tsx');
  assert.match(detail, /官方说明书/);
  assert.match(detail, /getStandardProduct/);
  assert.match(detail, /累计使用/);
  assert.match(detail, /最近使用/);
  assert.doesNotMatch(detail, /记录一次使用|product-catalog/);
});


test('add product is a dedicated live-search route with no-match creation', () => {
  const add = source('../src/app/product/new.tsx');
  assert.match(add, /添加产品/);
  assert.match(add, /ProductSearchPicker/);
  assert.match(add, /router\.back/);
});
