import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analysisFailureMessage,
  analysisViewLabel,
  analysisViewStatusLabel,
  severityLabel,
} from '../src/lib/analysis-presenter.ts';

test('severityLabel describes appearance without a diagnosis', () => {
  assert.equal(severityLabel(null), '暂无结果');
  assert.equal(severityLabel(2), '轻微');
  assert.equal(severityLabel(5), '中等');
  assert.equal(severityLabel(8), '较明显');
});

test('analysisViewStatusLabel exposes progress and retry states', () => {
  assert.equal(analysisViewStatusLabel('pending'), '等待分析');
  assert.equal(analysisViewStatusLabel('analyzing'), '正在分析');
  assert.equal(analysisViewStatusLabel('success'), '分析完成');
  assert.equal(analysisViewStatusLabel('failed'), '需要重试');
});

test('analysisViewLabel uses the standard three-view labels', () => {
  assert.equal(analysisViewLabel('front'), '正面');
  assert.equal(analysisViewLabel('left'), '左侧');
  assert.equal(analysisViewLabel('right'), '右侧');
});

test('analysisFailureMessage maps provider and quota failures to actionable copy', () => {
  assert.equal(
    analysisFailureMessage({ status: 502, message: 'provider unavailable' }),
    'AI 分析暂时不可用，请稍后重试这个视角。',
  );
  assert.equal(
    analysisFailureMessage({ status: 429, message: 'quota exceeded' }),
    '今日分析次数已用完，请明天再试。',
  );
  assert.equal(
    analysisFailureMessage({ status: 0, message: '无法连接服务器' }),
    '无法连接服务器',
  );
});
