import { and, desc, eq } from 'drizzle-orm';
import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { getOpenRouterModel } from '@/lib/ai/client';
import { dispatchTool } from '@/lib/ai/dispatcher';
import {
  createConversationTools,
  type ToolExecutionContext,
  type ToolResult,
  type ToolName,
} from '@/lib/ai/tools';
import { selectModel } from '@/lib/ai/models';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { conversations, messages, patients, pts } from '@/lib/db/schema';
import { getServiceClient, withAuditLog } from '@/lib/tenancy';
import { ConversationEngineError } from './errors';
import {
  detectSafetyEscalation,
  safetyEscalationResponse,
  type SafetyEscalationReason,
} from './safety';
import type { InboundMessage, OutboundMessage } from './types';

const HISTORY_LIMIT = 20;
const STEP_LIMIT = 5;
const MUTATING_TOOLS = new Set<ToolName>([
  'book_appointment',
  'reschedule_appointment',
  'cancel_appointment',
  'escalate_to_human',
]);

type Dispatch = (
  toolName: ToolName,
  input: unknown,
  ctx: ToolExecutionContext,
) => Promise<ToolResult>;

type PersistedContext = {
  inbound: InboundMessage;
  conversationAiActive: boolean;
  practiceName: string | null;
  timezone: string;
  aiName: string | null;
  aiGreeting: string | null;
  escalationKeyword: string | null;
  retentionDays: number;
};

type ModelTurnMetadata = {
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  provider: string;
  costMicrousd: number;
};

export type ModelTurnResult =
  | (ModelTurnMetadata & {
      outcome: 'response';
      text: string;
    })
  | (ModelTurnMetadata & {
      outcome: 'handoff_required';
      reason: 'empty_response' | 'step_limit_reached';
    });

function getOpenRouterStepMetadata(providerMetadata: unknown): {
  provider?: string;
  cost?: number;
} {
  if (!providerMetadata || typeof providerMetadata !== 'object') return {};
  const openrouter = (providerMetadata as Record<string, unknown>).openrouter;
  if (!openrouter || typeof openrouter !== 'object') return {};
  const metadata = openrouter as Record<string, unknown>;
  const usage =
    metadata.usage && typeof metadata.usage === 'object'
      ? (metadata.usage as Record<string, unknown>)
      : undefined;
  return {
    provider:
      typeof metadata.provider === 'string' ? metadata.provider : undefined,
    cost: typeof usage?.cost === 'number' ? usage.cost : undefined,
  };
}

export async function runModelTurn(args: {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  toolContext: ToolExecutionContext;
  dispatch?: Dispatch;
}): Promise<ModelTurnResult> {
  const tools = createConversationTools(
    args.toolContext,
    args.dispatch ?? dispatchTool,
  );
  const result = await generateText({
    model: args.model,
    system: args.system,
    messages: args.messages,
    tools,
    stopWhen: stepCountIs(STEP_LIMIT),
    temperature: 0.2,
    maxOutputTokens: 500,
    maxRetries: 0,
    timeout: 30_000,
  });

  let provider =
    typeof args.model === 'string' ? 'unknown' : args.model.provider;
  let cost = 0;
  for (const step of result.steps) {
    const metadata = getOpenRouterStepMetadata(step.providerMetadata);
    if (metadata.provider) provider = metadata.provider;
    if (metadata.cost) cost += metadata.cost;
  }

  const metadata: ModelTurnMetadata = {
    tokensIn: result.totalUsage.inputTokens ?? 0,
    tokensOut: result.totalUsage.outputTokens ?? 0,
    cachedTokens: result.totalUsage.inputTokenDetails.cacheReadTokens ?? 0,
    provider,
    costMicrousd: Math.round(cost * 1_000_000),
  };

  const text = result.text.trim();
  if (text) {
    return { outcome: 'response', text, ...metadata };
  }

  const reason =
    result.steps.length >= STEP_LIMIT && result.finishReason === 'tool-calls'
      ? 'step_limit_reached'
      : 'empty_response';
  const mutationAttempted = result.steps.some((step) =>
    step.toolCalls.some((call) =>
      MUTATING_TOOLS.has(call.toolName as ToolName),
    ),
  );
  if (mutationAttempted) {
    return { outcome: 'handoff_required', reason, ...metadata };
  }

  throw new ConversationEngineError(
    reason,
    reason === 'step_limit_reached'
      ? `Conversation turn reached the ${STEP_LIMIT}-step limit without a final response`
      : 'Model returned no patient-facing text',
  );
}

async function loadContext(inbound: InboundMessage): Promise<PersistedContext> {
  const svc = getServiceClient(inbound.ptId);
  const [row] = await svc.db
    .select({
      messageId: messages.id,
      messageContent: messages.content,
      messageChannel: messages.channel,
      messageExternalId: messages.externalId,
      messageCreatedAt: messages.createdAt,
      conversationId: conversations.id,
      conversationAiActive: conversations.aiActive,
      patientId: patients.id,
      practiceName: pts.practiceName,
      timezone: pts.timezone,
      aiName: pts.aiName,
      aiGreeting: pts.aiGreeting,
      escalationKeyword: pts.aiEscalationKeyword,
      retentionDays: pts.retentionDays,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .innerJoin(pts, eq(conversations.ptId, pts.id))
    .where(
      and(
        eq(messages.id, inbound.id),
        eq(messages.role, 'patient'),
        eq(messages.ptId, inbound.ptId),
        eq(messages.conversationId, inbound.conversationId),
        eq(conversations.patientId, inbound.patientId),
        eq(conversations.ptId, inbound.ptId),
        eq(patients.ptId, inbound.ptId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ConversationEngineError(
      'conversation_not_found',
      'Inbound message or tenant conversation context was not found',
    );
  }

  return {
    inbound: {
      id: row.messageId,
      conversationId: row.conversationId,
      ptId: inbound.ptId,
      patientId: row.patientId,
      content: row.messageContent,
      channel: row.messageChannel,
      externalId: row.messageExternalId,
      occurredAt: row.messageCreatedAt,
    },
    conversationAiActive: row.conversationAiActive,
    practiceName: row.practiceName,
    timezone: row.timezone,
    aiName: row.aiName,
    aiGreeting: row.aiGreeting,
    escalationKeyword: row.escalationKeyword,
    retentionDays: row.retentionDays,
  };
}

async function findExistingReply(
  inbound: InboundMessage,
): Promise<OutboundMessage | null> {
  const svc = getServiceClient(inbound.ptId);
  const [existing] = await svc.db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      replyToMessageId: messages.replyToMessageId,
      content: messages.content,
      channel: messages.channel,
    })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, inbound.ptId),
        eq(messages.conversationId, inbound.conversationId),
        eq(messages.role, 'ai'),
        eq(messages.replyToMessageId, inbound.id),
      ),
    )
    .limit(1);

  if (!existing?.replyToMessageId) return null;
  return existing as OutboundMessage;
}

async function loadHistory(inbound: InboundMessage): Promise<ModelMessage[]> {
  const svc = getServiceClient(inbound.ptId);
  const rows = await svc.db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, inbound.ptId),
        eq(messages.conversationId, inbound.conversationId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(HISTORY_LIMIT);

  return rows.reverse().map((row) => ({
    role: row.role === 'patient' ? 'user' : 'assistant',
    content: row.content,
  }));
}

async function persistReply(args: {
  inbound: InboundMessage;
  content: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  costMicrousd: number;
}): Promise<OutboundMessage> {
  const svc = getServiceClient(args.inbound.ptId);
  const [inserted] = await svc.db
    .insert(messages)
    .values({
      ptId: args.inbound.ptId,
      conversationId: args.inbound.conversationId,
      replyToMessageId: args.inbound.id,
      role: 'ai',
      channel: args.inbound.channel,
      content: args.content,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      cachedTokens: args.cachedTokens,
      model: args.model,
      provider: args.provider,
      aiCostMicrousd: args.costMicrousd,
    })
    .onConflictDoNothing()
    .returning({
      id: messages.id,
      conversationId: messages.conversationId,
      replyToMessageId: messages.replyToMessageId,
      content: messages.content,
      channel: messages.channel,
    });

  if (inserted?.replyToMessageId) return inserted as OutboundMessage;

  const existing = await findExistingReply(args.inbound);
  if (existing) return existing;
  throw new Error('AI reply insert conflicted but no existing reply was found');
}

async function runDeterministicEscalation(
  context: PersistedContext,
  reason: SafetyEscalationReason,
): Promise<OutboundMessage> {
  const toolContext = {
    ptId: context.inbound.ptId,
    patientId: context.inbound.patientId,
    conversationId: context.inbound.conversationId,
  };
  const result = await dispatchTool(
    'escalate_to_human',
    { reason },
    toolContext,
  );
  if (!result.ok) {
    throw new Error(`Deterministic escalation failed: ${result.error.code}`);
  }

  return persistReply({
    inbound: context.inbound,
    content: safetyEscalationResponse(
      reason,
      context.practiceName?.trim() || 'the physical therapy practice',
    ),
    model: 'deterministic-safety',
    provider: 'internal',
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    costMicrousd: 0,
  });
}

function failedTurnHandoffResponse(practiceName: string): string {
  return `I couldn't safely confirm the latest scheduling result. I've handed this conversation to ${practiceName} so they can verify it and follow up.`;
}

async function runFailedTurnHandoff(
  context: PersistedContext,
  metadata: ModelTurnMetadata & { model: string },
): Promise<OutboundMessage> {
  const result = await dispatchTool(
    'escalate_to_human',
    { reason: 'The automated scheduling turn ended without a final response.' },
    {
      ptId: context.inbound.ptId,
      patientId: context.inbound.patientId,
      conversationId: context.inbound.conversationId,
    },
  );
  if (!result.ok) {
    throw new Error(`Failed-turn escalation failed: ${result.error.code}`);
  }

  const practiceName =
    context.practiceName?.trim() || 'the physical therapy practice';
  return persistReply({
    inbound: context.inbound,
    content: failedTurnHandoffResponse(practiceName),
    model: metadata.model,
    provider: metadata.provider,
    tokensIn: metadata.tokensIn,
    tokensOut: metadata.tokensOut,
    cachedTokens: metadata.cachedTokens,
    costMicrousd: metadata.costMicrousd,
  });
}

async function runTurnCoreUnlocked(args: {
  inboundMessage: InboundMessage;
  model: LanguageModel;
  modelId: string;
  now?: Date;
  dispatch?: Dispatch;
}): Promise<OutboundMessage> {
  const context = await withAuditLog(
    {
      ptId: args.inboundMessage.ptId,
      actor: 'ai',
      action: 'ai.conversation.read',
      targetTable: 'messages',
      targetId: args.inboundMessage.id,
    },
    () => loadContext(args.inboundMessage),
  );
  const existing = await findExistingReply(context.inbound);
  if (existing) return existing;

  if (!context.conversationAiActive) {
    throw new ConversationEngineError(
      'conversation_inactive',
      'AI is inactive because the conversation is assigned to a human',
    );
  }

  const safetyReason = detectSafetyEscalation(
    context.inbound.content,
    context.escalationKeyword,
  );
  if (safetyReason) {
    return runDeterministicEscalation(context, safetyReason);
  }

  const history = await loadHistory(context.inbound);
  const system = buildSystemPrompt({
    practiceName: context.practiceName,
    timezone: context.timezone,
    aiName: context.aiName,
    aiGreeting: context.aiGreeting,
    escalationKeyword: context.escalationKeyword,
    retentionDays: context.retentionDays,
    now: args.now,
  });
  const result = await runModelTurn({
    model: args.model,
    system,
    messages: history,
    toolContext: {
      ptId: context.inbound.ptId,
      patientId: context.inbound.patientId,
      conversationId: context.inbound.conversationId,
    },
    dispatch: args.dispatch,
  });

  if (result.outcome === 'handoff_required') {
    return runFailedTurnHandoff(context, {
      ...result,
      model: args.modelId,
    });
  }

  return persistReply({
    inbound: context.inbound,
    content: result.text,
    model: args.modelId,
    provider: result.provider,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    cachedTokens: result.cachedTokens,
    costMicrousd: result.costMicrousd,
  });
}

export async function runTurnCore(args: {
  inboundMessage: InboundMessage;
  model: LanguageModel;
  modelId: string;
  now?: Date;
  dispatch?: Dispatch;
}): Promise<OutboundMessage> {
  return withAdvisoryLock(`ai-turn:${args.inboundMessage.id}`, () =>
    runTurnCoreUnlocked(args),
  );
}

export async function handoffFailedTurn(args: {
  inboundMessage: InboundMessage;
}): Promise<OutboundMessage> {
  return withAdvisoryLock(`ai-turn:${args.inboundMessage.id}`, async () => {
    const context = await withAuditLog(
      {
        ptId: args.inboundMessage.ptId,
        actor: 'system',
        action: 'ai.conversation.failure_handoff',
        targetTable: 'messages',
        targetId: args.inboundMessage.id,
      },
      () => loadContext(args.inboundMessage),
    );
    const existing = await findExistingReply(context.inbound);
    if (existing) return existing;

    return runFailedTurnHandoff(context, {
      model: 'deterministic-failure-handoff',
      provider: 'internal',
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      costMicrousd: 0,
    });
  });
}

export async function runTurn(args: {
  inboundMessage: InboundMessage;
}): Promise<OutboundMessage> {
  const modelId = selectModel();
  try {
    return await runTurnCore({
      inboundMessage: args.inboundMessage,
      modelId,
      model: getOpenRouterModel(modelId),
    });
  } catch (error) {
    console.error('[conversation-engine] turn failed', {
      ptId: args.inboundMessage.ptId,
      conversationId: args.inboundMessage.conversationId,
      messageId: args.inboundMessage.id,
      model: modelId,
      errorCode:
        error instanceof ConversationEngineError
          ? error.code
          : 'unhandled_error',
      errorName: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  }
}
