import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const result = readFileSync(
  fileURLToPath(new URL('../src/components/observation-result.tsx', import.meta.url)),
  'utf8',
);

test('result reads as regional conclusion, evidence, full facts, user words, then boundaries', () => {
  const markers = [
    '本次观察结论',
    '原始照片 · 未修饰',
    '完整小结',
    '你的记录',
    '不是医学诊断',
  ];
  const positions = markers.map((marker) => result.indexOf(marker));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(result, /时间上的相邻也不代表产品造成了变化/);
});

test('result keeps decoration out of evidence and removes the disabled trend card', () => {
  const evidence = result.slice(
    result.indexOf('原始照片 · 未修饰'),
    result.indexOf('你的记录'),
  );

  assert.doesNotMatch(evidence, /BotanicalTrace|EditorialCollage/);
  assert.doesNotMatch(result, /趋势对比|model\.comparison/);
  assert.match(result, /card\.highlights\.map/);
  assert.match(result, /pagingEnabled/);
  assert.match(result, /accessibilityState=\{\{ expanded \}\}/);
});
