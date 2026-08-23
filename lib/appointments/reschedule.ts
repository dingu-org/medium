import { addMinutes } from 'date-fns';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { appointments } from '@/lib/db/schema';
import { appendAppointmentEvent } from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { isSlotBookable } from './availability';
import { AppointmentError } from './errors';
import { withAppointmentLock } from './lock';
import type { AppointmentMutationResult } from './types';

export async function rescheduleAppointment(input: {
  accountId: string;
  appointmentId: string;
  customerId?: string;
  newStartsAt: Date;
  origin?: 'conversation' | 'account';
}): Promise<AppointmentMutationResult> {
  if (Number.isNaN(input.newStartsAt.getTime())) {
    throw new AppointmentError(
      'invalid_input',
      'The new appointment start time is invalid.',
    );
  }

  return withAppointmentLock(input.accountId, async () => {
    const conditions = [
      eq(appointments.id, input.appointmentId),
      eq(appointments.accountId, input.accountId),
      inArray(appointments.status, ['pending', 'confirmed']),
    ];
    if (input.customerId) {
      conditions.push(eq(appointments.customerId, input.customerId));
    }

    const [existing] = await db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .limit(1);
    if (!existing) {
      throw new AppointmentError(
        'not_found',
        'No active appointment was found to reschedule.',
      );
    }
    if (existing.startsAt.getTime() === input.newStartsAt.getTime()) {
      return { ...existing, eventId: null };
    }

    const durationMinutes = Math.round(
      (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000,
    );
    if (durationMinutes < 5 || durationMinutes > 480) {
      throw new AppointmentError(
        'invalid_input',
        'The appointment duration is invalid.',
      );
    }
    const newEndsAt = addMinutes(input.newStartsAt, durationMinutes);
    const bookable = await isSlotBookable({
      accountId: input.accountId,
      startsAt: input.newStartsAt,
      endsAt: newEndsAt,
      excludeAppointmentId: existing.id,
    });
    if (!bookable) {
      throw new AppointmentError(
        'unavailable',
        'The selected appointment time is no longer available.',
      );
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(appointments)
          .where(and(...conditions))
          .limit(1)
          .for('update');
        if (!locked) {
          throw new AppointmentError(
            'not_found',
            'No active appointment was found to reschedule.',
          );
        }

        const [appointment] = await tx
          .update(appointments)
          .set({
            startsAt: input.newStartsAt,
            endsAt: newEndsAt,
          })
          .where(eq(appointments.id, locked.id))
          .returning();

        const eventId = await appendAppointmentEvent(tx, {
          type: 'appointment.rescheduled',
          data: {
            accountId: appointment.accountId,
            appointmentId: appointment.id,
            customerId: appointment.customerId,
            serviceType: appointment.serviceType,
            status: appointment.status as 'pending' | 'confirmed',
            from: {
              startsAt: locked.startsAt.toISOString(),
              endsAt: locked.endsAt.toISOString(),
            },
            to: {
              startsAt: appointment.startsAt.toISOString(),
              endsAt: appointment.endsAt.toISOString(),
            },
            origin: input.origin,
          },
        });
        return { appointment, eventId };
      });

      await tryPublishOutboxEvent(result.eventId);
      return { ...result.appointment, eventId: result.eventId };
    } catch (error) {
      const code = getPostgresErrorCode(error);
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
