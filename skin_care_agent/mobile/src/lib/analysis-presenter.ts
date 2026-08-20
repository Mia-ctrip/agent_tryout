import type { AnalysisViewStatus } from './analysis-flow.ts';
import type { CheckInViewType } from './check-in-flow.ts';

export function severityLabel(severity: number | null): string {
  if (severity === null) {
    return '暂无结果';
  }
  if (severity <= 3) {
    return '轻微';
  }
  if (severity <= 6) {
    return '中等';
  }
  return '较明显';
}

export function analysisViewStatusLabel(status: AnalysisViewStatus): string {
  switch (status) {
    case 'pending':
      return '等待分析';
    case 'analyzing':
      return '正在分析';
    case 'success':
      return '分析完成';
    case 'failed':
      return '需要重试';
  }
}

export function analysisViewLabel(viewType: CheckInViewType): string {
  switch (viewType) {
    case 'front':
      return '正面';
    case 'left':
      return '左侧';
    case 'right':
      return '右侧';
  }
}

export function analysisFailureMessage(error: unknown): string {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('status' in error) ||
    typeof error.status !== 'number' ||
    !('message' in error) ||
    typeof error.message !== 'string'
  ) {
    return '这个视角分析失败，请稍后重试。';
  }
  if (error.status === 0) {
    return error.message;
  }
  if (error.status === 429) {
    return '今日分析次数已用完，请明天再试。';
  }
  if (error.status === 422) {
    return '分析结果格式异常，请重试这个视角。';
  }
  if (error.status === 502) {
    return 'AI 分析暂时不可用，请稍后重试这个视角。';
  }
  return '这个视角分析失败，请稍后重试。';
}
