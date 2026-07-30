import { and, count, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import { addHours, addMinutes, subHours } from 'date-fns';
import { db } from '@/lib/db';
import {
  messageTemplates,
  messages,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { sendTemplate } from '@/lib/channels/whatsapp/client';
import {
  emitReminderLimitReachedOnce,
  reminderQuotaAvailable,
} from '@/lib/billing/usage';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { inngest } from '../client';
import {
  REMINDER_TEMPLATE_PRIORITY,
  type ReminderTemplateDefinition,
} from './bootstrap-wa-connection';
import {
  formatAppointmentTime,
  loadAppointmentJobContext,
} from './appointment-context';

const SHORT_NOTICE_MINUTES = 5;
const MINIMUM_NOTICE_HOURS = 2;
const TEMPLATE_RETRY_HOURS = 6;
const MAX_TEMPLATE_ATTEMPTS = 3;

type ApprovedReminderTemplate = ReminderTemplateDefinition & { id: string };

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
        // The row is unique per appointment, so a reschedule re-arms the SAME
        // row. The patient's answer belongs to the cycle it answered, so it is
        // cleared or the new send inherits the old cycle's reply (Today's
        // unanswered list, deterministic replies). `delivered_at` is NOT cleared:
        // it is a Meta-billed fact and the only source of monthly reminder usage
        // (lib/billing/usage.ts countDeliveredReminders), so wiping it would let
        // a reschedule refund quota the PT already spent.
        responseType: null,
        respondedAt: null,
        responseMessageId: null,
      },
    });
}

/**
 * An appointment moved inside the minimum-notice window: the row is parked as
 * skipped and no replacement reminder will ever be sent. So unlike a re-arm this
 * path touches only the scheduling columns — the previous cycle's delivery
 * (`delivered_at`, Meta-billed, drives monthly usage) and the patient's answer
 * to it are facts that already happened and must survive.
 */
export async function recordShortNoticeSkip(args: {
  ptId: string;
  appointmentId: string;
  startsAt: Date;
  runId: string;
  reason: string;
}): Promise<void> {
  await db
    .insert(reminderJobs)
    .values({
      ptId: args.ptId,
      appointmentId: args.appointmentId,
      scheduledFor: args.startsAt,
      inngestRunId: args.runId,
      status: 'skipped',
      skippedReason: args.reason,
    })
    .onConflictDoUpdate({
      target: reminderJobs.appointmentId,
      set: {
        scheduledFor: args.startsAt,
        inngestRunId: args.runId,
        status: 'skipped',
        skippedReason: args.reason,
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

/**
 * Meta's `messaging_limit_tier` is stored verbatim from Graph
 * (poll-whatsapp-health), i.e. TIER_50 / TIER_250 / TIER_1K / TIER_10K /
 * TIER_100K / TIER_UNLIMITED. The K/M suffix carries the magnitude, so it must
 * be multiplied out — scraping digits alone reads TIER_1K as a limit of 1 and
 * throttles the PT to one template per 24h. Unrecognised strings are treated as
 * uncapped so a future tier never silently blocks reminders.
 */
export function tierLimit(tier: string | null): number | null {
  if (!tier) return null;
  const normalized = tier.trim().toUpperCase();
  if (normalized.includes('UNLIMITED')) return null;
  const match = normalized.match(/^TIER_(\d+)(K|M)?$/);
  if (!match) return null;
  const magnitude = match[2] === 'M' ? 1_000_000 : match[2] === 'K' ? 1_000 : 1;
  const limit = Number(match[1]) * magnitude;
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

async function selectApprovedReminderTemplate(
  ptId: string,
): Promise<ApprovedReminderTemplate | null> {
  const rows = await db
    .select({
      id: messageTemplates.id,
      name: messageTemplates.name,
      language: messageTemplates.language,
      status: messageTemplates.status,
    })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.ptId, ptId),
        eq(messageTemplates.status, 'approved'),
        inArray(
          messageTemplates.name,
          REMINDER_TEMPLATE_PRIORITY.map((template) => template.name),
        ),
      ),
    );

  for (const template of REMINDER_TEMPLATE_PRIORITY) {
    const row = rows.find(
      (candidate) =>
        candidate.name === template.name &&
        candidate.language === template.language,
    );
    if (row) return { ...template, id: row.id };
  }
  return null;
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
      template: ApprovedReminderTemplate;
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
  if (context.reminderOptedOutAt) {
    return { kind: 'skipped', reason: 'patient_opted_out' };
  }
  if (context.startsAt <= now) {
    return { kind: 'skipped', reason: 'appointment_started' };
  }
  if (!context.connectionId || !context.recipient || !context.conversationId) {
    return { kind: 'skipped', reason: 'connection_inactive' };
  }

  // Plan reminder quota (Phase 16 C3): (delivered + in-flight) this month vs the
  // plan limit. Exhausted → skip, not retry (quota won't free within the retry
  // window and the appointment must be flagged now). The caller marks the job
  // skipped with `plan_reminder_quota` (surfaced on the appointment badge) and
  // emits `billing.limit_reached{kind:'reminders'}` — nothing fails silently.
  if (!(await reminderQuotaAvailable(args.ptId, now))) {
    return { kind: 'skipped', reason: 'plan_reminder_quota' };
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

  const template = await selectApprovedReminderTemplate(args.ptId);
  if (!template) {
    return { kind: 'retry', reason: 'template_not_approved' };
  }

  return { kind: 'ready', context, template };
}

function patientFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Ju';
}

function templateVariables(args: {
  template: ApprovedReminderTemplate;
  patientName: string;
  practiceName: string | null;
  localTime: string;
}): string[] {
  const firstName = patientFirstName(args.patientName);
  if (args.template.variableSet === 'legacy') {
    return [firstName, args.localTime];
  }
  return [firstName, args.practiceName?.trim() || 'praktika', args.localTime];
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

/**
 * A reminder the PT will never see delivered. The failed row and the PT-facing
 * `reminder.failed` share one transaction so the bell/push signal is durable
 * (outbox) rather than a fire-and-forget Inngest send — same shape as the other
 * NOTIFICATION_TYPES emitters (appointment-events, poll-whatsapp-health).
 */
export async function recordReminderFailure(args: {
  ptId: string;
  appointmentId: string;
  scheduledFor: Date;
  runId: string;
  error: string;
}): Promise<void> {
  const eventId = await db.transaction(async (tx) => {
    await tx
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
    return appendBackgroundEvent(tx, {
      type: 'reminder.failed',
      data: {
        ptId: args.ptId,
        appointmentId: args.appointmentId,
        reason: args.error,
      },
    });
  });
  await tryPublishOutboxEvent(eventId);
}

/** Same durable signal for the in-run give-up after MAX_TEMPLATE_ATTEMPTS. */
async function recordReminderAttemptFailure(args: {
  ptId: string;
  appointmentId: string;
  attempts: number;
  reason: string;
}): Promise<void> {
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(reminderJobs)
      .set({
        status: 'failed',
        attempts: args.attempts,
        lastError: args.reason,
      })
      .where(eq(reminderJobs.appointmentId, args.appointmentId));
    return appendBackgroundEvent(tx, {
      type: 'reminder.failed',
      data: {
        ptId: args.ptId,
        appointmentId: args.appointmentId,
        reason: args.reason,
      },
    });
  });
  await tryPublishOutboxEvent(eventId);
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
      await step.run('record-short-notice-skip', () =>
        recordShortNoticeSkip({
          ptId,
          appointmentId,
          startsAt,
          runId,
          reason: schedule.reason,
        }),
      );
      await step.sendEvent('emit-short-notice-reminder-skipped', {
        name: 'reminder.skipped',
        data: { ptId, appointmentId, reason: schedule.reason },
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
        await step.sendEvent(`emit-reminder-skipped-${attempt}`, {
          name: 'reminder.skipped',
          data: { ptId, appointmentId, reason: state.reason },
        });
        // The reminder cap is a hard stop: notify the PT once this month
        // (billing.limit_reached → push/bell), on top of the flagged badge.
        if (state.reason === 'plan_reminder_quota') {
          await step.run(`emit-reminder-quota-reached-${attempt}`, () =>
            emitReminderLimitReachedOnce(ptId, new Date()),
          );
        }
        return { skipped: state.reason };
      }

      if (state.kind === 'retry') {
        if (attempt === MAX_TEMPLATE_ATTEMPTS) {
          await step.run('record-reminder-failure', () =>
            recordReminderAttemptFailure({
              ptId,
              appointmentId,
              attempts: attempt,
              reason: state.reason,
            }),
          );
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
      const practiceName = state.context.practiceName?.trim() || 'praktika';
      const content = `Kujtesë: ${patientFirstName(state.context.patientName)}, takimi juaj me ${practiceName} është më ${localTime}.`;
      const message = await step.run('prepare-reminder-message', () =>
        prepareReminderMessage({
          ptId,
          appointmentId,
          conversationId: state.context.conversationId!,
          templateId: state.template.id,
          content,
        }),
      );
      const externalId = await step.run('send-reminder-template', async () => {
        if (message.externalId) return message.externalId;
        const result = await sendTemplate(
          state.context.connectionId!,
          state.context.recipient!,
          state.template.name,
          state.template.language,
          templateVariables({
            template: state.template,
            patientName: state.context.patientName,
            practiceName: state.context.practiceName,
            localTime,
          }),
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
