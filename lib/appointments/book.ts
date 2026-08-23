import { addMinutes } from 'date-fns';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { appointments, customers } from '@/lib/db/schema';
import {
  appendAppointmentEvent,
  eventPayloadFromAppointment,
} from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { isSlotBookable } from './availability';
import { AppointmentError } from './errors';
import { withAppointmentLock } from './lock';
import type { AppointmentMutationResult } from './types';

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 60;

type BookAppointmentInput = {
  accountId: string;
  customerId: string;
  startsAt: Date;
  serviceType: string;
  durationMinutes?: number;
  notes?: string;
  // PT-initiated manual bookings may fall outside working hours / blocked
  // periods. Double-booking is still prevented by the active-overlap exclusion
  // constraint, so we only skip the availability-window check here.
  allowOutsideAvailability?: boolean;
  origin?: 'conversation' | 'account';
};

async function findExisting(input: BookAppointmentInput) {
  const [existing] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.accountId, input.accountId),
        eq(appointments.customerId, input.customerId),
        eq(appointments.startsAt, input.startsAt),
        inArray(appointments.status, ['pending', 'confirmed']),
      ),
    )
    .limit(1);
  return existing;
}

async function assertCustomerBelongsToPractice(
  accountId: string,
  customerId: string,
): Promise<void> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)))
    .limit(1);
  if (!customer) {
    throw new AppointmentError(
      'not_found',
      'The customer was not found for this practice.',
    );
  }
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<AppointmentMutationResult> {
  if (Number.isNaN(input.startsAt.getTime())) {
    throw new AppointmentError(
      'invalid_input',
      'The appointment start time is invalid.',
    );
  }
  if (!input.serviceType.trim()) {
    throw new AppointmentError('invalid_input', 'A service type is required.');
  }
  const durationMinutes =
    input.durationMinutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES;
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480
  ) {
    throw new AppointmentError(
      'invalid_input',
      'Appointment duration must be between 5 and 480 minutes.',
    );
  }

  return withAppointmentLock(input.accountId, async () => {
    await assertCustomerBelongsToPractice(input.accountId, input.customerId);

    const existing = await findExisting(input);
    if (existing) return { ...existing, eventId: null };

    const endsAt = addMinutes(input.startsAt, durationMinutes);
    if (!input.allowOutsideAvailability) {
      const bookable = await isSlotBookable({
        accountId: input.accountId,
        startsAt: input.startsAt,
        endsAt,
      });
      if (!bookable) {
        throw new AppointmentError(
          'unavailable',
          'The selected appointment time is no longer available.',
        );
      }
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [appointment] = await tx
          .insert(appointments)
          .values({
            accountId: input.accountId,
            customerId: input.customerId,
            startsAt: input.startsAt,
            endsAt,
            serviceType: input.serviceType.trim(),
            notes: input.notes?.trim() || null,
            status: 'pending',
          })
          .returning();

        const eventId = await appendAppointmentEvent(tx, {
          type: 'appointment.booked',
          data: {
            ...eventPayloadFromAppointment(appointment),
            status: 'pending',
            origin: input.origin,
          },
        });
        return { appointment, eventId };
      });

      await tryPublishOutboxEvent(result.eventId);
      return { ...result.appointment, eventId: result.eventId };
    } catch (error) {
      const code = getPostgresErrorCode(error);
      if (code === '23505') {
        const replay = await findExisting(input);
        if (replay) return { ...replay, eventId: null };
      }
      if (code === '23505' || code === '23P01') {
        throw new AppointmentError(
          'conflict',
          'The selected appointment time was booked concurrently.',
        );
      }
      throw error;
    }
  });
}
