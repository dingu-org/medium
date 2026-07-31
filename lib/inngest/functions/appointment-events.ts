import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages, reminderJobs } from '@/lib/db/schema';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import {
  appointmentConfirmationContent,
  type AppointmentConfirmationKind,
} from '@/lib/format/appointment-confirmation';
import { inngest } from '../client';
import { loadAppointmentJobContext } from './appointment-context';

type AppointmentNotificationKind =
  | 'appointment.booked'
  | 'appointment.cancelled'
  | 'appointment.rescheduled';

const confirmationKinds: Record<
  AppointmentNotificationKind,
  AppointmentConfirmationKind
> = {
  'appointment.booked': 'booked',
  'appointment.cancelled': 'cancelled',
  'appointment.rescheduled': 'rescheduled',
};

function confirmationContent(args: {
  kind: AppointmentNotificationKind;
  startsAt: Date;
  timezone: string;
  serviceType: string | null;
}): string {
  return appointmentConfirmationContent({
    kind: confirmationKinds[args.kind],
    startsAt: args.startsAt,
    timezone: args.timezone,
    serviceType: args.serviceType,
  });
}

/**
 * Which side effects an appointment event still warrants.
 *
 * Exactly one side of the product speaks per change, and `origin` says which:
 * a conversation-originated change was already confirmed inline by the turn that
 * made it (lib/conversation/engine.ts sends this same deterministic text), so a
 * second send here would be a duplicate. That suppression is final — there is no
 * second producer to coordinate with, so nothing to wait for and nothing to
 * re-check. Delivery reliability is the ordinary contract every other
 * patient-facing send has: retry, then `conversation.failed` on the PT's bell
 * and the thread handed to a human.
 *
 * `origin` is deliberately not `cancelledBy`: that records who decided, not who
 * speaks, and the two diverge in the reminder-fallback turn, which records a
 * patient cancellation from inside an AI turn.
 *
 * A GDPR erasure cancels every active appointment on its way to deleting the
 * patient: the PT tapped Fshi herself and the patient row is already gone, so a
 * push naming a deleted client is noise and there is nobody left to confirm to.
 * It resolves first so the marker stays trusted only on a PT-side cancellation —
 * a patient's own reason is their free-text reply and must not be able to spoof
 * it.
 */
export function appointmentEventPlan(args: {
  kind: AppointmentNotificationKind;
  origin?: 'conversation' | 'pt' | null;
  cancelledBy?: 'patient' | 'pt' | 'ai' | null;
  cancellationReason?: string | null;
}): { notifyPt: boolean; confirmPatient: boolean; skipped?: string } {
  if (
    args.kind === 'appointment.cancelled' &&
    args.cancelledBy === 'pt' &&
    args.cancellationReason === 'patient_erased'
  ) {
    return {
      notifyPt: false,
      confirmPatient: false,
      skipped: 'patient_erased',
    };
  }

  // Payloads written before `origin` existed still drain out of the outbox.
  // Infer the value that reproduces their old routing exactly: cancellations
  // went by actor, bookings and reschedules always confirmed.
  const origin =
    args.origin ??
    (args.kind === 'appointment.cancelled'
      ? args.cancelledBy === 'pt'
        ? 'pt'
        : 'conversation'
      : 'pt');

  if (origin === 'conversation') {
    return {
      notifyPt: true,
      confirmPatient: false,
      skipped: 'conversation_replied',
    };
  }
  return { notifyPt: true, confirmPatient: true };
}

export async function prepareAppointmentConfirmation(args: {
  sourceEventId: string;
  kind: AppointmentNotificationKind;
  ptId: string;
  appointmentId: string;
  startsAt: Date;
}): Promise<
  | {
      kind: 'ready';
      messageId: string;
      content: string;
      externalId: string | null;
      connectionId: string;
      recipient: string;
    }
  | { kind: 'skipped'; reason: string }
> {
  const context = await loadAppointmentJobContext(args);
  if (!context) return { kind: 'skipped', reason: 'appointment_not_found' };
  if (!context.connectionId || !context.recipient || !context.conversationId) {
    return { kind: 'skipped', reason: 'delivery_context_missing' };
  }

  const content = confirmationContent({
    kind: args.kind,
    startsAt: args.startsAt,
    timezone: context.timezone,
    serviceType: context.serviceType,
  });
  await db
    .insert(messages)
    .values({
      ptId: args.ptId,
      conversationId: context.conversationId,
      sourceEventId: args.sourceEventId,
      role: 'ai',
      channel: 'whatsapp',
      content,
      model: 'deterministic-appointment-event',
      provider: 'internal',
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      aiCostMicrousd: 0,
    })
    .onConflictDoNothing();

  const [message] = await db
    .select({
      id: messages.id,
      externalId: messages.externalId,
      content: messages.content,
    })
    .from(messages)
    .where(eq(messages.sourceEventId, args.sourceEventId))
    .limit(1);
  if (!message) {
    throw new Error('Appointment confirmation message was not persisted');
  }

  return {
    kind: 'ready',
    messageId: message.id,
    content: message.content,
    externalId: message.externalId,
    connectionId: context.connectionId,
    recipient: context.recipient,
  };
}

export async function sendAppointmentConfirmation(args: {
  messageId: string;
  externalId: string | null;
  connectionId: string;
  recipient: string;
  content: string;
  sendFn?: typeof sendFreeForm;
}): Promise<{ externalId: string; replay: boolean }> {
  if (args.externalId) {
    return { externalId: args.externalId, replay: true };
  }
  const result = await (args.sendFn ?? sendFreeForm)(
    args.connectionId,
    args.recipient,
    args.content,
  );
  if (!result.messageId) {
    throw new Error(
      'WhatsApp accepted the appointment confirmation without a message ID',
    );
  }
  return { externalId: result.messageId, replay: false };
}

export async function persistAppointmentConfirmation(args: {
  messageId: string;
  externalId: string;
}): Promise<void> {
  await db
    .update(messages)
    .set({ externalId: args.externalId })
    .where(and(eq(messages.id, args.messageId), isNull(messages.externalId)));
}

/**
 * Every retry of the patient confirmation is spent. The message row was already
 * persisted before the send, so it would sit there with a NULL externalId and
 * nothing would ever tell the PT the patient was not reached — while her own
 * `notification.requested` push says the change went through. Append a durable
 * `conversation.failed` so the bell points her at the thread.
 */
export async function recordConfirmationFailure(args: {
  ptId: string;
  sourceEventId: string;
}): Promise<{ recorded: boolean; reason?: string }> {
  const [pending] = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
    })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, args.ptId),
        eq(messages.sourceEventId, args.sourceEventId),
        isNull(messages.externalId),
      ),
    )
    .limit(1);
  if (!pending) {
    return { recorded: false, reason: 'no_undelivered_confirmation' };
  }

  const eventId = await db.transaction((tx) =>
    appendBackgroundEvent(tx, {
      type: 'conversation.failed',
      data: {
        ptId: args.ptId,
        conversationId: pending.conversationId,
        messageId: pending.id,
      },
    }),
  );
  await tryPublishOutboxEvent(eventId);
  return { recorded: true };
}

export const handleAppointmentEvent = inngest.createFunction(
  {
    id: 'handle-appointment-event',
    retries: 2,
    idempotency: 'event.id',
    onFailure: async ({ event, step }) => {
      const original = event.data.event;
      if (!original.id) return { skipped: 'missing_event_id' };
      return step.run('record-confirmation-failure', () =>
        recordConfirmationFailure({
          ptId: original.data.ptId,
          sourceEventId: original.id!,
        }),
      );
    },
  },
  [
    { event: 'appointment.booked' },
    { event: 'appointment.cancelled' },
    { event: 'appointment.rescheduled' },
  ],
  async ({ event, step }) => {
    if (!event.id) throw new Error('Appointment event ID is required');

    let kind: AppointmentNotificationKind;
    let startsAt: string;
    let previousStartsAt: string | null;
    let ptId: string;
    let appointmentId: string;
    let patientId: string;
    let origin: 'conversation' | 'pt' | null = null;
    let cancelledBy: 'patient' | 'pt' | 'ai' | null = null;
    let cancellationReason: string | null = null;
    switch (event.name) {
      case 'appointment.booked':
        kind = event.name;
        startsAt = event.data.startsAt;
        previousStartsAt = null;
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        patientId = event.data.patientId;
        origin = event.data.origin ?? null;
        break;
      case 'appointment.cancelled':
        kind = event.name;
        startsAt = event.data.startsAt;
        previousStartsAt = null;
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        patientId = event.data.patientId;
        origin = event.data.origin ?? null;
        cancelledBy = event.data.cancelledBy;
        cancellationReason = event.data.reason;
        break;
      case 'appointment.rescheduled':
        kind = event.name;
        startsAt = event.data.to.startsAt;
        previousStartsAt = event.data.from.startsAt;
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        patientId = event.data.patientId;
        origin = event.data.origin ?? null;
        break;
      default:
        return { skipped: 'unsupported_trigger' };
    }

    if (kind === 'appointment.cancelled') {
      await step.run('cancel-reminder-record', () =>
        db
          .update(reminderJobs)
          .set({ status: 'cancelled' })
          .where(eq(reminderJobs.appointmentId, appointmentId)),
      );
    }

    const plan = appointmentEventPlan({
      kind,
      origin,
      cancelledBy,
      cancellationReason,
    });

    if (plan.notifyPt) {
      await step.sendEvent('request-pt-notification', {
        name: 'notification.requested',
        data: {
          ptId,
          kind,
          appointmentId,
          patientId,
          startsAt,
          previousStartsAt,
        },
      });
    }
    if (!plan.confirmPatient) {
      return { patientConfirmation: null, skipped: plan.skipped };
    }

    const confirmation = await step.run('prepare-patient-confirmation', () =>
      prepareAppointmentConfirmation({
        sourceEventId: event.id!,
        kind,
        ptId,
        appointmentId,
        startsAt: new Date(startsAt),
      }),
    );

    let patientConfirmation: string | null = null;
    if (confirmation.kind === 'ready') {
      const delivery = await step.run('send-patient-confirmation', () =>
        sendAppointmentConfirmation(confirmation),
      );
      await step.run('persist-patient-confirmation', () =>
        persistAppointmentConfirmation({
          messageId: confirmation.messageId,
          externalId: delivery.externalId,
        }),
      );
      patientConfirmation = delivery.externalId;
    }

    return {
      patientConfirmation,
      skipped:
        confirmation.kind === 'skipped' ? confirmation.reason : undefined,
    };
  },
);
