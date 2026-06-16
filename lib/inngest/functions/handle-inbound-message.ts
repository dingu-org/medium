import { and, eq, isNull } from 'drizzle-orm';
import { APICallError } from 'ai';
import { NonRetriableError, type GetStepTools } from 'inngest';
import { db } from '@/lib/db';
import {
  conversations,
  messages,
  patients,
  whatsappConnections,
} from '@/lib/db/schema';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import { ConversationEngineError } from '@/lib/conversation/errors';
import type { InboundMessage, OutboundMessage } from '@/lib/conversation/types';
import { inngest } from '../client';

type RunTurn = typeof import('@/lib/conversation/engine').runTurn;

export type InboundJobContext = {
  inbound: Omit<InboundMessage, 'occurredAt'> & { occurredAt: string };
  aiActive: boolean;
  connectionId: string | null;
  recipient: string | null;
};

function hydrateInbound(inbound: InboundJobContext['inbound']): InboundMessage {
  return {
    ...inbound,
    occurredAt: new Date(inbound.occurredAt),
  };
}

export async function loadInboundJobContext(args: {
  messageId: string;
  ptId: string;
  conversationId: string;
}): Promise<InboundJobContext | null> {
  const [row] = await db
    .select({
      messageId: messages.id,
      content: messages.content,
      channel: messages.channel,
      externalId: messages.externalId,
      createdAt: messages.createdAt,
      conversationId: conversations.id,
      aiActive: conversations.aiActive,
      patientId: patients.id,
      waId: patients.waId,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(
        eq(messages.id, args.messageId),
        eq(messages.ptId, args.ptId),
        eq(messages.role, 'patient'),
        eq(conversations.id, args.conversationId),
        eq(conversations.ptId, args.ptId),
        eq(patients.ptId, args.ptId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [connection] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.ptId, args.ptId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .limit(1);

  return {
    inbound: {
      id: row.messageId,
      conversationId: row.conversationId,
      ptId: args.ptId,
      patientId: row.patientId,
      content: row.content,
      channel: row.channel,
      externalId: row.externalId,
      occurredAt: row.createdAt.toISOString(),
    },
    aiActive: row.aiActive,
    connectionId: connection?.id ?? null,
    recipient: row.waId,
  };
}

export async function runInboundTurn(
  context: InboundJobContext,
  runTurnFn?: RunTurn,
): Promise<
  | { kind: 'outbound'; outbound: OutboundMessage }
  | { kind: 'skipped'; reason: string }
> {
  try {
    const executeTurn =
      runTurnFn ?? (await import('@/lib/conversation/engine')).runTurn;
    const outbound = await executeTurn({
      inboundMessage: hydrateInbound(context.inbound),
    });
    return { kind: 'outbound', outbound };
  } catch (error) {
    if (
      error instanceof ConversationEngineError &&
      (error.code === 'conversation_not_found' ||
        error.code === 'conversation_inactive')
    ) {
      return { kind: 'skipped', reason: error.code };
    }
    if (APICallError.isInstance(error) && !error.isRetryable) {
      throw new NonRetriableError(error.message, { cause: error });
    }
    throw error;
  }
}

export async function sendInboundReply(args: {
  outbound: OutboundMessage;
  connectionId: string;
  recipient: string;
  sendFn?: typeof sendFreeForm;
}): Promise<{ messageId: string; alreadyDelivered: boolean }> {
  const [stored] = await db
    .select({ externalId: messages.externalId })
    .from(messages)
    .where(eq(messages.id, args.outbound.id))
    .limit(1);

  if (stored?.externalId) {
    return { messageId: stored.externalId, alreadyDelivered: true };
  }

  const result = await (args.sendFn ?? sendFreeForm)(
    args.connectionId,
    args.recipient,
    args.outbound.content,
  );
  if (!result.messageId) {
    throw new Error(
      'WhatsApp accepted the reply without returning a message ID',
    );
  }
  return { messageId: result.messageId, alreadyDelivered: false };
}

export async function persistInboundReplyDelivery(args: {
  outboundId: string;
  messageId: string;
}): Promise<void> {
  await db
    .update(messages)
    .set({ externalId: args.messageId })
    .where(and(eq(messages.id, args.outboundId), isNull(messages.externalId)));
}

async function recoverFailedInbound(args: {
  messageId: string;
  ptId: string;
  conversationId: string;
  step: GetStepTools<typeof inngest>;
}) {
  await args.step.sendEvent('emit-conversation-failed', {
    name: 'conversation.failed',
    data: {
      ptId: args.ptId,
      conversationId: args.conversationId,
      messageId: args.messageId,
    },
  });

  const context = await args.step.run('load-failed-context', () =>
    loadInboundJobContext(args),
  );
  if (!context?.connectionId || !context.recipient) {
    return { recovered: false, reason: 'delivery_context_missing' };
  }

  const outbound = await args.step.run('create-failure-handoff', async () => {
    const { handoffFailedTurn } = await import('@/lib/conversation/engine');
    return handoffFailedTurn({
      inboundMessage: hydrateInbound(context.inbound),
    });
  });
  const delivery = await args.step.run('send-failure-handoff', () =>
    sendInboundReply({
      outbound,
      connectionId: context.connectionId!,
      recipient: context.recipient!,
    }),
  );
  await args.step.run('persist-failure-delivery', () =>
    persistInboundReplyDelivery({
      outboundId: outbound.id,
      messageId: delivery.messageId,
    }),
  );
  return { recovered: true };
}

export const handleInboundMessage = inngest.createFunction(
  {
    id: 'handle-inbound-message',
    retries: 2,
    idempotency: 'event.data.messageId',
    concurrency: {
      limit: 1,
      key: 'event.data.conversationId',
    },
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data;
      return recoverFailedInbound({
        messageId: original.messageId,
        ptId: original.ptId,
        conversationId: original.conversationId,
        step,
      });
    },
  },
  { event: 'message.received' },
  async ({ event, step }) => {
    const context = await step.run('load-context', () =>
      loadInboundJobContext(event.data),
    );
    if (!context) return { skipped: 'conversation_not_found' };
    if (!context.aiActive) return { skipped: 'conversation_inactive' };
    if (!context.connectionId || !context.recipient) {
      return { skipped: 'delivery_context_missing' };
    }

    const turn = await step.run('run-ai-turn', () => runInboundTurn(context));
    if (turn.kind === 'skipped') return { skipped: turn.reason };

    const delivery = await step.run('send-outbound', () =>
      sendInboundReply({
        outbound: turn.outbound,
        connectionId: context.connectionId!,
        recipient: context.recipient!,
      }),
    );
    await step.run('persist-delivery', () =>
      persistInboundReplyDelivery({
        outboundId: turn.outbound.id,
        messageId: delivery.messageId,
      }),
    );

    return {
      outboundMessageId: turn.outbound.id,
      externalId: delivery.messageId,
      replay: delivery.alreadyDelivered,
    };
  },
);
