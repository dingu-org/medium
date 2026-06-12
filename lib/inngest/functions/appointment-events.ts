import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { messages, reminderJobs } from '@/lib/db/schema';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
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
    return `Your appointment is booked for ${time}.`;
  }
  if (args.kind === 'appointment.cancelled') {
    return `Your appointment for ${time} has been cancelled.`;
  }
  return `Your appointment has been rescheduled to ${time}.`;
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

export const handleAppointmentEvent = inngest.createFunction(
  {
    id: 'handle-appointment-event',
    retries: 2,
    idempotency: 'event.id',
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
    switch (event.name) {
      case 'appointment.booked':
      case 'appointment.cancelled':
        kind = event.name;
        startsAt = event.data.startsAt;
        previousStartsAt = null;
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        patientId = event.data.patientId;
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
