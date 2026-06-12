import { and, count, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import { addHours, addMinutes, subHours } from 'date-fns';
import { db } from '@/lib/db';
import {
  messageTemplates,
  messages,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { sendTemplate } from '@/lib/channels/whatsapp/client';
import { inngest } from '../client';
import { REMINDER_TEMPLATE } from './bootstrap-wa-connection';
import {
  formatAppointmentTime,
  loadAppointmentJobContext,
} from './appointment-context';

const SHORT_NOTICE_MINUTES = 5;
const MINIMUM_NOTICE_HOURS = 2;
const TEMPLATE_RETRY_HOURS = 6;
const MAX_TEMPLATE_ATTEMPTS = 3;

export function computeReminderSchedule(
  startsAt: Date,
  now = new Date(),
):
  | { kind: 'scheduled'; scheduledFor: Date }
  | { kind: 'skipped'; reason: 'short_notice' } {
  const minimumNoticeAt = addHours(now, MINIMUM_NOTICE_HOURS);
  if (startsAt <= minimumNoticeAt) {
    return { kind: 'skipped', reason: 'short_notice' };
  }

  const standard = subHours(startsAt, 24);
  return {
    kind: 'scheduled',
    scheduledFor:
      standard > now ? standard : addMinutes(now, SHORT_NOTICE_MINUTES),
  };
}

export async function upsertReminderSchedule(args: {
  ptId: string;
  appointmentId: string;
  scheduledFor: Date;
  runId: string;
}): Promise<void> {
  await db
    .insert(reminderJobs)
    .values({
      ptId: args.ptId,
      appointmentId: args.appointmentId,
      scheduledFor: args.scheduledFor,
      inngestRunId: args.runId,
      status: 'scheduled',
    })
    .onConflictDoUpdate({
      target: reminderJobs.appointmentId,
      set: {
        scheduledFor: args.scheduledFor,
        inngestRunId: args.runId,
        status: 'scheduled',
        attempts: 0,
        lastError: null,
        skippedReason: null,
        sentAt: null,
        messageId: null,
      },
    });
}

async function markReminder(args: {
  appointmentId: string;
  status:
    | 'scheduled'
    | 'requeued'
    | 'sent'
    | 'skipped'
    | 'failed'
    | 'cancelled';
  attempts?: number;
  lastError?: string | null;
  skippedReason?: string | null;
}): Promise<void> {
  await db
    .update(reminderJobs)
    .set({
      status: args.status,
      attempts: args.attempts,
      lastError: args.lastError,
      skippedReason: args.skippedReason,
    })
    .where(eq(reminderJobs.appointmentId, args.appointmentId));
}

function tierLimit(tier: string | null): number | null {
  if (!tier || tier.toUpperCase().includes('UNLIMITED')) return null;
  const matches = tier.match(/\d+/g);
  if (!matches) return null;
  const limit = Number(matches.join(''));
  return Number.isFinite(limit) && limit > 0 ? limit : null;
}

async function hasRateCapacity(args: {
  ptId: string;
  tier: string | null;
  now: Date;
}): Promise<boolean> {
  const limit = tierLimit(args.tier);
  if (!limit) return true;

  const [usage] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, args.ptId),
        isNotNull(messages.templateId),
        isNotNull(messages.externalId),
        gte(messages.createdAt, subHours(args.now, 24)),
      ),
    );
  return usage.value < Math.max(1, Math.floor(limit * 0.95));
}

export async function loadReminderAttempt(args: {
  ptId: string;
  appointmentId: string;
  runId: string;
  scheduledFor: Date;
  now?: Date;
}): Promise<
  | {
      kind: 'ready';
      context: NonNullable<
        Awaited<ReturnType<typeof loadAppointmentJobContext>>
      >;
      templateId: string;
    }
  | { kind: 'skipped'; reason: string }
  | { kind: 'retry'; reason: string }
> {
  const now = args.now ?? new Date();
  const [job] = await db
    .select()
    .from(reminderJobs)
    .where(eq(reminderJobs.appointmentId, args.appointmentId))
    .limit(1);
  if (
    !job ||
    job.inngestRunId !== args.runId ||
    job.scheduledFor.getTime() !== args.scheduledFor.getTime()
  ) {
    return { kind: 'skipped', reason: 'stale_run' };
  }

  const context = await loadAppointmentJobContext(args);
  if (!context) return { kind: 'skipped', reason: 'appointment_not_found' };
  if (context.status !== 'pending' && context.status !== 'confirmed') {
    return { kind: 'skipped', reason: `appointment_${context.status}` };
  }
  if (context.startsAt <= now) {
    return { kind: 'skipped', reason: 'appointment_started' };
  }
  if (!context.connectionId || !context.recipient || !context.conversationId) {
    return { kind: 'skipped', reason: 'connection_inactive' };
  }

  const [connection] = await db
    .select({ tier: whatsappConnections.tier })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.id, context.connectionId))
    .limit(1);
  if (
    !(await hasRateCapacity({
      ptId: args.ptId,
      tier: connection?.tier ?? null,
      now,
    }))
  ) {
    return { kind: 'retry', reason: 'rate_tier_near_limit' };
  }

  const [template] = await db
    .select({
      id: messageTemplates.id,
      status: messageTemplates.status,
    })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.ptId, args.ptId),
        eq(messageTemplates.name, REMINDER_TEMPLATE.name),
        eq(messageTemplates.language, REMINDER_TEMPLATE.language),
      ),
    )
    .limit(1);
  if (!template || template.status !== 'approved') {
    return { kind: 'retry', reason: 'template_not_approved' };
  }

  return { kind: 'ready', context, templateId: template.id };
}

async function prepareReminderMessage(args: {
  ptId: string;
  appointmentId: string;
  conversationId: string;
  templateId: string;
  content: string;
}): Promise<{ id: string; externalId: string | null }> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ messageId: reminderJobs.messageId })
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, args.appointmentId))
      .limit(1);
    if (job?.messageId) {
      const [existing] = await tx
        .select({ id: messages.id, externalId: messages.externalId })
        .from(messages)
        .where(eq(messages.id, job.messageId))
        .limit(1);
      if (existing) return existing;
    }

    const [created] = await tx
      .insert(messages)
      .values({
        ptId: args.ptId,
        conversationId: args.conversationId,
        role: 'ai',
        channel: 'whatsapp',
        content: args.content,
        templateId: args.templateId,
        model: 'deterministic-reminder',
        provider: 'internal',
        tokensIn: 0,
        tokensOut: 0,
        cachedTokens: 0,
        aiCostMicrousd: 0,
      })
      .returning({ id: messages.id, externalId: messages.externalId });
    await tx
      .update(reminderJobs)
      .set({ messageId: created.id })
      .where(eq(reminderJobs.appointmentId, args.appointmentId));
    return created;
  });
}

async function persistReminderDelivery(args: {
  appointmentId: string;
  messageId: string;
  externalId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({ externalId: args.externalId })
      .where(and(eq(messages.id, args.messageId), isNull(messages.externalId)));
    await tx
      .update(reminderJobs)
      .set({
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
        skippedReason: null,
      })
      .where(eq(reminderJobs.appointmentId, args.appointmentId));
  });
}

async function recordReminderFailure(args: {
  ptId: string;
  appointmentId: string;
  scheduledFor: Date;
  runId: string;
  error: string;
}): Promise<void> {
  await db
    .insert(reminderJobs)
    .values({
      ptId: args.ptId,
      appointmentId: args.appointmentId,
      scheduledFor: args.scheduledFor,
      inngestRunId: args.runId,
      status: 'failed',
      attempts: MAX_TEMPLATE_ATTEMPTS,
      lastError: args.error,
    })
    .onConflictDoUpdate({
      target: reminderJobs.appointmentId,
      set: {
        status: 'failed',
        attempts: MAX_TEMPLATE_ATTEMPTS,
        lastError: args.error,
      },
    });
}

export const sendReminder = inngest.createFunction(
  {
    id: 'send-reminder',
    retries: 2,
    idempotency: 'event.id',
    cancelOn: [
      {
        event: 'appointment.cancelled',
        if: 'async.data.appointmentId == event.data.appointmentId',
      },
      {
        event: 'appointment.rescheduled',
        if: 'async.data.appointmentId == event.data.appointmentId',
      },
    ],
    onFailure: async ({ event, error, step }) => {
      const original = event.data.event;
      let ptId: string;
      let appointmentId: string;
      let startsAt: Date;
      switch (original.name) {
        case 'appointment.booked':
          ptId = original.data.ptId;
          appointmentId = original.data.appointmentId;
          startsAt = new Date(original.data.startsAt);
          break;
        case 'appointment.rescheduled':
          ptId = original.data.ptId;
          appointmentId = original.data.appointmentId;
          startsAt = new Date(original.data.to.startsAt);
          break;
        default:
          return { skipped: 'unsupported_trigger' };
      }
      const reason = `${error.name}: ${error.message}`.slice(0, 500);
      await step.run('record-reminder-run-failure', () =>
        recordReminderFailure({
          ptId,
          appointmentId,
          scheduledFor: startsAt,
          runId: event.data.run_id,
          error: reason,
        }),
      );
      await step.sendEvent('emit-reminder-run-failed', {
        name: 'reminder.failed',
        data: { ptId, appointmentId, reason },
      });
      return { failed: reason };
    },
  },
  [{ event: 'appointment.booked' }, { event: 'appointment.rescheduled' }],
  async ({ event, runId, step }) => {
    let startsAt: Date;
    let ptId: string;
    let appointmentId: string;
    switch (event.name) {
      case 'appointment.booked':
        startsAt = new Date(event.data.startsAt);
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        break;
      case 'appointment.rescheduled':
        startsAt = new Date(event.data.to.startsAt);
        ptId = event.data.ptId;
        appointmentId = event.data.appointmentId;
        break;
      default:
        return { skipped: 'unsupported_trigger' };
    }

    const schedule = computeReminderSchedule(
      startsAt,
      new Date(event.ts ?? Date.now()),
    );
    if (schedule.kind === 'skipped') {
      await step.run('record-short-notice-skip', async () => {
        await db
          .insert(reminderJobs)
          .values({
            ptId,
            appointmentId,
            scheduledFor: startsAt,
            inngestRunId: runId,
            status: 'skipped',
            skippedReason: schedule.reason,
          })
          .onConflictDoUpdate({
            target: reminderJobs.appointmentId,
            set: {
              scheduledFor: startsAt,
              inngestRunId: runId,
              status: 'skipped',
              skippedReason: schedule.reason,
            },
          });
      });
      return { skipped: schedule.reason };
    }

    await step.run('record-reminder-schedule', () =>
      upsertReminderSchedule({
        ptId,
        appointmentId,
        scheduledFor: schedule.scheduledFor,
        runId,
      }),
    );
    await step.sleepUntil('wait-until-reminder', schedule.scheduledFor);

    for (let attempt = 1; attempt <= MAX_TEMPLATE_ATTEMPTS; attempt++) {
      const state = await step.run(`load-reminder-attempt-${attempt}`, () =>
        loadReminderAttempt({
          ptId,
          appointmentId,
          runId,
          scheduledFor: schedule.scheduledFor,
        }),
      );

      if (state.kind === 'skipped') {
        await step.run(`record-reminder-skip-${attempt}`, () =>
          markReminder({
            appointmentId,
            status:
              state.reason === 'appointment_cancelled'
                ? 'cancelled'
                : 'skipped',
            attempts: attempt,
            skippedReason: state.reason,
          }),
        );
        return { skipped: state.reason };
      }

      if (state.kind === 'retry') {
        if (attempt === MAX_TEMPLATE_ATTEMPTS) {
          await step.run('record-reminder-failure', () =>
            markReminder({
              appointmentId,
              status: 'failed',
              attempts: attempt,
              lastError: state.reason,
            }),
          );
          await step.sendEvent('emit-reminder-failed', {
            name: 'reminder.failed',
            data: {
              ptId,
              appointmentId,
              reason: state.reason,
            },
          });
          return { failed: state.reason };
        }
        await step.run(`record-reminder-requeue-${attempt}`, () =>
          markReminder({
            appointmentId,
            status: 'requeued',
            attempts: attempt,
            lastError: state.reason,
          }),
        );
        await step.sleep(
          `wait-reminder-retry-${attempt}`,
          `${TEMPLATE_RETRY_HOURS}h`,
        );
        continue;
      }

      const localTime = formatAppointmentTime(
        new Date(state.context.startsAt),
        state.context.timezone,
      );
      const content = `Reminder: ${state.context.patientName}, your appointment is ${localTime}.`;
      const message = await step.run('prepare-reminder-message', () =>
        prepareReminderMessage({
          ptId,
          appointmentId,
          conversationId: state.context.conversationId!,
          templateId: state.templateId,
          content,
        }),
      );
      const externalId = await step.run('send-reminder-template', async () => {
        if (message.externalId) return message.externalId;
        const result = await sendTemplate(
          state.context.connectionId!,
          state.context.recipient!,
          REMINDER_TEMPLATE.name,
          REMINDER_TEMPLATE.language,
          [state.context.patientName.split(/\s+/)[0] || 'there', localTime],
        );
        if (!result.messageId) {
          throw new Error(
            'WhatsApp accepted the reminder without returning a message ID',
          );
        }
        return result.messageId;
      });
      await step.run('persist-reminder-delivery', () =>
        persistReminderDelivery({
          appointmentId,
          messageId: message.id,
          externalId,
        }),
      );
      return { sent: externalId };
    }

    throw new Error('Reminder attempt loop exhausted unexpectedly');
  },
);
