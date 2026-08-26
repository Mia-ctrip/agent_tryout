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
