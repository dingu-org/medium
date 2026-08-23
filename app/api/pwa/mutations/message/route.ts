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
  customers,
  pwaMutations,
  whatsappConnections,
} from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { getPwaAccountId } from '@/lib/pwa/auth';
import {
  beginPwaMutation,
  discardPwaMutation,
  failPwaMutation,
  markPwaMutationSent,
} from '@/lib/pwa/mutation-store';

export const runtime = 'nodejs';
// Keep an attempt shorter than the ledger's stale-processing window so a still
// running send can never be reclaimed as abandoned and re-invoked concurrently
// (mutation-store.ts) — a duplicate WhatsApp message for the customer.
export const maxDuration = 60;

const schema = z.object({
  clientMutationId: z.uuid(),
  conversationId: z.uuid(),
  body: z.string().trim().min(1).max(4096),
});

type FailureCode =
  | 'outside_window'
  | 'connection_revoked'
  | 'no_connection'
  | 'rate_limited'
  | 'persist_pending';

// discard: no side-effect happened -> delete the ledger row so a same-id retry
//          is a clean new attempt (re-sends).
// fail:    send rejected permanently OR outcome unknown -> mark 'failed' so a
//          same-id retry dead-ends (never auto-re-send a possibly-delivered msg).
// retain:  message WAS sent; only local persistence is incomplete -> leave the
//          ledger as-is ('sent', or 'processing' if the stamp itself failed) so
//          a same-id retry recovers by finishing the DB write.
type SendOutcome =
  | { ok: true; messageId: string | null; localMessageId: string | null }
  | {
      ok: false;
      disposition: 'discard' | 'fail' | 'retain';
      error: string;
      status: number;
      code?: FailureCode;
    };

const PERSIST_PENDING_ERROR =
  'Mesazhi u dërgua, po ruhet — provo sërish nëse nuk shfaqet.';

function jsonError(error: string, status: number, code?: FailureCode) {
  return NextResponse.json(
    code ? { ok: false, error, code } : { ok: false, error },
    { status },
  );
}

export async function POST(request: Request) {
  const accountId = await getPwaAccountId();
  if (!accountId) return jsonError('Pa autorizim', 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Mesazhi nuk është i vlefshëm.', 400);
  const input = parsed.data;

  const started = await beginPwaMutation({
    accountId,
    clientMutationId: input.clientMutationId,
    type: 'message.send',
  });
  if (started.kind === 'success') return NextResponse.json(started.result);
  if (started.kind === 'failed') return jsonError(started.error, 409);
  if (started.kind === 'processing') {
    return jsonError('Ndryshimi është ende duke u përpunuar.', 503);
  }

  // started.kind is 'new' (fresh send) or 'recover' (Graph already succeeded on
  // a prior attempt; skip the Graph call and only finish the DB write).
  const recover =
    started.kind === 'recover'
      ? { externalMessageId: started.externalMessageId }
      : null;

  const result = await sendMessage({
    accountId,
    clientMutationId: input.clientMutationId,
    conversationId: input.conversationId,
    body: input.body,
    recover,
  });

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      localMessageId: result.localMessageId,
    });
  }

  if (result.disposition === 'discard') {
    await discardPwaMutation({ accountId, clientMutationId: input.clientMutationId });
  } else if (result.disposition === 'fail') {
    await failPwaMutation({
      accountId,
      clientMutationId: input.clientMutationId,
      error: result.error,
    });
  }
  // 'retain': leave the ledger untouched so a same-id retry recovers.

  return jsonError(result.error, result.status, result.code);
}

async function sendMessage(input: {
  accountId: string;
  clientMutationId: string;
  conversationId: string;
  body: string;
  recover: { externalMessageId: string | null } | null;
}): Promise<SendOutcome> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      customerId: conversations.customerId,
      waId: customers.waId,
    })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.accountId, input.accountId),
      ),
    )
    .limit(1);

  if (!conversation?.waId) {
    return {
      ok: false,
      disposition: 'discard',
      error: 'Biseda nuk u gjet.',
      status: 404,
    };
  }

  let externalMessageId: string | null;
  if (input.recover) {
    // A prior attempt already delivered this message; never call Graph again.
    externalMessageId = input.recover.externalMessageId;
  } else {
    const [connection] = await db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.accountId, input.accountId),
          eq(whatsappConnections.status, 'active'),
        ),
      )
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1);

    if (!connection) {
      return {
        ok: false,
        disposition: 'discard',
        error: 'WhatsApp nuk është i lidhur.',
        status: 409,
        code: 'no_connection',
      };
    }

    try {
      const res = await sendFreeForm(
        connection.id,
        conversation.waId,
        input.body,
      );
      externalMessageId = res.messageId;
    } catch (error) {
      return graphFailure(error);
    }

    // The message is delivered. Record it BEFORE the messages insert so a
    // persistence failure (or crash) is recoverable via begin()'s 'recover'
    // path instead of re-sending. If the stamp itself fails the DB is
    // unavailable -> retain (no re-send); see the residual-risk note.
    try {
      await markPwaMutationSent({
        accountId: input.accountId,
        clientMutationId: input.clientMutationId,
        externalMessageId,
      });
    } catch {
      return {
        ok: false,
        disposition: 'retain',
        error: PERSIST_PENDING_ERROR,
        status: 503,
        code: 'persist_pending',
      };
    }
  }

  let committed: { localMessageId: string | null; eventId: string | null };
  try {
    committed = await db.transaction(async (tx) => {
      // Answering by hand IS a takeover (the composer never calls setTakeover),
      // so read the source state under a row lock: only a real on -> off flip may
      // emit `conversation.taken_over`, which is what arms the resume offer. A
      // second reply on an already-inactive thread must not re-arm it.
      const [before] = await tx
        .select({ aiActive: conversations.aiActive })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversation.id),
            eq(conversations.accountId, input.accountId),
          ),
        )
        .for('update')
        .limit(1);

      const [inserted] = await tx
        .insert(messages)
        .values({
          accountId: input.accountId,
          conversationId: conversation.id,
          role: 'account',
          channel: 'whatsapp',
          content: input.body,
          externalId: externalMessageId,
          sourceEventId: input.clientMutationId,
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });

      await tx
        .update(conversations)
        .set({ aiActive: false, aiPausedUntil: null, aiPauseReason: null })
        .where(
          and(
            eq(conversations.id, conversation.id),
            eq(conversations.accountId, input.accountId),
          ),
        );

      const eventId = before?.aiActive
        ? await appendBackgroundEvent(tx, {
            type: 'conversation.taken_over',
            data: {
              accountId: input.accountId,
              conversationId: conversation.id,
              customerId: conversation.customerId,
              takenOverAt: new Date().toISOString(),
            },
          })
        : null;

      let localId: string | null;
      if (inserted) {
        localId = inserted.id;
      } else {
        const [existing] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.sourceEventId, input.clientMutationId))
          .limit(1);
        localId = existing?.id ?? null;
      }

      // Flip the ledger to success in the SAME commit as the message row so the
      // two can never diverge (fully atomic success). This replaces the former
      // completePwaMutation() call.
      await tx
        .update(pwaMutations)
        .set({
          status: 'success',
          result: {
            ok: true,
            messageId: externalMessageId,
            localMessageId: localId,
          },
          error: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(pwaMutations.accountId, input.accountId),
            eq(pwaMutations.clientMutationId, input.clientMutationId),
          ),
        );

      return { localMessageId: localId, eventId };
    });
  } catch {
    // Delivered but persistence failed. Row stays 'sent' -> retry recovers.
    return {
      ok: false,
      disposition: 'retain',
      error: PERSIST_PENDING_ERROR,
      status: 503,
      code: 'persist_pending',
    };
  }

  if (committed.eventId) await tryPublishOutboxEvent(committed.eventId);
  return {
    ok: true,
    messageId: externalMessageId,
    localMessageId: committed.localMessageId,
  };
}

function graphFailure(error: unknown): SendOutcome {
  if (error instanceof OutsideWindowError) {
    return {
      ok: false,
      disposition: 'discard',
      error: 'Dritarja 24-orëshe e përgjigjes është mbyllur.',
      status: 409,
      code: 'outside_window',
    };
  }
  if (error instanceof ConnectionRevokedError) {
    return {
      ok: false,
      disposition: 'discard',
      error: 'WhatsApp nuk është i lidhur.',
      status: 409,
      code: 'connection_revoked',
    };
  }
  if (error instanceof GraphApiError) {
    if (error.status === 429) {
      return {
        ok: false,
        disposition: 'discard',
        error: 'WhatsApp po kufizon mesazhet. Provo pas pak.',
        status: 429,
        code: 'rate_limited',
      };
    }
    // Non-429: 5xx = ambiguous (may have delivered), 4xx = rejected. Either way
    // no external id was returned; mark 'failed' so a same-id retry dead-ends
    // (never auto-re-send a possibly-delivered message).
    return {
      ok: false,
      disposition: 'fail',
      error:
        'WhatsApp nuk e dërgoi mesazhin. Provo sërish ose rilidhe WhatsApp-in.',
      status: error.status >= 500 ? 502 : 409,
    };
  }
  // Unknown throw (e.g. fetch network error / timeout): outcome unknown -> fail.
  return {
    ok: false,
    disposition: 'fail',
    error: 'Mesazhi WhatsApp nuk u dërgua. Provo sërish.',
    status: 500,
  };
}
