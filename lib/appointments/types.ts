import { appointmentStatus } from '@/lib/db/schema';

export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];

export type AppointmentRecord = {
  id: string;
  ptId: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
  status: AppointmentStatus;
  notes: string | null;
  cancelledBy: 'patient' | 'pt' | 'ai' | null;
  cancellationReason: string | null;
  createdAt: Date;
};

export type FreeSlot = {
  startsAt: string;
  endsAt: string;
};
