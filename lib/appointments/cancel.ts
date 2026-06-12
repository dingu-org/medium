import { transitionAppointment } from './state';
import type { AppointmentRecord } from './types';

export async function cancelAppointment(input: {
  ptId: string;
  appointmentId: string;
  patientId?: string;
  reason?: string;
  cancelledBy: 'patient' | 'pt' | 'ai';
}): Promise<AppointmentRecord> {
  return transitionAppointment({
    ...input,
    nextStatus: 'cancelled',
  });
}
