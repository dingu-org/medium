'use server';

import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { reminderQuotaAvailable } from '@/lib/billing/usage';
import { sendTemplate } from '@/lib/channels/whatsapp/client';
import { db } from '@/lib/db';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import {
  appointments,
  conversations,
  messageTemplates,
  messages,
  customers,
  accounts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { formatAppointmentTime } from '@/lib/format/appointment-time';
import { logger, serializeError } from '@/lib/log';
import { remindersEnabled } from '@/lib/reminders/flag';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { REMINDER_TEMPLATE_PRIORITY } from '@/lib/inngest/functions/bootstrap-wa-connection';

async function requireAccountId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

/**
 * Toggle who is handling a conversation. Taking over disables the AI and emits
 * `conversation.taken_over` (Phase 5 offers to resume after PT inactivity).
 */
async function setTakeoverImpl(
  conversationId: string,
  takeover: boolean,
): Promise<{ ok: boolean }> {
  const accountId = await requireAccountId();

  await withAuditLog(
    {
      accountId,
      actor: 'account',
      action: 'conversation.takeover',
      targetTable: 'conversations',
      targetId: conversationId,
      metadata: { takeover },
    },
    async () => {
      const eventId = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(conversations)
          .set(
            takeover
              ? {
                  aiActive: false,
                  aiPausedUntil: null,
                  aiPauseReason: null,
                }
              : {
                  aiActive: true,
                  aiPausedUntil: null,
                  aiPauseReason: null,
                  escalationState: 'idle',
                },
          )
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.accountId, accountId),
            ),
          )
          .returning({ customerId: conversations.customerId });

        if (!updated || !takeover) return null;

        return appendBackgroundEvent(tx, {
          type: 'conversation.taken_over',
          data: {
            accountId,
            conversationId,
            customerId: updated.customerId,
            takenOverAt: new Date().toISOString(),
          },
        });
      });

      if (eventId) await tryPublishOutboxEvent(eventId);
    },
  );

  revalidatePath(`/chat/${conversationId}`);
  return { ok: true };
}

export const setTakeover = instrumentedAction(
  'chat.setTakeover',
  setTakeoverImpl,
);

async function markConversationReadImpl(
  conversationId: string,
  throughMessageId: string,
): Promise<{ ok: boolean }> {
  const accountId = await requireAccountId();
  const [throughMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.id, throughMessageId),
        eq(conversations.id, conversationId),
        eq(conversations.accountId, accountId),
      ),
    )
    .limit(1);
  if (!throughMessage) return { ok: false };

  await db
    .update(conversations)
    .set({
      // Resolve the watermark entirely in SQL: messages.created_at (from now())
      // carries microsecond precision but a JS Date only has milliseconds, so
      // round-tripping the timestamp through JS lands last_read_at fractionally
      // before the message and leaves that last message counted as unread forever.
      lastReadAt: sql`GREATEST(
        COALESCE(${conversations.lastReadAt}, '-infinity'::timestamptz),
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.id = ${throughMessageId}
            AND m.conversation_id = ${conversationId}
        )
      )`,
    })
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)),
    );
  revalidatePath('/chat');
  return { ok: true };
}

export const markConversationRead = instrumentedAction(
  'chat.markConversationRead',
  markConversationReadImpl,
);

async function setConversationClosedImpl(
  conversationId: string,
  closed: boolean,
): Promise<{ ok: boolean }> {
  const accountId = await requireAccountId();
  await db
    .update(conversations)
    .set(
      closed
        ? {
            closedAt: new Date(),
            aiActive: false,
            aiPausedUntil: null,
            aiPauseReason: null,
            escalationState: 'idle',
          }
        : {
            closedAt: null,
            aiActive: true,
            // Mirror every other resume path: a closed conversation can still
            // pick up a WhatsApp-echo pause, and leaving it set means the UI
            // reports the AI as on while the next inbound is silently skipped.
            aiPausedUntil: null,
            aiPauseReason: null,
            escalationState: 'idle',
          },
    )
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)),
    );
  revalidatePath('/chat');
  revalidatePath(`/chat/${conversationId}`);
  return { ok: true };
}

export const setConversationClosed = instrumentedAction(
  'chat.setConversationClosed',
  setConversationClosedImpl,
);

async function sendUpcomingReminderTemplateImpl(
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  // The real gate. `chat-thread.tsx` hides the button on the same flag, but a
  // server action is callable by anyone holding its id, so the refusal has to
  // live here — and ahead of the auth and DB work, because there is nothing to
  // authorize: this is the last hand-operated way to send a WhatsApp template
  // and reminders are parked (see lib/reminders/flag.ts).
  //
  // Consequence, accepted deliberately by the owner: outside the 24h service
  // window WhatsApp permits nothing but an approved template, so with this
  // refused a professional cannot reach a customer who has been silent longer
  // than that. The composer keeps the explanation card and simply offers no
  // action. Re-engagement becomes its own feature alongside the reminder
  // redesign; do not route around this gate.
  if (!remindersEnabled()) {
    return { ok: false, error: 'Kujtesat janë të çaktivizuara.' };
  }
  const accountId = await requireAccountId();
  const [context] = await db
    .select({
      customerId: conversations.customerId,
      customerName: customers.name,
      waId: customers.waId,
      reminderOptedOutAt: customers.reminderOptedOutAt,
      name: accounts.name,
      timezone: accounts.timezone,
    })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .innerJoin(accounts, eq(conversations.accountId, accounts.id))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)),
    )
    .limit(1);
  if (!context?.waId) return { ok: false, error: 'Biseda nuk u gjet.' };
  // The automated path skips an opted-out customer with `customer_opted_out`
  // (send-reminder.ts loadReminderAttempt); the manual one-tap send has to
  // honour the same NDAL/STOP, or it bills a template the customer refused.
  if (context.reminderOptedOutAt) {
    return { ok: false, error: 'Klienti ka çaktivizuar kujtesat.' };
  }
  // Hoist out of `context` so the narrowing survives into the closure below.
  const waId = context.waId;

  const [[connection], [appointment], templateRows] = await Promise.all([
    db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.accountId, accountId),
          eq(whatsappConnections.status, 'active'),
        ),
      )
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
    db
      .select({ id: appointments.id, startsAt: appointments.startsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.accountId, accountId),
          eq(appointments.customerId, context.customerId),
          inArray(appointments.status, ['pending', 'confirmed']),
          gt(appointments.startsAt, new Date()),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(1),
    db
      .select({
        id: messageTemplates.id,
        name: messageTemplates.name,
        language: messageTemplates.language,
      })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.accountId, accountId),
          eq(messageTemplates.status, 'approved'),
          inArray(
            messageTemplates.name,
            REMINDER_TEMPLATE_PRIORITY.map((template) => template.name),
          ),
        ),
      ),
  ]);
  if (!connection) return { ok: false, error: 'WhatsApp nuk është i lidhur.' };
  if (!appointment) return { ok: false, error: 'Nuk ka takim të ardhshëm.' };

  const definition = REMINDER_TEMPLATE_PRIORITY.find((candidate) =>
    templateRows.some(
      (row) =>
        row.name === candidate.name && row.language === candidate.language,
    ),
  );
  const template = definition
    ? templateRows.find(
        (row) =>
          row.name === definition.name && row.language === definition.language,
      )
    : null;
  if (!definition || !template) {
    return {
      ok: false,
      error: 'Shablloni i kujtesës nuk është miratuar ende.',
    };
  }

  // Must be the SHARED formatter, not a local one: this fills the same variable
  // slot of the same approved template that send-reminder.ts fills automatically,
  // so a second formatter here makes one booking arrive as two different times
  // depending on whether the PT tapped send or the job fired.
  const localTime = formatAppointmentTime(
    appointment.startsAt,
    context.timezone,
  );
  const firstName = context.customerName.trim().split(/\s+/)[0] || 'Ju';
  const name = context.name?.trim() || 'praktika';
  const variables =
    definition.variableSet === 'legacy'
      ? [firstName, localTime]
      : [firstName, name, localTime];

  // Serialize per conversation and skip if this same reminder template was just
  // sent — otherwise a double-tap (before the button's pending state commits)
  // sends, and pays for, two identical WhatsApp templates.
  return withAdvisoryLock(`reminder:${conversationId}`, async () => {
    const [recent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, template.id),
          gt(messages.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
      .limit(1);
    if (recent) {
      revalidatePath(`/chat/${conversationId}`);
      return { ok: true };
    }

    // The conversation lock above only serializes retries of THIS thread, so two
    // manual sends fired at once in two different conversations for the same PT
    // could both read "quota available" before either books a reminder_jobs row.
    // Nest a PT-scoped lock around the check-and-consume section — a second key
    // on the same withAdvisoryLock connection, so it serializes across
    // conversations without reserving another pooled connection per attempt.
    return withAdvisoryLock(`reminder-quota:${accountId}`, async () => {
      // A manual template is billed by Meta and counts against the plan's
      // monthly reminder cap exactly like the automated one (send-reminder.ts
      // gates on the same helper) — without this the cap is circumventable one
      // thread at a time.
      const sentAt = new Date();
      if (!(await reminderQuotaAvailable(accountId, sentAt))) {
        return { ok: false, error: 'Kufiri i kujtesave u arrit për këtë muaj.' };
      }

      let sent: { messageId: string | null };
      try {
        sent = await sendTemplate(
          connection.id,
          waId,
          definition.name,
          definition.language,
          variables,
        );
      } catch {
        // Not sent (Graph refused/failed) — safe to invite a retry.
        return { ok: false, error: 'Kujtesa nuk u dërgua. Provo sërish.' };
      }

      // The template HAS been sent (and billed). A persistence failure here must
      // NOT return the "not sent, try again" copy: that lures the PT into a
      // second paid template send that the 60s dedupe cannot catch (no messages
      // row was written). Report a distinct "sent but not saved" state and log
      // the wamid.
      try {
        await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(messages)
            .values({
              accountId,
              conversationId,
              role: 'account',
              channel: 'whatsapp',
              content: `Kujtesë për takimin më ${localTime}.`,
              templateId: template.id,
              externalId: sent.messageId,
            })
            .returning({ id: messages.id });
          // The reminder_jobs row is what makes the manual send visible to the
          // rest of the system: the plan meter counts jobs only (usage.ts), and
          // loadReminderCandidates joins jobs → messages, so without it the
          // customer's KONFIRMO/ANULO reply matches nothing and is dropped.
          await tx
            .insert(reminderJobs)
            .values({
              accountId,
              appointmentId: appointment.id,
              scheduledFor: sentAt,
              status: 'sent',
              sentAt,
              messageId: created.id,
            })
            .onConflictDoUpdate({
              target: reminderJobs.appointmentId,
              // One job per appointment, so this stamps the manual send onto a
              // still-scheduled automated job. inngestRunId/scheduledFor are left
              // untouched deliberately: clearing them makes the sleeping run trip
              // loadReminderAttempt's stale_run guard, and that branch marks the
              // job skipped — rewriting this 'sent' row, so the customer's
              // KONFIRMO/ANULO in the final hours matches no candidate and the
              // appointment badge claims no reminder was sent. The woken run
              // cannot double-send either way: prepareReminderMessage reuses the
              // messageId below and its wamid instead of paying for a second
              // template (send-reminder.ts).
              set: {
                status: 'sent',
                attempts: 0,
                lastError: null,
                skippedReason: null,
                sentAt,
                messageId: created.id,
                // The customer's answer belongs to the cycle it answered, so it is
                // cleared exactly like upsertReminderSchedule does, or this send
                // inherits the previous cycle's reply and chooseCandidate filters
                // the row out — the customer's next ANULO would cancel nothing.
                // `delivered_at` is NOT cleared, for the same reason as there: it
                // is a Meta-billed fact and the only source of monthly usage
                // (lib/billing/usage.ts countDeliveredReminders), so wiping it
                // would refund quota the PT already spent. The trade-off is that
                // markReminderDelivered is first-write-wins, so a manual nudge on
                // an appointment whose automated reminder was already delivered is
                // not separately counted.
                responseType: null,
                respondedAt: null,
                responseMessageId: null,
              },
            });
          await tx
            .update(conversations)
            // Match every other pause path: clear aiPausedUntil/aiPauseReason too,
            // or a conversation paused for the WhatsApp-echo reason keeps showing
            // a stale "paused" badge after the PT sends a reminder.
            .set({ aiActive: false, aiPausedUntil: null, aiPauseReason: null })
            .where(
              and(
                eq(conversations.id, conversationId),
                eq(conversations.accountId, accountId),
              ),
            );
        });
      } catch (error) {
        logger.error(
          'chat.reminder_persist_failed',
          'Reminder template sent but not persisted',
          {
            accountId,
            conversationId,
            externalId: sent.messageId,
            ...serializeError(error),
          },
        );
        return {
          ok: false,
          error: 'Kujtesa u dërgua, por nuk u ruajt. Rifresko bisedën.',
        };
      }
      revalidatePath(`/chat/${conversationId}`);
      return { ok: true };
    });
  });
}

export const sendUpcomingReminderTemplate = instrumentedAction(
  'chat.sendUpcomingReminderTemplate',
  sendUpcomingReminderTemplateImpl,
);
