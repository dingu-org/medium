import { z } from 'zod';
import type { DBTransaction } from '@/lib/db';
import { appendStoredEvent } from './store';

const isoDateTime = z.iso.datetime({ offset: true });

export const backgroundEventSchemas = {
  'message.received': z.object({
    messageId: z.uuid(),
    ptId: z.uuid(),
    conversationId: z.uuid(),
  }),
  'wa.connection.created': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    phoneNumberId: z.string().min(1),
    wabaId: z.string().min(1),
  }),
  'wa.connection.revoked': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    reason: z.enum(['unauthorized', 'forbidden']),
  }),
  'wa.connection.expiring': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    expiresAt: isoDateTime,
    daysRemaining: z.number().int().nonnegative(),
  }),
  'wa.template.approved': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
  }),
  'wa.template.rejected': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
  }),
  'wa.template.timed_out': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
  }),
  'wa.quality_warning': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    qualityRating: z.string().min(1),
    tier: z.string().nullable(),
  }),
  'conversation.failed': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    messageId: z.uuid(),
  }),
  'conversation.taken_over': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
    takenOverAt: isoDateTime,
  }),
  'conversation.resume_offered': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
  }),
  'notification.requested': z.object({
    ptId: z.uuid(),
    kind: z.enum([
      'appointment.booked',
      'appointment.cancelled',
      'appointment.rescheduled',
    ]),
    appointmentId: z.uuid(),
    patientId: z.uuid(),
    startsAt: isoDateTime,
    previousStartsAt: isoDateTime.nullable(),
  }),
  'reminder.failed': z.object({
    ptId: z.uuid(),
    appointmentId: z.uuid(),
    reason: z.string().min(1),
  }),
} as const;

export type BackgroundEventName = keyof typeof backgroundEventSchemas;
export type BackgroundEventPayloads = {
  [K in BackgroundEventName]: z.infer<(typeof backgroundEventSchemas)[K]>;
};
export type BackgroundEvent = {
  [K in BackgroundEventName]: {
    type: K;
    data: BackgroundEventPayloads[K];
  };
}[BackgroundEventName];

export async function appendBackgroundEvent(
  tx: DBTransaction,
  event: BackgroundEvent,
): Promise<string> {
  const schema = backgroundEventSchemas[event.type] as z.ZodType<
    typeof event.data
  >;
  const payload = schema.parse(event.data);
  return appendStoredEvent(tx, {
    ptId: payload.ptId,
    type: event.type,
    payload,
  });
}
