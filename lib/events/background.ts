import { z } from 'zod';
import type { DBTransaction } from '@/lib/db';
import { appendStoredEvent } from './store';

const isoDateTime = z.iso.datetime({ offset: true });

// Optional request-edge trace id, propagated through the outbox into Inngest so
// a webhook → Inngest → outbound-send chain shares one trace_id. Optional so old
// outbox rows still validate; declared explicitly because z.object().parse()
// strips any undeclared key (an undeclared traceId would silently vanish).
const traceId = z.uuid().optional();

export const backgroundEventSchemas = {
  'message.received': z.object({
    messageId: z.uuid(),
    ptId: z.uuid(),
    conversationId: z.uuid(),
    traceId,
  }),
  'wa.connection.created': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    phoneNumberId: z.string().min(1),
    wabaId: z.string().min(1),
    mode: z.enum(['cloud_api', 'coexistence']).default('cloud_api'),
    traceId,
  }),
  'wa.connection.revoked': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    reason: z.enum([
      'unauthorized',
      'forbidden',
      'partner_removed',
      'account_disconnected',
      'primary_inactivity',
      'companion_inactivity',
      'user_re_registered',
      'change_number',
      'business_downgrade',
      'unknown',
    ]),
    traceId,
  }),
  'wa.connection.expiring': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    expiresAt: isoDateTime,
    daysRemaining: z.number().int().nonnegative(),
    traceId,
  }),
  'wa.template.approved': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
    traceId,
  }),
  'wa.template.rejected': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
    traceId,
  }),
  'wa.template.timed_out': z.object({
    ptId: z.uuid(),
    templateId: z.uuid(),
    metaId: z.string().min(1),
    traceId,
  }),
  'wa.quality_warning': z.object({
    ptId: z.uuid(),
    connectionId: z.uuid(),
    qualityRating: z.string().min(1),
    tier: z.string().nullable(),
    traceId,
  }),
  'conversation.failed': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    messageId: z.uuid(),
    traceId,
  }),
  'conversation.taken_over': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
    takenOverAt: isoDateTime,
    traceId,
  }),
  'conversation.resume_offered': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
    traceId,
  }),
  'conversation.ai_paused': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
    pausedUntil: isoDateTime,
    reason: z.literal('whatsapp_business_app_echo'),
    traceId,
  }),
  'conversation.escalated': z.object({
    ptId: z.uuid(),
    conversationId: z.uuid(),
    patientId: z.uuid(),
    traceId,
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
    traceId,
  }),
  'reminder.failed': z.object({
    ptId: z.uuid(),
    appointmentId: z.uuid(),
    reason: z.string().min(1),
    traceId,
  }),
  'reminder.skipped': z.object({
    ptId: z.uuid(),
    appointmentId: z.uuid(),
    reason: z.string().min(1),
    traceId,
  }),
  // Phase 16 billing usage warnings/stops. One row per (pt, type, kind, month)
  // — the emitter dedupes on an events-exists check. `kind` covers C3's reminder
  // events too so that chunk doesn't have to re-touch this shared schema.
  'billing.limit_warning': z.object({
    ptId: z.uuid(),
    kind: z.enum(['conversations', 'reminders', 'reminders_predictive']),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    remaining: z.number().int(),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/),
    upcoming: z.number().int().nonnegative().optional(),
    traceId,
  }),
  'billing.limit_reached': z.object({
    ptId: z.uuid(),
    kind: z.enum(['conversations', 'reminders']),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/),
    traceId,
  }),
  // Phase 11 internal-metrics events. Counts/ids only. These have NO Inngest
  // consumer (no registered trigger), so their outbox rows simply drain and
  // no-op — only the `events` row is used, for funnel/delivery metrics.
  'pwa.installed': z.object({
    ptId: z.uuid(),
    traceId,
  }),
  'push.subscribed': z.object({
    ptId: z.uuid(),
    traceId,
  }),
  'push.dispatched': z.object({
    ptId: z.uuid(),
    sourceEvent: z.string().min(1),
    sent: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    traceId,
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
