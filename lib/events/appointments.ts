import { z } from 'zod';
import type { DBTransaction } from '@/lib/db';
import { eventOutbox, events } from '@/lib/db/schema';

const isoDateTime = z.iso.datetime({ offset: true });
const cancellationActor = z.enum(['patient', 'pt', 'ai']);

const appointmentSummary = z.object({
  ptId: z.uuid(),
  appointmentId: z.uuid(),
  patientId: z.uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  serviceType: z.string().nullable(),
});

export const appointmentEventSchemas = {
  'appointment.booked': appointmentSummary.extend({
    status: z.literal('pending'),
  }),
  'appointment.confirmed': appointmentSummary.extend({
    status: z.literal('confirmed'),
  }),
  'appointment.cancelled': appointmentSummary.extend({
    status: z.literal('cancelled'),
    cancelledBy: cancellationActor,
    reason: z.string().nullable(),
  }),
  'appointment.rescheduled': z.object({
    ptId: z.uuid(),
    appointmentId: z.uuid(),
    patientId: z.uuid(),
    serviceType: z.string().nullable(),
    status: z.enum(['pending', 'confirmed']),
    from: z.object({ startsAt: isoDateTime, endsAt: isoDateTime }),
    to: z.object({ startsAt: isoDateTime, endsAt: isoDateTime }),
  }),
  'appointment.completed': appointmentSummary.extend({
    status: z.literal('completed'),
  }),
  'appointment.no_show': appointmentSummary.extend({
    status: z.literal('no_show'),
  }),
} as const;

export type AppointmentEventName = keyof typeof appointmentEventSchemas;
export type AppointmentEventPayloads = {
  [K in AppointmentEventName]: z.infer<(typeof appointmentEventSchemas)[K]>;
};
export type AppointmentEvent = {
  [K in AppointmentEventName]: {
    type: K;
    data: AppointmentEventPayloads[K];
  };
}[AppointmentEventName];

export async function appendAppointmentEvent(
  tx: DBTransaction,
  event: AppointmentEvent,
): Promise<string> {
  const schema = appointmentEventSchemas[event.type] as z.ZodType<
    typeof event.data
  >;
  const payload = schema.parse(event.data);

  const [stored] = await tx
    .insert(events)
    .values({
      ptId: payload.ptId,
      type: event.type,
      payload,
    })
    .returning({ id: events.id });

  await tx.insert(eventOutbox).values({
    ptId: payload.ptId,
    eventId: stored.id,
    eventType: event.type,
    payload,
  });

  return stored.id;
}

export const eventPayloadFromAppointment = (appointment: {
  id: string;
  ptId: string;
  patientId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
}) => ({
  ptId: appointment.ptId,
  appointmentId: appointment.id,
  patientId: appointment.patientId,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
  serviceType: appointment.serviceType,
});
