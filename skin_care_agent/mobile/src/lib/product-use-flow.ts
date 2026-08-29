import { createClientRequestId } from './client-request-id.ts';
import type { CreateProductUseInput } from './product-api.ts';


export type ProductUseDraft = {
  clientRequestId: string;
  usedAt: Date;
  productIds: number[];
  note: string;
};

export type ProductNameValidation =
  | { ok: true; value: string }
  | { ok: false; message: string };

export function createProductUseDraft(
  now: Date = new Date(),
  idFactory: () => string = createClientRequestId,
): ProductUseDraft {
  return {
    clientRequestId: idFactory(),
    usedAt: new Date(now.getTime()),
    productIds: [],
    note: '',
  };
}

export function toggleProductSelection(current: number[], productId: number): number[] {
  const next = current.includes(productId)
    ? current.filter((value) => value !== productId)
    : [...current, productId];
  return [...new Set(next)].sort((left, right) => left - right);
}

export function validateProductName(name: string): ProductNameValidation {
  const value = name.trim();
  if (!value) {
    return { ok: false, message: '请输入产品名称。' };
  }
  if (value.length > 120) {
    return { ok: false, message: '产品名称不能超过 120 字。' };
  }
  return { ok: true, value };
}

export function buildProductUseInput(draft: ProductUseDraft): CreateProductUseInput {
  const note = draft.note.trim();
  if (note.length > 500) {
    throw new Error('备注不能超过 500 字。');
  }
  return {
    clientRequestId: draft.clientRequestId,
    usedAt: draft.usedAt.toISOString(),
    timezoneOffsetMinutes: -draft.usedAt.getTimezoneOffset(),
    productIds: [...new Set(draft.productIds)].sort((left, right) => left - right),
    note: note || null,
  };
}

export function formatUsedAt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function mergeUsedAtPart(
  current: Date,
  selected: Date,
  part: 'date' | 'time',
): Date {
  const next = new Date(current.getTime());
  if (part === 'date') {
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
  } else {
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  }
  return next;
}
