import { createClientRequestId } from './client-request-id.ts';
import type { CreateProductUseInput } from './product-api.ts';


export type ProductUseDraft = {
  clientRequestId: string;
  usedAt: Date;
  productIds: number[];
  note: string;
};

export type ProductUseSubmissionIntent = 'selected' | 'unnamed';

export type ProductUseSession = {
  draft: ProductUseDraft;
  savedProductUseId: number | null;
};

export type ProductUseSessionStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
};

type ObservationStatusTarget = {
  status: 'queued' | 'processing' | 'completed' | 'needs_input';
};

const PRODUCT_USE_SESSION_KEY = 'skin-care-agent.product-use-session';

async function defaultStorage(): Promise<ProductUseSessionStorage> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      async getItemAsync(key) {
        return window.localStorage.getItem(key);
      },
      async setItemAsync(key, value) {
        window.localStorage.setItem(key, value);
      },
    };
  }
  return import('expo-secure-store');
}

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

export function buildProductUseInput(
  draft: ProductUseDraft,
  intent: ProductUseSubmissionIntent = 'selected',
): CreateProductUseInput {
  const note = draft.note.trim();
  if (note.length > 500) {
    throw new Error('备注不能超过 500 字。');
  }
  if (intent === 'selected' && draft.productIds.length === 0) {
    throw new Error('请先选择产品，或明确选择“用过，但暂不注明产品”。');
  }
  return {
    clientRequestId: draft.clientRequestId,
    usedAt: draft.usedAt.toISOString(),
    timezoneOffsetMinutes: -draft.usedAt.getTimezoneOffset(),
    productIds:
      intent === 'unnamed'
        ? []
        : [...new Set(draft.productIds)].sort((left, right) => left - right),
    note: note || null,
  };
}

function sessionKey(userId: number): string {
  return `${PRODUCT_USE_SESSION_KEY}.${userId}`;
}

function freshProductUseSession(flowId: string, now: Date): ProductUseSession {
  return {
    draft: createProductUseDraft(now, () => flowId),
    savedProductUseId: null,
  };
}

export async function loadProductUseSession(
  userId: number,
  flowId: string,
  now: Date = new Date(),
  storage?: ProductUseSessionStorage,
): Promise<ProductUseSession> {
  try {
    const resolvedStorage = storage ?? (await defaultStorage());
    const raw = await resolvedStorage.getItemAsync(sessionKey(userId));
    if (!raw) return freshProductUseSession(flowId, now);
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return freshProductUseSession(flowId, now);
    const stored = value as {
      version?: unknown;
      flowId?: unknown;
      clientRequestId?: unknown;
      usedAt?: unknown;
      productIds?: unknown;
      note?: unknown;
      savedProductUseId?: unknown;
    };
    const usedAt = new Date(typeof stored.usedAt === 'string' ? stored.usedAt : '');
    const productIds = Array.isArray(stored.productIds)
      ? [...new Set(stored.productIds.filter(
          (productId): productId is number =>
            Number.isSafeInteger(productId) && productId > 0,
        ))].sort((left, right) => left - right)
      : null;
    if (
      stored.version !== 1 ||
      stored.flowId !== flowId ||
      stored.clientRequestId !== flowId ||
      !Number.isFinite(usedAt.getTime()) ||
      productIds === null ||
      typeof stored.note !== 'string'
    ) {
      return freshProductUseSession(flowId, now);
    }
    return {
      draft: {
        clientRequestId: flowId,
        usedAt,
        productIds,
        note: stored.note,
      },
      savedProductUseId:
        typeof stored.savedProductUseId === 'number' &&
        Number.isSafeInteger(stored.savedProductUseId) &&
        stored.savedProductUseId > 0
          ? stored.savedProductUseId
          : null,
    };
  } catch {
    return freshProductUseSession(flowId, now);
  }
}

export async function saveProductUseSession(
  userId: number,
  flowId: string,
  draft: ProductUseDraft,
  savedProductUseId: number | null,
  storage?: ProductUseSessionStorage,
): Promise<void> {
  const resolvedStorage = storage ?? (await defaultStorage());
  await resolvedStorage.setItemAsync(
    sessionKey(userId),
    JSON.stringify({
      version: 1,
      flowId,
      clientRequestId: draft.clientRequestId,
      usedAt: draft.usedAt.toISOString(),
      productIds: [...new Set(draft.productIds)].sort((left, right) => left - right),
      note: draft.note,
      savedProductUseId,
    }),
  );
}

export function productUseObservationStatus(
  targets: readonly ObservationStatusTarget[],
): string {
  const pending = targets.some(
    ({ status }) => status === 'queued' || status === 'processing',
  );
  const completed = targets.some(({ status }) => status === 'completed');
  const needsInput = targets.some(({ status }) => status === 'needs_input');
  if (pending && (completed || needsInput)) {
    return '照片已保存，部分区域仍在后台分析；当前填写不会被打断。';
  }
  if (pending) return '照片已保存，AI 正在后台分析；你可以继续记录产品使用。';
  if (completed && needsInput) {
    return '照片已保存，部分区域分析已完成，其他区域可稍后重试或补充文字。';
  }
  if (completed) return '照片已保存，分析已完成；填写后即可查看本次结果。';
  if (needsInput) return '照片已保存，分析暂未完成，可稍后在观察详情重试或补充文字。';
  return '照片已保存，分析状态稍后可在观察详情查看。';
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
