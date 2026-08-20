import { ApiError } from '@/lib/api';

export function userFacingError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return '发生了意外错误，请稍后再试。';
  }
  if (error.status === 0) {
    return error.message;
  }
  if (error.status === 401) {
    return '邮箱或密码不正确，或登录已经过期。';
  }
  if (error.status === 409) {
    return '这个邮箱已经注册，请直接登录。';
  }
  if (error.status === 422) {
    return '提交内容不符合要求，请检查后再试。';
  }
  return error.message;
}
