import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments } from '@/lib/db/schema';
import {
  appendAppointmentEvent,
  eventPayloadFromAppointment,
  type AppointmentEvent,
} from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { AppointmentError } from './errors';
import { withAppointmentLock } from './lock';
import type { AppointmentRecord, AppointmentStatus } from './types';

const allowedTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled', 'completed', 'no_show'],
  confirmed: ['cancelled', 'completed', 'no_show'],
  rescheduled: ['confirmed', 'cancelled', 'completed', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function assertAppointmentTransition(
  current: AppointmentStatus,
  next: AppointmentStatus,
): void {
  if (current === next) return;
  if (!allowedTransitions[current].includes(next)) {
    throw new AppointmentError(
      'invalid_transition',
      `Appointment cannot transition from ${current} to ${next}.`,
    );
  }
}

type TransitionAppointmentInput = {
  ptId: string;
  appointmentId: string;
  nextStatus: AppointmentStatus;
  patientId?: string;
  cancelledBy?: 'patient' | 'pt' | 'ai';
  reason?: string;
};

function transitionEvent(
  appointment: AppointmentRecord,
  nextStatus: AppointmentStatus,
  input: TransitionAppointmentInput,
): AppointmentEvent {
  const summary = eventPayloadFromAppointment(appointment);
  if (nextStatus === 'confirmed') {
    return {
      type: 'appointment.confirmed',
      data: { ...summary, status: 'confirmed' },
    };
  }
  if (nextStatus === 'cancelled') {
    if (!input.cancelledBy) {
      throw new AppointmentError(
        'invalid_input',
        'A cancellation actor is required.',
      );
    }
    return {
      type: 'appointment.cancelled',
      data: {
        ...summary,
        status: 'cancelled',
        cancelledBy: input.cancelledBy,
        reason: input.reason?.trim() || null,
      },
    };
  }
  if (nextStatus === 'completed') {
    return {
      type: 'appointment.completed',
      data: { ...summary, status: 'completed' },
    };
  }
  if (nextStatus === 'no_show') {
    return {
      type: 'appointment.no_show',
      data: { ...summary, status: 'no_show' },
    };
  }
  throw new AppointmentError(
    'invalid_transition',
    `Transitioning to ${nextStatus} is not supported.`,
  );
}

export async function transitionAppointment(
  input: TransitionAppointmentInput,
): Promise<AppointmentRecord> {
  return withAppointmentLock(input.ptId, async () => {
    const result = await db.transaction(async (tx) => {
      const conditions = [
        eq(appointments.id, input.appointmentId),
        eq(appointments.ptId, input.ptId),
      ];
      if (input.patientId) {
        conditions.push(eq(appointments.patientId, input.patientId));
      }

      const [current] = await tx
        .select()
        .from(appointments)
        .where(and(...conditions))
        .limit(1)
        .for('update');
      if (!current) {
        throw new AppointmentError(
          'not_found',
          'The appointment was not found.',
        );
      }

      assertAppointmentTransition(current.status, input.nextStatus);
      if (current.status === input.nextStatus) {
        return { appointment: current, eventId: null };
      }

      const [appointment] = await tx
        .update(appointments)
        .set({
          status: input.nextStatus,
          cancelledBy:
            input.nextStatus === 'cancelled'
              ? (input.cancelledBy ?? null)
              : null,
          cancellationReason:
            input.nextStatus === 'cancelled'
              ? input.reason?.trim() || null
              : null,
        })
        .where(eq(appointments.id, current.id))
        .returning();

      const eventId = await appendAppointmentEvent(
        tx,
        transitionEvent(appointment, input.nextStatus, input),
      );
      return { appointment, eventId };
    });

    if (result.eventId) await tryPublishOutboxEvent(result.eventId);
    return result.appointment;
  });
}
