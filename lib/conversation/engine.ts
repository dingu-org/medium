import { and, desc, eq, gte } from 'drizzle-orm';
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
import {
  appointments,
  conversations,
  messages,
  patients,
  pts,
} from '@/lib/db/schema';
import { createLogger, logger, serializeError } from '@/lib/log';
import { getServiceClient, withAuditLog } from '@/lib/tenancy';
import { ConversationEngineError } from './errors';
import {
  armHandoffOffer,
  businessLabel,
  handoffAcceptedMessage,
  handoffOfferMessage,
  resolveHandoffOffer,
  HANDOFF_ACCEPTED_MODEL,
} from './handoff-offer';
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
// belongs in it. This one decides whether a deterministic confirmation exists to
// send in place of the model's own words — none exists for an escalation, so the
// model must still speak there.
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
  practiceName: string | null;
  timezone: string;
  aiName: string | null;
  aiGreeting: string | null;
  title: string | null;
  address: string | null;
  retentionDays: number;
  assistantPaused: boolean;
  /** Patient message an outstanding handoff offer answered; null when none. */
  handoffOfferMessageId: string | null;
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
    pt_id: args.toolContext.ptId,
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
  // win. Discarding that prose is the contract — the patient gets exactly one
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
      handoffOfferMessageId: conversations.handoffOfferMessageId,
      patientId: patients.id,
      practiceName: pts.practiceName,
      timezone: pts.timezone,
      aiName: pts.aiName,
      aiGreeting: pts.aiGreeting,
      title: pts.title,
      address: pts.address,
      retentionDays: pts.retentionDays,
      assistantPaused: pts.assistantPaused,
      plan: pts.plan,
      planLifetime: pts.planLifetime,
      planExpiresAt: pts.planExpiresAt,
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
    handoffOfferMessageId: row.handoffOfferMessageId,
    practiceName: row.practiceName,
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
  const [existing] = await (executor ?? getServiceClient(inbound.ptId).db)
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
  /** Set to join a caller's transaction (the handoff offer arms itself in one). */
  executor?: Executor;
}): Promise<OutboundMessage> {
  const executor = args.executor ?? getServiceClient(args.inbound.ptId).db;
  const [inserted] = await executor
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

  const existing = await findExistingReply(args.inbound, executor);
  if (existing) return existing;
  throw new Error('AI reply insert conflicted but no existing reply was found');
}

async function conversationIsHumanOwned(
  context: PersistedContext,
): Promise<boolean> {
  const svc = getServiceClient(context.inbound.ptId);
  const [row] = await svc.db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, context.inbound.conversationId),
        eq(conversations.ptId, context.inbound.ptId),
        eq(conversations.patientId, context.inbound.patientId),
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
// patient must still get their reply instead of the turn throwing.
async function escalateToHuman(
  context: PersistedContext,
  reason: string,
  failure: string,
): Promise<'escalated' | 'already_human'> {
  const result = await dispatchTool(
    'escalate_to_human',
    { reason },
    {
      ptId: context.inbound.ptId,
      patientId: context.inbound.patientId,
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
 * Send the one static offer and arm it against this inbound message, in a
 * single transaction. Order matters more than it looks: an armed offer whose
 * message never reached the patient would make an ordinary "po" — how a patient
 * takes a proposed slot — silently escalate a conversation nobody offered
 * anything to, so the two facts commit together or not at all.
 *
 * The wording is deterministic but a billed model round produced it, exactly
 * like an appointment confirmation, so it carries the round's real metadata.
 */
async function persistHandoffOffer(
  context: PersistedContext,
  metadata: ModelTurnMetadata & { model: string },
): Promise<OutboundMessage> {
  const svc = getServiceClient(context.inbound.ptId);
  return svc.db.transaction(async (tx) => {
    const outbound = await persistReply({
      inbound: context.inbound,
      content: handoffOfferMessage(businessLabel(context.practiceName)),
      model: metadata.model,
      provider: metadata.provider,
      tokensIn: metadata.tokensIn,
      tokensOut: metadata.tokensOut,
      cachedTokens: metadata.cachedTokens,
      costMicrousd: metadata.costMicrousd,
      executor: tx,
    });
    await armHandoffOffer(tx, context.inbound);
    return outbound;
  });
}

/**
 * The patient answered the outstanding offer with the acceptance word. Escalate
 * exactly as `escalate_to_human` does — the assistant is off for this
 * conversation until the practitioner turns it back on — and confirm in one
 * fixed sentence, so the patient is not left with silence after saying yes.
 *
 * Escalation first, reply second, and not the other way round: a reply that
 * committed without its escalation would be answered by the idempotency check
 * on the retry, and the promise it just made would never be kept.
 */
async function acceptHandoffOffer(
  context: PersistedContext,
): Promise<OutboundMessage> {
  await escalateToHuman(
    context,
    'The patient accepted the offer to pass their question to the practice.',
    'Handoff-offer escalation failed',
  );
  return persistReply({
    inbound: context.inbound,
    content: handoffAcceptedMessage(businessLabel(context.practiceName)),
    model: HANDOFF_ACCEPTED_MODEL,
    provider: 'internal',
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    costMicrousd: 0,
  });
}

function logAssistantPausedSkip(context: PersistedContext): void {
  createLogger({
    pt_id: context.inbound.ptId,
    conversation_id: context.inbound.conversationId,
  }).info(
    'ai.assistant_paused',
    'Assistant globally paused; patient reply suppressed',
    { message_id: context.inbound.id, phase: 'inbound' },
  );
}

// 'booking_unconfirmed' is only truthful when the turn actually attempted a
// mutation; a turn that never got off the ground (provider outage, empty
// response) must not tell a patient with no booking that their booking could
// not be confirmed.
type FailedTurnCopy = 'booking_unconfirmed' | 'technical_failure';

// The failure path runs in a fresh invocation with no memory of what the dead
// turn managed to do, so the only available mutation signal is state: an
// appointment this patient gained at or after the inbound message arrived.
// Reschedules and cancellations leave no such trace, but the copy this selects
// is booking-specific anyway.
async function bookedSinceInbound(context: PersistedContext): Promise<boolean> {
  const svc = getServiceClient(context.inbound.ptId);
  const [row] = await svc.db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.ptId, context.inbound.ptId),
        eq(appointments.patientId, context.inbound.patientId),
        gte(appointments.createdAt, context.inbound.occurredAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function failedTurnHandoffResponse(
  copy: FailedTurnCopy,
  practiceName: string,
): string {
  if (copy === 'technical_failure') {
    return `Kam një problem teknik dhe nuk mund t'ju përgjigjem tani. Këtë bisedë ia kalova ${practiceName}; do t'ju përgjigjen sapo të jenë të lirë.`;
  }
  return `Nuk munda ta konfirmoj me siguri rezultatin e fundit të rezervimit. Këtë bisedë ia kalova ${practiceName} që ta verifikojnë dhe t'ju përgjigjen.`;
}

async function runFailedTurnHandoff(
  context: PersistedContext,
  copy: FailedTurnCopy,
  metadata: ModelTurnMetadata & { model: string },
): Promise<OutboundMessage> {
  await escalateToHuman(
    context,
    'The automated scheduling turn ended without a final response.',
    'Failed-turn escalation failed',
  );

  return persistReply({
    inbound: context.inbound,
    // Was an English 'the physical therapy practice', which was wrong twice
    // over: it named a discipline in a horizontal product, and it rendered a
    // stray English noun phrase inside an Albanian sentence.
    content: failedTurnHandoffResponse(
      copy,
      businessLabel(context.practiceName),
    ),
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
  cancellationActor?: 'ai' | 'patient';
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

  // An offer is answered before anything else, and answered exactly once: only
  // the message directly after it can accept, so a "po" that arrives later — or
  // one that takes a proposed time slot — falls through to a normal turn.
  if (context.handoffOfferMessageId) {
    const resolution = await resolveHandoffOffer({
      inbound: context.inbound,
      offerMessageId: context.handoffOfferMessageId,
    });
    if (resolution === 'accepted') return acceptHandoffOffer(context);
  }

  const history = await loadHistory(context.inbound);
  const configuredServices = await getServices(context.inbound.ptId, {
    activeOnly: true,
  });
  // Plan-gate the assistant identity: Free (and lapsed-past-grace Solo) fall
  // back to the default persona, Solo/lifetime keep the custom name/greeting.
  // Resolved from the raw stored plan on context. Covers patient +
  // reminder-fallback turns.
  const baseSystem = buildSystemPrompt({
    practiceName: context.practiceName,
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
      ptId: context.inbound.ptId,
      patientId: context.inbound.patientId,
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
        // pts.timezone, the same column loadAppointmentJobContext reads, so the
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

  if (result.outcome === 'handoff_offer') {
    return persistHandoffOffer(context, { ...result, model: args.modelId });
  }

  if (result.outcome === 'handoff_required') {
    return runFailedTurnHandoff(context, 'booking_unconfirmed', {
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
  allowInactive?: boolean;
  systemAddendum?: string;
  cancellationActor?: 'ai' | 'patient';
}): Promise<OutboundMessage> {
  return withAdvisoryLock(`ai-turn:${args.inboundMessage.id}`, () =>
    runTurnCoreUnlocked(args),
  );
}

function reminderSystemAddendum(context: ReminderTurnContext): string {
  const details = [
    '# Reminder response context',
    '',
    'The latest patient message is related to an appointment reminder.',
    'Reminder replies may be handled even if the PT has taken over the conversation.',
    'If the patient wants to cancel in this reminder context, call `cancel_appointment`; the system will record it as patient-cancelled.',
    'If the patient wants to reschedule, use `list_upcoming_appointments`, `get_availability`, and `reschedule_appointment` as needed.',
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
  if (context.practiceName?.trim()) {
    details.push(`- Practice name: ${context.practiceName.trim()}`);
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
      cancellationActor: 'patient',
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
        pt_id: args.inboundMessage.ptId,
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

    // Reached from onFailure after every attempt was exhausted, for any cause
    // (provider outage, timeout, empty read-only response) — so the neutral
    // technical wording unless the dead turn left a booking behind.
    return runFailedTurnHandoff(
      context,
      (await bookedSinceInbound(context))
        ? 'booking_unconfirmed'
        : 'technical_failure',
      {
        model: 'deterministic-failure-handoff',
        provider: 'internal',
        tokensIn: 0,
        tokensOut: 0,
        cachedTokens: 0,
        costMicrousd: 0,
      },
    );
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
        pt_id: args.inboundMessage.ptId,
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
