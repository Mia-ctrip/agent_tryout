import { regionById } from './region-catalog.ts';
import type { TimelineItem } from './timeline-api.ts';

type TimelineNavigationItem =
  | Pick<Extract<TimelineItem, { kind: 'region_event' }>, 'kind' | 'event_id'>
  | Pick<
      Extract<TimelineItem, { kind: 'full_face_observation' }>,
      'kind' | 'observation_id'
    >
  | Pick<Extract<TimelineItem, { kind: 'product_use' }>, 'kind' | 'product_use_id'>;

export type TimelinePresentation = {
  eyebrow: string;
  title: string;
  detail: string;
};

function sourceLabel(sources: readonly ('photo_analysis' | 'user_record')[]): string {
  const values = new Set(sources);
  if (values.size === 0) return '等待来源';
  if (values.has('photo_analysis') && values.has('user_record')) {
    return '照片整理与用户记录';
  }
  return values.has('photo_analysis') ? '照片整理' : '用户记录';
}

export function timelineItemTarget(item: TimelineNavigationItem): string | null {
  if (item.kind === 'region_event') return `/region-event/${item.event_id}`;
  if (item.kind === 'full_face_observation') {
    return `/observation/${item.observation_id}`;
  }
  return null;
}

export function presentTimelineItem(item: TimelineItem): TimelinePresentation {
  if (item.kind === 'product_use') {
    return {
      eyebrow: '产品使用 · 用户记录',
      title: item.products.length
        ? item.products.map(({ name }) => name).join('、')
        : '未注明产品',
      detail: item.note?.trim() || '只记录当时真实使用，不代表关联或疗效。',
    };
  }
  if (item.kind === 'region_event') {
    return {
      eyebrow: `区域记录 · ${sourceLabel(item.sources)}`,
      title: regionById(item.region_id).label.replace('你的', ''),
      detail: `${item.timepoint_count} 个有效时间点 · ${
        item.status === 'current' ? '正在记录' : '已结束'
      }`,
    };
  }
  const statusLabel =
    item.target_status === 'completed'
      ? '已完成'
      : item.target_status === 'needs_input'
        ? '等待用户补充'
        : item.target_status === 'processing'
          ? '整理中'
          : '等待整理';
  return {
    eyebrow: `历史全脸 · ${sourceLabel(item.source ? [item.source] : [])}`,
    title: '全脸观察',
    detail: statusLabel,
  };
}
