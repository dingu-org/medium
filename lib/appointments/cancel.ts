import { transitionAppointment } from './state';
import type { AppointmentMutationResult } from './types';

export async function cancelAppointment(input: {
  ptId: string;
  appointmentId: string;
  patientId?: string;
  reason?: string;
  cancelledBy: 'patient' | 'pt' | 'ai';
  origin?: 'conversation' | 'pt';
}): Promise<AppointmentMutationResult> {
  return transitionAppointment({
    ...input,
    nextStatus: 'cancelled',
  });
}
