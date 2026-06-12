import { withAdvisoryLock } from '@/lib/db/advisory-lock';

export function withAppointmentLock<T>(
  ptId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withAdvisoryLock(`appointments:${ptId}`, fn);
}
