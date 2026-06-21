import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import {
  ConnectionRevokedError,
  GraphApiError,
  OutsideWindowError,
} from '@/lib/channels/whatsapp/errors';
import { db } from '@/lib/db';
import {
  conversations,
  messages,
  patients,
  whatsappConnections,
} from '@/lib/db/schema';
import { getPwaPtId } from '@/lib/pwa/auth';
import {
  beginPwaMutation,
  completePwaMutation,
  failPwaMutation,
} from '@/lib/pwa/mutation-store';

export const runtime = 'nodejs';

const schema = z.object({
  clientMutationId: z.uuid(),
  conversationId: z.uuid(),
  body: z.string().trim().min(1).max(4096),
});

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const ptId = await getPwaPtId();
  if (!ptId) return jsonError('Unauthorized', 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Invalid message.', 400);
  const input = parsed.data;

  const started = await beginPwaMutation({
    ptId,
    clientMutationId: input.clientMutationId,
    type: 'message.send',
  });
  if (started.kind === 'success') return NextResponse.json(started.result);
  if (started.kind === 'failed') return jsonError(started.error, 409);
  if (started.kind === 'processing') {
    return jsonError('Mutation is still processing.', 503);
  }

  let result: Awaited<ReturnType<typeof sendMessage>>;
  try {
    result = await sendMessage({
      ptId,
      clientMutationId: input.clientMutationId,
      conversationId: input.conversationId,
      body: input.body,
    });
  } catch (error) {
    const failure = messageFor(error);
    await failPwaMutation({
      ptId,
      clientMutationId: input.clientMutationId,
      error: failure.error,
    });
    return jsonError(failure.error, failure.status);
  }

  if (!result.ok) {
    await failPwaMutation({
      ptId,
      clientMutationId: input.clientMutationId,
      error: result.error,
    });
    return jsonError(result.error, result.status);
  }

  await completePwaMutation({
    ptId,
    clientMutationId: input.clientMutationId,
    result,
  });
  return NextResponse.json(result);
}

async function sendMessage(input: {
  ptId: string;
  clientMutationId: string;
  conversationId: string;
  body: string;
}): Promise<
  | { ok: true; messageId: string | null; localMessageId: string | null }
  | { ok: false; error: string; status: number }
> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      patientId: conversations.patientId,
      waId: patients.waId,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.ptId, input.ptId),
      ),
    )
    .limit(1);

  if (!conversation?.waId) {
    return { ok: false, error: 'Conversation not found.', status: 404 };
  }

  const [connection] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.ptId, input.ptId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (!connection) {
    return { ok: false, error: 'WhatsApp is not connected.', status: 409 };
  }

  let externalMessageId: string | null;
  try {
    const res = await sendFreeForm(connection.id, conversation.waId, input.body);
    externalMessageId = res.messageId;
  } catch (error) {
    if (error instanceof OutsideWindowError) {
      return {
        ok: false,
        error: 'The 24-hour reply window is closed.',
        status: 409,
      };
    }
    if (error instanceof ConnectionRevokedError) {
      return { ok: false, error: 'WhatsApp is not connected.', status: 409 };
    }
    throw error;
  }

  const localMessageId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        ptId: input.ptId,
        conversationId: conversation.id,
        role: 'pt',
        channel: 'whatsapp',
        content: input.body,
        externalId: externalMessageId,
        sourceEventId: input.clientMutationId,
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });

    await tx
      .update(conversations)
      .set({
        aiActive: false,
        aiPausedUntil: null,
        aiPauseReason: null,
      })
      .where(
        and(
          eq(conversations.id, conversation.id),
          eq(conversations.ptId, input.ptId),
        ),
      );

    if (inserted) return inserted.id;
    const [existing] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sourceEventId, input.clientMutationId))
      .limit(1);
    return existing?.id ?? null;
  });

  return { ok: true, messageId: externalMessageId, localMessageId };
}

function messageFor(error: unknown): { error: string; status: number } {
  if (error instanceof GraphApiError) {
    if (error.status === 429) {
      return {
        error: 'WhatsApp is rate limiting messages. Try again in a moment.',
        status: 429,
      };
    }
    return {
      error: 'WhatsApp could not send the message. Try again or reconnect WhatsApp.',
      status: error.status >= 500 ? 502 : 409,
    };
  }
  return {
    error: 'Could not send the WhatsApp message. Please try again.',
    status: 500,
  };
}
