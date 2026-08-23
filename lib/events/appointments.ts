import { z } from 'zod';
import type { DBTransaction } from '@/lib/db';
import { appendStoredEvent } from './store';

const isoDateTime = z.iso.datetime({ offset: true });
const cancellationActor = z.enum(['customer', 'account', 'ai']);

// Optional request-edge trace id (Phase 11). Optional so old outbox rows still
// validate; declared explicitly because z.object().parse() strips undeclared
// keys.
const traceId = z.uuid().optional();

// Which side of the product produced the change, and so whether the customer was
// already answered inside the originating turn. Distinct from `cancelledBy`,
// which records who decided, not who speaks. Optional so old outbox rows still
// validate; declared explicitly because z.object().parse() strips undeclared
// keys.
const mutationOrigin = z.enum(['conversation', 'account']).optional();

const appointmentSummary = z.object({
  accountId: z.uuid(),
  appointmentId: z.uuid(),
  customerId: z.uuid(),
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  serviceType: z.string().nullable(),
  traceId,
  origin: mutationOrigin,
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
    accountId: z.uuid(),
    appointmentId: z.uuid(),
    customerId: z.uuid(),
    serviceType: z.string().nullable(),
    status: z.enum(['pending', 'confirmed']),
    from: z.object({ startsAt: isoDateTime, endsAt: isoDateTime }),
    to: z.object({ startsAt: isoDateTime, endsAt: isoDateTime }),
    traceId,
    origin: mutationOrigin,
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

  return appendStoredEvent(tx, {
    accountId: payload.accountId,
    type: event.type,
    payload,
  });
}

export const eventPayloadFromAppointment = (appointment: {
  id: string;
  accountId: string;
  customerId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
}) => ({
  accountId: appointment.accountId,
  appointmentId: appointment.id,
  customerId: appointment.customerId,
  startsAt: appointment.startsAt.toISOString(),
  endsAt: appointment.endsAt.toISOString(),
  serviceType: appointment.serviceType,
});
