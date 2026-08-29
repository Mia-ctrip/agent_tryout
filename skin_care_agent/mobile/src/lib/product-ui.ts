import type { PersonalProduct } from './product-api.ts';

type ProductOrderItem = Pick<PersonalProduct, 'product_id' | 'use_count' | 'last_used_at'>;

function timestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortPersonalProducts<T extends ProductOrderItem>(products: readonly T[]): T[] {
  return [...products].sort((left, right) => {
    if (right.use_count !== left.use_count) return right.use_count - left.use_count;
    const dateDifference = timestamp(right.last_used_at) - timestamp(left.last_used_at);
    if (dateDifference !== 0) return dateDifference;
    return left.product_id - right.product_id;
  });
}

export function productCabinetSummary(products: readonly Pick<PersonalProduct, 'use_count'>[]): string {
  const totalUses = products.reduce((total, product) => total + product.use_count, 0);
  return `${products.length} 件产品 · 已记录 ${totalUses} 次使用`;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function productLastUsedLabel(value: string | null, now = new Date()): string {
  if (!value) return '尚无使用记录';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '最近使用时间待确认';
  if (sameLocalDay(date, now)) return '最后使用：今天';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return '最后使用：昨天';
  return `最后使用：${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function shouldOfferCustomProduct({
  query,
  loading,
  resultCount,
  error,
}: {
  query: string;
  loading: boolean;
  resultCount: number;
  error: string | null;
}): boolean {
  return Boolean(query.trim()) && !loading && !error && resultCount === 0;
}

export const ARCHIVE_REVEAL_WIDTH = 88;

export function archiveRevealTarget(translationX: number): 0 | -88 {
  return translationX <= -44 ? -88 : 0;
}

export function formatProductUseDate(value: string, timezoneOffsetMinutes: number): string {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return '记录时间待确认';
  const local = new Date(instant.getTime() + timezoneOffsetMinutes * 60_000);
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return `${local.getUTCMonth() + 1} 月 ${local.getUTCDate()} 日 · ${hours}:${minutes}`;
}
