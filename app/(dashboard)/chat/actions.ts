'use server';

import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ConnectionRevokedError,
  OutsideWindowError,
} from '@/lib/channels/whatsapp/errors';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
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
  whatsappConnections,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
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

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'outside_window' | 'revoked' | 'no_connection' | 'error';
    };

const bodySchema = z.string().trim().min(1).max(4096);

/**
 * Send a free-form WhatsApp message as the PT. Forces the conversation into
 * manual mode (ai_active = false) so the AI doesn't talk over the PT, persists
 * the outbound message, and surfaces window / connection errors to the UI.
 */
async function sendPtMessageImpl(
  conversationId: string,
  rawBody: string,
): Promise<SendResult> {
  const ptId = await requirePtId();
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return { ok: false, reason: 'error' };
  const body = parsed.data;

  const [conversation] = await db
    .select({
      id: conversations.id,
      patientId: conversations.patientId,
      waId: patients.waId,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
    )
    .limit(1);

  if (!conversation?.waId) return { ok: false, reason: 'error' };

  const [connection] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.ptId, ptId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (!connection) return { ok: false, reason: 'no_connection' };

  let messageId: string | null;
  try {
    const res = await sendFreeForm(connection.id, conversation.waId, body);
    messageId = res.messageId;
  } catch (error) {
    if (error instanceof OutsideWindowError)
      return { ok: false, reason: 'outside_window' };
    if (error instanceof ConnectionRevokedError)
      return { ok: false, reason: 'revoked' };
    return { ok: false, reason: 'error' };
  }

  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      ptId,
      conversationId,
      role: 'pt',
      channel: 'whatsapp',
      content: body,
      externalId: messageId,
    });
    await tx
      .update(conversations)
      .set({
        aiActive: false,
        aiPausedUntil: null,
        aiPauseReason: null,
      })
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
      );
  });

  revalidatePath(`/chat/${conversationId}`);
  return { ok: true };
}

export const sendPtMessage = instrumentedAction(
  'chat.sendPtMessage',
  sendPtMessageImpl,
);

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
    .select({ createdAt: messages.createdAt })
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
      // Pass an ISO string (not the raw Date): a JS Date interpolated into a
      // sql`` template has no column-type context, so postgres-js can't
      // serialize it and throws before the query runs.
      lastReadAt: sql`GREATEST(
        COALESCE(${conversations.lastReadAt}, '-infinity'::timestamptz),
        ${throughMessage.createdAt.toISOString()}::timestamptz
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
        : { closedAt: null, aiActive: true, escalationState: 'idle' },
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
      .select({ startsAt: appointments.startsAt })
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

    try {
      const result = await sendTemplate(
        connection.id,
        waId,
        definition.name,
        definition.language,
        variables,
      );
      await db.transaction(async (tx) => {
        await tx.insert(messages).values({
          ptId,
          conversationId,
          role: 'pt',
          channel: 'whatsapp',
          content: `Kujtesë për takimin më ${localTime}.`,
          templateId: template.id,
          externalId: result.messageId,
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
      revalidatePath(`/chat/${conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Kujtesa nuk u dërgua. Provo sërish.' };
    }
  });
}

export const sendUpcomingReminderTemplate = instrumentedAction(
  'chat.sendUpcomingReminderTemplate',
  sendUpcomingReminderTemplateImpl,
);
