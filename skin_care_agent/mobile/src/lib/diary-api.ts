import type {
  AuthenticatedRequest,
  CheckIn,
  CheckInDiary,
} from './check-in-api.ts';

export async function replaceCheckInDiary(
  request: AuthenticatedRequest,
  checkInId: number,
  diary: CheckInDiary,
): Promise<CheckIn> {
  return request<CheckIn>(`/check-ins/${checkInId}/diary`, {
    method: 'PUT',
    body: JSON.stringify(diary),
  });
}
