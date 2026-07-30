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
  patients,
  pts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { logger, serializeError } from '@/lib/log';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { REMINDER_TEMPLATE_PRIORITY } from '@/lib/inngest/functions/bootstrap-wa-connection';

async function requirePtId(): Promise<string> {
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
  const ptId = await requirePtId();

  await withAuditLog(
    {
      ptId,
      actor: 'pt',
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
              eq(conversations.ptId, ptId),
            ),
          )
          .returning({ patientId: conversations.patientId });

        if (!updated || !takeover) return null;

        return appendBackgroundEvent(tx, {
          type: 'conversation.taken_over',
          data: {
            ptId,
            conversationId,
            patientId: updated.patientId,
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
  const ptId = await requirePtId();
  const [throughMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.id, throughMessageId),
        eq(conversations.id, conversationId),
        eq(conversations.ptId, ptId),
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
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
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
  const ptId = await requirePtId();
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
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
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
  const ptId = await requirePtId();
  const [context] = await db
    .select({
      patientId: conversations.patientId,
      patientName: patients.name,
      waId: patients.waId,
      reminderOptedOutAt: patients.reminderOptedOutAt,
      practiceName: pts.practiceName,
      timezone: pts.timezone,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .innerJoin(pts, eq(conversations.ptId, pts.id))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
    )
    .limit(1);
  if (!context?.waId) return { ok: false, error: 'Biseda nuk u gjet.' };
  // The automated path skips an opted-out patient with `patient_opted_out`
  // (send-reminder.ts loadReminderAttempt); the manual one-tap send has to
  // honour the same NDAL/STOP, or it bills a template the patient refused.
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
          eq(whatsappConnections.ptId, ptId),
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
          eq(appointments.ptId, ptId),
          eq(appointments.patientId, context.patientId),
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
          eq(messageTemplates.ptId, ptId),
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

  const localTime = new Intl.DateTimeFormat('sq-AL', {
    timeZone: context.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(appointment.startsAt);
  const firstName = context.patientName.trim().split(/\s+/)[0] || 'Ju';
  const practiceName = context.practiceName?.trim() || 'praktika';
  const variables =
    definition.variableSet === 'legacy'
      ? [firstName, localTime]
      : [firstName, practiceName, localTime];

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

    // A manual template is billed by Meta and counts against the plan's monthly
    // reminder cap exactly like the automated one (send-reminder.ts gates on the
    // same helper) — without this the cap is circumventable one thread at a time.
    const sentAt = new Date();
    if (!(await reminderQuotaAvailable(ptId, sentAt))) {
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
    // NOT return the "not sent, try again" copy: that lures the PT into a second
    // paid template send that the 60s dedupe cannot catch (no messages row was
    // written). Report a distinct "sent but not saved" state and log the wamid.
    try {
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(messages)
          .values({
            ptId,
            conversationId,
            role: 'pt',
            channel: 'whatsapp',
            content: `Kujtesë për takimin më ${localTime}.`,
            templateId: template.id,
            externalId: sent.messageId,
          })
          .returning({ id: messages.id });
        // The reminder_jobs row is what makes the manual send visible to the rest
        // of the system: the plan meter counts jobs only (usage.ts), and
        // loadReminderCandidates joins jobs → messages, so without it the
        // patient's KONFIRMO/ANULO reply matches nothing and is dropped.
        await tx
          .insert(reminderJobs)
          .values({
            ptId,
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
            // job skipped — rewriting this 'sent' row, so the patient's
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
              // The patient's answer belongs to the cycle it answered, so it is
              // cleared exactly like upsertReminderSchedule does, or this send
              // inherits the previous cycle's reply and chooseCandidate filters
              // the row out — the patient's next ANULO would cancel nothing.
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
          // or a conversation paused for the WhatsApp-echo reason keeps showing a
          // stale "paused" badge after the PT sends a reminder.
          .set({ aiActive: false, aiPausedUntil: null, aiPauseReason: null })
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.ptId, ptId),
            ),
          );
      });
    } catch (error) {
      logger.error(
        'chat.reminder_persist_failed',
        'Reminder template sent but not persisted',
        {
          ptId,
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
}

export const sendUpcomingReminderTemplate = instrumentedAction(
  'chat.sendUpcomingReminderTemplate',
  sendUpcomingReminderTemplateImpl,
);
