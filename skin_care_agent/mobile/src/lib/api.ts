import { Platform } from 'react-native';

const localApiUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/api/v1'
    : 'http://127.0.0.1:8000/api/v1';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL?.trim() || localApiUrl).replace(
  /\/$/,
  '',
);

type FastApiError = {
  detail?: unknown;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'object' && item !== null && 'msg' in item) {
          return String(item.msg);
        }
        return null;
      })
      .filter((message): message is string => message !== null);
    return messages.length > 0 ? messages.join('；') : null;
  }
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    return String(detail.message);
  }
  return null;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', 'Bearer ' + accessToken);
  }

  let response: Response;
  try {
    response = await fetch(API_BASE_URL + path, { ...init, headers });
  } catch (error) {
    throw new ApiError(0, '无法连接服务器，请检查网络和 API 地址。', error);
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    const detail = (payload as FastApiError | undefined)?.detail;
    throw new ApiError(
      response.status,
      detailMessage(detail) ?? '请求失败，请稍后再试。',
      detail,
    );
  }
  return payload as T;
}
