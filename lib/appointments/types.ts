import { appointmentStatus } from '@/lib/db/schema';

export type AppointmentStatus = (typeof appointmentStatus.enumValues)[number];

export type AppointmentRecord = {
  id: string;
  accountId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
  status: AppointmentStatus;
  notes: string | null;
  cancelledBy: 'customer' | 'account' | 'ai' | null;
  cancellationReason: string | null;
  createdAt: Date;
};

/**
 * A mutation's row plus the domain event it appended. `eventId` is null on every
 * replay and no-op path — the row is returned unchanged and nothing new was
 * published — so it means "this call produced that event", never "this is the
 * appointment's event".
 */
export type AppointmentMutationResult = AppointmentRecord & {
  eventId: string | null;
};

export type FreeSlot = {
  startsAt: string;
  endsAt: string;
};
