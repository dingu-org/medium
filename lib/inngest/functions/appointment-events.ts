import { and, eq, gte, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages, reminderJobs } from '@/lib/db/schema';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { inngest } from '../client';
import {
  formatAppointmentTime,
  loadAppointmentJobContext,
} from './appointment-context';

type AppointmentNotificationKind =
  | 'appointment.booked'
  | 'appointment.cancelled'
  | 'appointment.rescheduled';

function confirmationContent(args: {
  kind: AppointmentNotificationKind;
  startsAt: Date;
  timezone: string;
}): string {
  const time = formatAppointmentTime(args.startsAt, args.timezone);
  if (args.kind === 'appointment.booked') {
    return `Takimi juaj u rezervua për ${time}.`;
  }
  if (args.kind === 'appointment.cancelled') {
    return `Takimi juaj për ${time} u anulua.`;
  }
  return `Takimi juaj u ricaktua për ${time}.`;
}

/**
 * Which side effects an appointment event still warrants.
 *
 * - A patient- or AI-initiated cancellation was already answered inside the same
 *   turn — the reminder handler's own "u anulua" text, or the AI's reply — so the
 *   deterministic confirmation would be a second, near-identical billable send
 *   with no ordering guarantee against that reply. `skipped:'actor_already_replied'`
 *   is provisional: the caller re-checks after ACTOR_REPLY_GRACE and confirms
 *   anyway if that reply never reached the patient (hasDeliveredActorReply).
 * - A GDPR erasure cancels every active appointment on its way to deleting the
 *   patient: the PT tapped Fshi herself and the patient row is already gone, so
 *   a push naming a deleted client is noise and there is nobody left to confirm
 *   to. The marker is only trusted on a PT-side cancellation — a patient's own
 *   reason is their free-text reply and must not be able to spoof it.
 *
 * Bookings and reschedules carry no actor in their payloads yet, so they stay
 * unconditional.
 */
export function appointmentEventPlan(args: {
  kind: AppointmentNotificationKind;
  cancelledBy?: 'patient' | 'pt' | 'ai' | null;
  cancellationReason?: string | null;
}): { notifyPt: boolean; confirmPatient: boolean; skipped?: string } {
  if (args.kind !== 'appointment.cancelled') {
    return { notifyPt: true, confirmPatient: true };
  }
  if (args.cancelledBy !== 'pt') {
    return {
      notifyPt: true,
      confirmPatient: false,
      skipped: 'actor_already_replied',
    };
  }
  if (args.cancellationReason === 'patient_erased') {
    return {
      notifyPt: false,
      confirmPatient: false,
      skipped: 'patient_erased',
    };
  }
  return { notifyPt: true, confirmPatient: true };
}

/**
 * How long the suppressed cancellation waits for the originating turn to deliver
 * its own patient-facing reply. Wide enough to cover the turn's remaining model
 * rounds AND its retry budget, so the backstop below never races a reply that is
 * still in flight.
 */
const ACTOR_REPLY_GRACE = '15m';

/**
 * Stamped by handoffFailedTurn (lib/conversation/engine.ts) on the generic
 * "the practice will get back to you" text an exhausted turn falls back to. It
 * never names the cancellation, so it does NOT count as having told the patient.
 */
const FAILURE_HANDOFF_MODEL = 'deterministic-failure-handoff';

/**
 * Did the turn that cancelled actually reach the patient? `appointmentEventPlan`
 * suppresses the deterministic confirmation for a patient/AI cancellation on the
 * assumption that turn already said it — but in the AI path the text comes from a
 * LATER model round (lib/ai/dispatcher.ts commits the cancellation in the tool
 * call), and if that round or its send exhausts retries the patient only gets the
 * failure handoff. Without this check the patient would keep believing the
 * appointment stands while the slot is already free.
 */
export async function hasDeliveredActorReply(args: {
  ptId: string;
  appointmentId: string;
  since: Date;
}): Promise<boolean> {
  const context = await loadAppointmentJobContext(args);
  if (!context?.conversationId) return false;

  const [delivered] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, args.ptId),
        eq(messages.conversationId, context.conversationId),
        eq(messages.role, 'ai'),
        // externalId is stamped only once WhatsApp accepted the send.
        isNotNull(messages.externalId),
        gte(messages.createdAt, args.since),
        or(isNull(messages.model), ne(messages.model, FAILURE_HANDOFF_MODEL)),
      ),
    )
    .limit(1);
  return delivered !== undefined;
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
        break;
      case 'appointment.cancelled':
        kind = event.name;
        startsAt = event.data.startsAt;
        previousStartsAt = null;
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        patientId = event.data.patientId;
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
      // A GDPR erasure has nobody left to confirm to — that suppression is final.
      if (plan.skipped !== 'actor_already_replied') {
        return { patientConfirmation: null, skipped: plan.skipped };
      }
      // "The actor already replied" is an assumption, not a fact, and this
      // fan-out is the only backstop with retries of its own. Sit out the turn,
      // then confirm anyway if nothing ever reached the patient.
      await step.sleep('await-actor-reply', ACTOR_REPLY_GRACE);
      const replied = await step.run('check-actor-reply', () =>
        hasDeliveredActorReply({
          ptId,
          appointmentId,
          since: new Date(event.ts ?? Date.now()),
        }),
      );
      if (replied) {
        return { patientConfirmation: null, skipped: plan.skipped };
      }
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
