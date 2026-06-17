import type { AppointmentStatus } from '@/lib/appointments';
import type { ReminderInfo } from './badges';

/** Everything the appointment detail sheet renders, resolved server-side. */
export type AppointmentView = {
  id: string;
  patientName: string;
  patientPhone: string;
  patientWaId: string | null;
  conversationId: string | null;
  startsAt: string;
  endsAt: string;
  serviceType: string | null;
  status: AppointmentStatus;
  notes: string | null;
  reminder: ReminderInfo;
};
