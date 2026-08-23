import { withAdvisoryLock } from '@/lib/db/advisory-lock';

export function withAppointmentLock<T>(
  accountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withAdvisoryLock(`appointments:${accountId}`, fn);
}
