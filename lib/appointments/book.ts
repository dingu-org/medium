import { addMinutes } from 'date-fns';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { appointments, patients } from '@/lib/db/schema';
import {
  appendAppointmentEvent,
  eventPayloadFromAppointment,
} from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { getFreeSlotsInternal } from './availability';
import { AppointmentError } from './errors';
import { withAppointmentLock } from './lock';
import type { AppointmentRecord } from './types';

const APPOINTMENT_DURATION_MINUTES = 60;

type BookAppointmentInput = {
  ptId: string;
  patientId: string;
  startsAt: Date;
  serviceType: string;
  notes?: string;
};

async function findExisting(input: BookAppointmentInput) {
  const [existing] = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.ptId, input.ptId),
        eq(appointments.patientId, input.patientId),
        eq(appointments.startsAt, input.startsAt),
        inArray(appointments.status, ['pending', 'confirmed']),
      ),
    )
    .limit(1);
  return existing;
}

async function assertPatientBelongsToPractice(
  ptId: string,
  patientId: string,
): Promise<void> {
  const [patient] = await db
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)))
    .limit(1);
  if (!patient) {
    throw new AppointmentError(
      'not_found',
      'The patient was not found for this practice.',
    );
  }
}

export async function bookAppointment(
  input: BookAppointmentInput,
): Promise<AppointmentRecord> {
  if (Number.isNaN(input.startsAt.getTime())) {
    throw new AppointmentError(
      'invalid_input',
      'The appointment start time is invalid.',
    );
  }
  if (!input.serviceType.trim()) {
    throw new AppointmentError('invalid_input', 'A service type is required.');
  }

  return withAppointmentLock(input.ptId, async () => {
    await assertPatientBelongsToPractice(input.ptId, input.patientId);

    const existing = await findExisting(input);
    if (existing) return existing;

    const endsAt = addMinutes(input.startsAt, APPOINTMENT_DURATION_MINUTES);
    const availability = await getFreeSlotsInternal({
      ptId: input.ptId,
      start: input.startsAt,
      end: endsAt,
      durationMinutes: APPOINTMENT_DURATION_MINUTES,
      serviceType: input.serviceType,
    });
    if (
      !availability.slots.some(
        (slot) => slot.startsAt === input.startsAt.toISOString(),
      )
    ) {
      throw new AppointmentError(
        'unavailable',
        'The selected appointment time is no longer available.',
      );
    }

    try {
      const result = await db.transaction(async (tx) => {
        const [appointment] = await tx
          .insert(appointments)
          .values({
            ptId: input.ptId,
            patientId: input.patientId,
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
          },
        });
        return { appointment, eventId };
      });

      await tryPublishOutboxEvent(result.eventId);
      return result.appointment;
    } catch (error) {
      const code = getPostgresErrorCode(error);
      if (code === '23505') {
        const replay = await findExisting(input);
        if (replay) return replay;
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
