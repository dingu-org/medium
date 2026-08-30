import { and, desc, eq } from 'drizzle-orm';
import {
  generateText,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type StopCondition,
} from 'ai';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { buildModelSettings, getOpenRouterModel } from '@/lib/ai/client';
import { dispatchTool } from '@/lib/ai/dispatcher';
import {
  createConversationTools,
  type AppointmentMutationEffect,
  type ToolExecutionContext,
  type ToolResult,
  type ToolName,
} from '@/lib/ai/tools';
import { appointmentConfirmationContent } from '@/lib/format/appointment-confirmation';
import { selectModelForPlan } from '@/lib/ai/models';
import { effectiveAssistantIdentity } from '@/lib/billing/entitlements';
import type { PlanId } from '@/lib/billing/plans';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import type { DB, DBTransaction } from '@/lib/db';
import { conversations, messages, customers, accounts } from '@/lib/db/schema';
import { createLogger, logger, serializeError } from '@/lib/log';
import { getServiceClient, withAuditLog } from '@/lib/tenancy';
import { ConversationEngineError } from './errors';
import {
  businessLabel,
  escalationMessage,
  handoffOfferMessage,
} from './customer-copy';
import type {
  InboundMessage,
  OutboundMessage,
  ReminderTurnContext,
} from './types';
import { getServices } from '@/lib/services/queries';

const HISTORY_LIMIT = 20;
const STEP_LIMIT = 5;
// Tools whose call means the turn touched real state, so a turn that then went
// speechless has to hand off rather than throw and be retried.
// `offer_human_handoff` is deliberately absent: offering changes nothing, so a
// turn that offers and then dies is safe to retry from scratch.
const MUTATING_TOOLS = new Set<ToolName>([
  'book_appointment',
  'reschedule_appointment',
  'cancel_appointment',
  'escalate_to_human',
]);

// Deliberately not the same set as MUTATING_TOOLS, and the two must never be
// merged: that set decides whether an empty turn is a handoff, and an escalation
// belongs in it. This one is narrower — it decides which calls are announced by
// `appointmentConfirmationContent`, which speaks about an appointment. An
// escalation is announced too (`escalationMessage`, via its own outcome), just
// not by that function, so it does not belong here either.
const CONFIRMABLE_MUTATIONS = new Set<ToolName>([
  'book_appointment',
  'reschedule_appointment',
  'cancel_appointment',
]);

type ConversationTools = ReturnType<typeof createConversationTools>;

// The tool wrappers hand dispatchTool's ToolResult back untouched, so a step's
// tool output is that value verbatim — typed `unknown` here only because the
// step type unions in the dynamic-tool shape.
function mutationEffect(output: unknown): AppointmentMutationEffect | null {
  if (!output || typeof output !== 'object') return null;
  const result = output as ToolResult;
  return result.ok ? (result.effect ?? null) : null;
}

function confirmableEffects(
  step: StepResult<ConversationTools>,
): AppointmentMutationEffect[] {
  const effects: AppointmentMutationEffect[] = [];
  for (const toolResult of step.toolResults) {
    if (!CONFIRMABLE_MUTATIONS.has(toolResult.toolName as ToolName)) continue;
    const effect = mutationEffect(toolResult.output);
    if (effect) effects.push(effect);
  }
  return effects;
}

// Once a confirmable mutation has committed there is nothing left for the model
// to add: the change is already made and its wording is fixed. Stopping here is
// what saves the final round.
const stopOnConfirmedMutation: StopCondition<ConversationTools> = ({
  steps,
}) => {
  const latest = steps.at(-1);
  return latest ? confirmableEffects(latest).length > 0 : false;
};

/** A successful `offer_human_handoff` call in this step. */
function offeredHandoff(step: StepResult<ConversationTools>): boolean {
  return step.toolResults.some((toolResult) => {
    if (toolResult.toolName !== 'offer_human_handoff') return false;
    const output = toolResult.output;
    return Boolean(
      output && typeof output === 'object' && (output as ToolResult).ok,
    );
  });
}

// Same reasoning as the confirmation above: the offer's wording is fixed, so
// another round could only produce prose the engine would discard.
const stopOnHandoffOffer: StopCondition<ConversationTools> = ({ steps }) => {
  const latest = steps.at(-1);
  return latest ? offeredHandoff(latest) : false;
};

/** A successful `escalate_to_human` call in this step. */
function escalatedToHuman(step: StepResult<ConversationTools>): boolean {
  return step.toolResults.some((toolResult) => {
    if (toolResult.toolName !== 'escalate_to_human') return false;
    const output = toolResult.output;
    return Boolean(
      output && typeof output === 'object' && (output as ToolResult).ok,
    );
  });
}

/**
 * A handed-over conversation has nothing left for the model to say: the
 * confirmation is one fixed sentence (`escalationMessage`), so another round
 * could only produce prose the engine would discard. The same saving the
 * booking confirmation and the offer already make.
 *
 * This is also what makes the model the judge of acceptance, which is the whole
 * of C1. The offer no longer asks for a keyword and no code matches one: the
 * customer's answer arrives as an ordinary message, the model reads the offer it
 * is answering out of the conversation history, and agreeing is just another
 * reason to call `escalate_to_human` (see its tool description in
 * lib/ai/tools.ts).
 *
 * **The assumption that carries**: the offer has to still be visible in the flat
 * {@link HISTORY_LIMIT}-message window the turn is given. Normally it is the
 * message immediately before the reply, so this holds comfortably. An offer
 * answered twenty-plus messages later has scrolled out and is simply re-offered
 * — no worse than the anchor rule it replaces, where only the immediately-next
 * message could accept at all.
 */
const stopOnEscalation: StopCondition<ConversationTools> = ({ steps }) => {
  const latest = steps.at(-1);
  return latest ? escalatedToHuman(latest) : false;
};

type Dispatch = (
  toolName: ToolName,
  input: unknown,
  ctx: ToolExecutionContext,
) => Promise<ToolResult>;

/** Reads and writes a caller may need to run inside its own transaction. */
type Executor = DB | DBTransaction;

type PersistedContext = {
  inbound: InboundMessage;
  conversationAiActive: boolean;
  name: string | null;
  timezone: string;
  aiName: string | null;
  aiGreeting: string | null;
  title: string | null;
  address: string | null;
  retentionDays: number;
  assistantPaused: boolean;
  // Billing plan state (Phase 16 C1). Pre-wiring only: selected here so the
  // C2/C3 retention/identity gating has the fields; nothing acts on them yet.
  plan: PlanId;
  planLifetime: boolean;
  planExpiresAt: Date | null;
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
    })
  | (ModelTurnMetadata & {
      outcome: 'appointment_mutation';
      effect: AppointmentMutationEffect;
    })
  | (ModelTurnMetadata & {
      outcome: 'handoff_offer';
    })
  | (ModelTurnMetadata & {
      outcome: 'escalation';
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
  modelId?: string;
}): Promise<ModelTurnResult> {
  const tools = createConversationTools(
    args.toolContext,
    args.dispatch ?? dispatchTool,
  );
  const startedAt = Date.now();
  const result = await generateText({
    model: args.model,
    system: args.system,
    messages: args.messages,
    tools,
    stopWhen: [
      stepCountIs(STEP_LIMIT),
      stopOnConfirmedMutation,
      stopOnEscalation,
      stopOnHandoffOffer,
    ],
    temperature: 0.2,
    maxOutputTokens: 500,
    maxRetries: 0,
    timeout: 30_000,
  });
  const durationMs = Date.now() - startedAt;

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
  const reasoningTokens =
    result.totalUsage.outputTokenDetails.reasoningTokens ?? 0;

  // A confirmable mutation stops the loop, so any effect can only be on the last
  // step — the same step stopOnConfirmedMutation judged.
  const lastStep = result.steps.at(-1);
  const effects = lastStep ? confirmableEffects(lastStep) : [];

  const turnLogger = createLogger({
    account_id: args.toolContext.accountId,
    conversation_id: args.toolContext.conversationId,
  });
  // Per-turn cost/usage telemetry for the cost dashboard (Phase 11). ids +
  // counts only — no message content.
  //
  // `reasoningTokens` and `finishReason` are here because their absence is what
  // made a live empty-response outage un-diagnosable from these logs: a thinking
  // budget that swallows `maxOutputTokens` shows up as exactly this pair —
  // reasoning tokens at the ceiling and `finishReason: 'length'` — and as
  // nothing at all without them.
  turnLogger.info('ai.turn_completed', 'AI model turn completed', {
    model: args.modelId,
    provider: metadata.provider,
    tokensIn: metadata.tokensIn,
    tokensOut: metadata.tokensOut,
    cachedTokens: metadata.cachedTokens,
    reasoningTokens,
    costMicrousd: metadata.costMicrousd,
    steps: result.steps.length,
    finishReason: result.finishReason,
    durationMs,
    deterministic_confirmation: effects.length > 0,
  });

  // Ahead of the text branch on purpose: result.text is the LAST step's text, so
  // a model that wrote prose alongside the stopping tool call would otherwise
  // win. Discarding that prose is the contract — the customer gets exactly one
  // message per change and it is the deterministic one.
  if (effects.length > 0) {
    if (effects.length > 1) {
      // One step committed several changes. Only the last is announced, so the
      // others happened silently; the prompt steers against it, this catches it.
      turnLogger.warn(
        'ai.multi_mutation_turn',
        'A single step committed more than one appointment change',
        { count: effects.length },
      );
    }
    return {
      outcome: 'appointment_mutation',
      effect: effects[effects.length - 1],
      ...metadata,
    };
  }

  // Below the mutation branch and above the offer, and the order is the whole
  // point: a model that books a slot and escalates in the same step has done
  // both, but only the booking is news the customer must not lose — the
  // escalation reaches them through the professional who now owns the thread.
  // An offer, by contrast, is a question the escalation has already answered.
  if (lastStep && escalatedToHuman(lastStep)) {
    return { outcome: 'escalation', ...metadata };
  }

  // Below the mutation branch (a committed change outranks an offer to answer
  // something else) and above the text branch, for the same reason the
  // confirmation is: the offer is one fixed sentence, so any prose the model
  // wrote beside the tool call is discarded rather than sent alongside it.
  if (lastStep && offeredHandoff(lastStep)) {
    return { outcome: 'handoff_offer', ...metadata };
  }

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
      : 'Model returned no customer-facing text',
  );
}

async function loadContext(inbound: InboundMessage): Promise<PersistedContext> {
  const svc = getServiceClient(inbound.accountId);
  const [row] = await svc.db
    .select({
      messageId: messages.id,
      messageContent: messages.content,
      messageChannel: messages.channel,
      messageExternalId: messages.externalId,
      messageCreatedAt: messages.createdAt,
      conversationId: conversations.id,
      conversationAiActive: conversations.aiActive,
      customerId: customers.id,
      name: accounts.name,
      timezone: accounts.timezone,
      aiName: accounts.aiName,
      aiGreeting: accounts.aiGreeting,
      title: accounts.title,
      address: accounts.address,
      retentionDays: accounts.retentionDays,
      assistantPaused: accounts.assistantPaused,
      plan: accounts.plan,
      planLifetime: accounts.planLifetime,
      planExpiresAt: accounts.planExpiresAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .innerJoin(accounts, eq(conversations.accountId, accounts.id))
    .where(
      and(
        eq(messages.id, inbound.id),
        eq(messages.role, 'customer'),
        eq(messages.accountId, inbound.accountId),
        eq(messages.conversationId, inbound.conversationId),
        eq(conversations.customerId, inbound.customerId),
        eq(conversations.accountId, inbound.accountId),
        eq(customers.accountId, inbound.accountId),
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
      accountId: inbound.accountId,
      customerId: row.customerId,
      content: row.messageContent,
      channel: row.messageChannel,
      externalId: row.messageExternalId,
      occurredAt: row.messageCreatedAt,
    },
    conversationAiActive: row.conversationAiActive,
    name: row.name,
    timezone: row.timezone,
    aiName: row.aiName,
    aiGreeting: row.aiGreeting,
    title: row.title,
    address: row.address,
    retentionDays: row.retentionDays,
    assistantPaused: row.assistantPaused,
    plan: row.plan,
    planLifetime: row.planLifetime,
    planExpiresAt: row.planExpiresAt,
  };
}

async function findExistingReply(
  inbound: InboundMessage,
  executor?: Executor,
): Promise<OutboundMessage | null> {
  const [existing] = await (executor ?? getServiceClient(inbound.accountId).db)
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
        eq(messages.accountId, inbound.accountId),
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
  const svc = getServiceClient(inbound.accountId);
  const rows = await svc.db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, inbound.accountId),
        eq(messages.conversationId, inbound.conversationId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(HISTORY_LIMIT);

  return rows.reverse().map((row) => ({
    role: row.role === 'customer' ? 'user' : 'assistant',
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
  /** Set to join a caller's transaction. */
  executor?: Executor;
}): Promise<OutboundMessage> {
  const executor = args.executor ?? getServiceClient(args.inbound.accountId).db;
  const [inserted] = await executor
    .insert(messages)
    .values({
      accountId: args.inbound.accountId,
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

  const existing = await findExistingReply(args.inbound, executor);
  if (existing) return existing;
  throw new Error('AI reply insert conflicted but no existing reply was found');
}

async function conversationIsHumanOwned(
  context: PersistedContext,
): Promise<boolean> {
  const svc = getServiceClient(context.inbound.accountId);
  const [row] = await svc.db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, context.inbound.conversationId),
        eq(conversations.accountId, context.inbound.accountId),
        eq(conversations.customerId, context.inbound.customerId),
        eq(conversations.aiActive, false),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// escalate_to_human guards its UPDATE on aiActive, so the dispatcher reports
// `not_found` both for a missing conversation and for one that is already
// human-owned (the model escalated earlier in the same turn, or the PT took
// over). Only the first is a failure: when the thread is already escalated the
// customer must still get their reply instead of the turn throwing.
async function escalateToHuman(
  context: PersistedContext,
  reason: string,
  failure: string,
): Promise<'escalated' | 'already_human'> {
  const result = await dispatchTool(
    'escalate_to_human',
    { reason },
    {
      accountId: context.inbound.accountId,
      customerId: context.inbound.customerId,
      conversationId: context.inbound.conversationId,
    },
  );
  if (result.ok) return 'escalated';
  if (
    result.error.code === 'not_found' &&
    (await conversationIsHumanOwned(context))
  ) {
    return 'already_human';
  }
  throw new Error(`${failure}: ${result.error.code}`);
}

/**
 * Send the one static offer.
 *
 * The wording is deterministic but a billed model round produced it, exactly
 * like an appointment confirmation, so it carries the round's real metadata.
 *
 * Nothing is remembered about the offer, and nothing needs to be: it used to be
 * anchored to the customer message it answered so that the very next reply — and
 * only that one — could accept it by keyword. The model reads the offer out of
 * the history instead, so an offer is now just a message the assistant sent.
 */
async function persistHandoffOffer(
  context: PersistedContext,
  metadata: ModelTurnMetadata & { model: string },
): Promise<OutboundMessage> {
  return persistReply({
    inbound: context.inbound,
    content: handoffOfferMessage(businessLabel(context.name)),
    model: metadata.model,
    provider: metadata.provider,
    tokensIn: metadata.tokensIn,
    tokensOut: metadata.tokensOut,
    cachedTokens: metadata.cachedTokens,
    costMicrousd: metadata.costMicrousd,
  });
}

function logAssistantPausedSkip(context: PersistedContext): void {
  createLogger({
    account_id: context.inbound.accountId,
    conversation_id: context.inbound.conversationId,
  }).info(
    'ai.assistant_paused',
    'Assistant globally paused; customer reply suppressed',
    { message_id: context.inbound.id, phase: 'inbound' },
  );
}

/**
 * The turn ended without anything to say after touching real state, so a person
 * takes it. The customer is told the one escalation sentence and nothing else.
 *
 * There used to be two sentences chosen between: a neutral technical one, and a
 * booking-specific "I could not confirm the result of your last booking" picked
 * by looking for an appointment created since the inbound message arrived. Both
 * are gone. The second was the worse of the two — it told a customer with no
 * booking that their booking might have failed, on the strength of a state guess
 * made in a fresh invocation that remembers nothing of the dead turn — and the
 * first advertised a malfunction the customer can do nothing with. What is
 * useful and true is identical in both cases: a person has this now.
 */
async function runFailedTurnHandoff(
  context: PersistedContext,
  metadata: ModelTurnMetadata & { model: string },
): Promise<OutboundMessage> {
  await escalateToHuman(
    context,
    'The automated scheduling turn ended without a final response.',
    'Failed-turn escalation failed',
  );

  return persistReply({
    inbound: context.inbound,
    content: escalationMessage(businessLabel(context.name)),
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
  allowInactive?: boolean;
  systemAddendum?: string;
  cancellationActor?: 'ai' | 'customer';
}): Promise<OutboundMessage> {
  const context = await withAuditLog(
    {
      accountId: args.inboundMessage.accountId,
      actor: 'ai',
      action: 'ai.conversation.read',
      targetTable: 'messages',
      targetId: args.inboundMessage.id,
    },
    () => loadContext(args.inboundMessage),
  );
  const existing = await findExistingReply(context.inbound);
  if (existing) return existing;

  if (!context.conversationAiActive && !args.allowInactive) {
    throw new ConversationEngineError(
      'conversation_inactive',
      'AI is inactive because the conversation is assigned to a human',
    );
  }

  if (context.assistantPaused) {
    logAssistantPausedSkip(context);
    throw new ConversationEngineError(
      'assistant_paused',
      'Assistant is globally paused; no reply generated or sent',
    );
  }

  const history = await loadHistory(context.inbound);
  const configuredServices = await getServices(context.inbound.accountId, {
    activeOnly: true,
  });
  // Plan-gate the assistant identity: Free (and lapsed-past-grace Solo) fall
  // back to the default persona, Solo/lifetime keep the custom name/greeting.
  // Resolved from the raw stored plan on context. Covers customer +
  // reminder-fallback turns.
  const baseSystem = buildSystemPrompt({
    name: context.name,
    timezone: context.timezone,
    ...effectiveAssistantIdentity(
      {
        plan: context.plan,
        planLifetime: context.planLifetime,
        planExpiresAt: context.planExpiresAt,
        aiName: context.aiName,
        aiGreeting: context.aiGreeting,
      },
      args.now ?? new Date(),
    ),
    title: context.title,
    address: context.address,
    retentionDays: context.retentionDays,
    configuredServices,
    now: args.now,
  });
  const system = args.systemAddendum
    ? `${baseSystem}\n\n${args.systemAddendum}`
    : baseSystem;
  const result = await runModelTurn({
    model: args.model,
    modelId: args.modelId,
    system,
    messages: history,
    toolContext: {
      accountId: context.inbound.accountId,
      customerId: context.inbound.customerId,
      conversationId: context.inbound.conversationId,
      cancellationActor: args.cancellationActor,
    },
    dispatch: args.dispatch,
  });

  // Deterministic wording, but a billed model round did happen: stamping the
  // internal/zero metadata the other fixed-text paths use would under-report
  // every booking turn on the cost dashboard.
  if (result.outcome === 'appointment_mutation') {
    return persistReply({
      inbound: context.inbound,
      content: appointmentConfirmationContent({
        kind: result.effect.kind,
        startsAt: new Date(result.effect.startsAt),
        // accounts.timezone, the same column loadAppointmentJobContext reads, so the
        // background job would render this instant identically.
        timezone: context.timezone,
        serviceType: result.effect.serviceType,
      }),
      model: args.modelId,
      provider: result.provider,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cachedTokens: result.cachedTokens,
      costMicrousd: result.costMicrousd,
    });
  }

  // The tool already handed the conversation over; all that is owed here is the
  // fixed sentence saying so. Deterministic wording on a billed round, so it
  // carries the round's real metadata rather than the internal/zero stamp the
  // no-model paths use.
  if (result.outcome === 'escalation') {
    return persistReply({
      inbound: context.inbound,
      content: escalationMessage(businessLabel(context.name)),
      model: args.modelId,
      provider: result.provider,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      cachedTokens: result.cachedTokens,
      costMicrousd: result.costMicrousd,
    });
  }

  if (result.outcome === 'handoff_offer') {
    return persistHandoffOffer(context, { ...result, model: args.modelId });
  }

  if (result.outcome === 'handoff_required') {
    return runFailedTurnHandoff(context, { ...result, model: args.modelId });
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
  allowInactive?: boolean;
  systemAddendum?: string;
  cancellationActor?: 'ai' | 'customer';
}): Promise<OutboundMessage> {
  return withAdvisoryLock(`ai-turn:${args.inboundMessage.id}`, () =>
    runTurnCoreUnlocked(args),
  );
}

function reminderSystemAddendum(context: ReminderTurnContext): string {
  const details = [
    '# Reminder response context',
    '',
    'The latest customer message is related to an appointment reminder.',
    'Reminder replies may be handled even if the PT has taken over the conversation.',
    'If the customer wants to cancel in this reminder context, call `cancel_appointment`; the system will record it as customer-cancelled.',
    'If the customer wants to reschedule, use `list_upcoming_appointments`, `get_availability`, and `reschedule_appointment` as needed.',
  ];
  if (context.appointmentId) {
    details.push(`- Reminder appointment ID: ${context.appointmentId}`);
  }
  if (context.appointmentStartsAt) {
    details.push(
      `- Reminder appointment start: ${context.appointmentStartsAt}`,
    );
  }
  if (context.timezone) {
    details.push(`- Reminder appointment timezone: ${context.timezone}`);
  }
  if (context.name?.trim()) {
    details.push(`- Practice name: ${context.name.trim()}`);
  }
  if (context.reason === 'ambiguous_reminders') {
    details.push(
      '- Multiple reminder candidates may exist. Do not guess; ask a clarifying question or list upcoming appointments before changing anything.',
    );
  }
  return details.join('\n');
}

export async function runReminderTurn(args: {
  inboundMessage: InboundMessage;
  reminder: ReminderTurnContext;
  plan?: PlanId;
}): Promise<OutboundMessage> {
  const modelConfig = selectModelForPlan(args.plan ?? 'free');
  const modelId = modelConfig.primary;
  try {
    return await runTurnCore({
      inboundMessage: args.inboundMessage,
      modelId,
      model: getOpenRouterModel(modelId, buildModelSettings(modelConfig)),
      allowInactive: true,
      systemAddendum: reminderSystemAddendum(args.reminder),
      cancellationActor: 'customer',
    });
  } catch (error) {
    // A paused skip is benign (already info-logged in the engine core), not a
    // turn failure.
    if (
      !(
        error instanceof ConversationEngineError &&
        error.code === 'assistant_paused'
      )
    ) {
      logger.error('conversation.turn_failed', 'Conversation turn failed', {
        account_id: args.inboundMessage.accountId,
        conversation_id: args.inboundMessage.conversationId,
        message_id: args.inboundMessage.id,
        model: modelId,
        error_code:
          error instanceof ConversationEngineError
            ? error.code
            : 'unhandled_error',
        ...serializeError(error),
      });
    }
    throw error;
  }
}

export async function handoffFailedTurn(args: {
  inboundMessage: InboundMessage;
}): Promise<OutboundMessage> {
  return withAdvisoryLock(`ai-turn:${args.inboundMessage.id}`, async () => {
    const context = await withAuditLog(
      {
        accountId: args.inboundMessage.accountId,
        actor: 'system',
        action: 'ai.conversation.failure_handoff',
        targetTable: 'messages',
        targetId: args.inboundMessage.id,
      },
      () => loadContext(args.inboundMessage),
    );
    const existing = await findExistingReply(context.inbound);
    if (existing) return existing;

    // Reached from onFailure after every attempt was exhausted, for any cause
    // (provider outage, timeout, empty read-only response). No model round
    // happened, so the internal/zero stamp.
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
  plan?: PlanId;
}): Promise<OutboundMessage> {
  const modelConfig = selectModelForPlan(args.plan ?? 'free');
  const modelId = modelConfig.primary;
  try {
    return await runTurnCore({
      inboundMessage: args.inboundMessage,
      modelId,
      model: getOpenRouterModel(modelId, buildModelSettings(modelConfig)),
    });
  } catch (error) {
    // A paused skip is benign (already info-logged in the engine core), not a
    // turn failure.
    if (
      !(
        error instanceof ConversationEngineError &&
        error.code === 'assistant_paused'
      )
    ) {
      logger.error('conversation.turn_failed', 'Conversation turn failed', {
        account_id: args.inboundMessage.accountId,
        conversation_id: args.inboundMessage.conversationId,
        message_id: args.inboundMessage.id,
        model: modelId,
        error_code:
          error instanceof ConversationEngineError
            ? error.code
            : 'unhandled_error',
        ...serializeError(error),
      });
    }
    throw error;
  }
}
