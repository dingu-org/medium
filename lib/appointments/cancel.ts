import { transitionAppointment } from './state';
import type { AppointmentMutationResult } from './types';

export async function cancelAppointment(input: {
  accountId: string;
  appointmentId: string;
  customerId?: string;
  reason?: string;
  cancelledBy: 'customer' | 'account' | 'ai';
  origin?: 'conversation' | 'account';
}): Promise<AppointmentMutationResult> {
  return transitionAppointment({
    ...input,
    nextStatus: 'cancelled',
  });
}
