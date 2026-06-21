'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  ConnectionRevokedError,
  OutsideWindowError,
} from '@/lib/channels/whatsapp/errors';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import { db } from '@/lib/db';
import { conversations, messages, patients, whatsappConnections } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { createServerClient } from '@/lib/supabase/server';

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
  | { ok: false; reason: 'outside_window' | 'revoked' | 'no_connection' | 'error' };

const bodySchema = z.string().trim().min(1).max(4096);

/**
 * Send a free-form WhatsApp message as the PT. Forces the conversation into
 * manual mode (ai_active = false) so the AI doesn't talk over the PT, persists
 * the outbound message, and surfaces window / connection errors to the UI.
 */
export async function sendPtMessage(
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

/**
 * Toggle who is handling a conversation. Taking over disables the AI and emits
 * `conversation.taken_over` (Phase 5 offers to resume after PT inactivity).
 */
export async function setTakeover(
  conversationId: string,
  takeover: boolean,
): Promise<{ ok: boolean }> {
  const ptId = await requirePtId();

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
        and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
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

  revalidatePath(`/chat/${conversationId}`);
  return { ok: true };
}
