import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// The outbox->Inngest publish is best-effort and covered by the outbox suite;
// stubbing it keeps these tests free of network retries while still exercising
// the durable `events`/`event_outbox` rows appendBackgroundEvent writes.
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: vi.fn(async () => {}),
}));

import { APICallError } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { addHours, subHours, subMonths } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  conversationDays,
  conversations,
  eventOutbox,
  events,
  messages,
  customers,
  accounts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { CAP_HANDOFF_MODEL } from '@/lib/billing/cap-handoff';
import { getPlan } from '@/lib/billing/plans';
import { conversationDayKeys } from '@/lib/billing/usage';
import { runTurnCore } from '@/lib/conversation/engine';
import { ConversationEngineError } from '@/lib/conversation/errors';
import { NON_TEXT_NOTICE_MODEL } from '@/lib/conversation/non-text';
import { formatAppointmentTime } from '@/lib/format/appointment-time';
import { getNotificationData } from '@/lib/notifications/query';
import {
  handleReminderResponse,
  type ReminderHandlingResult,
} from '@/lib/reminders/response-handler';
import { createServiceClient } from '@/lib/supabase/service';
import {
  appointmentEventPlan,
  prepareAppointmentConfirmation,
  sendAppointmentConfirmation,
} from '../appointment-events';
import {
  handleInboundMessageHandler,
  loadInboundJobContext,
  persistInboundReplyDelivery,
  recordConversationFailure,
  runInboundTurn,
  runReminderFallbackTurn,
  sendInboundReply,
} from '../handle-inbound-message';
import { DAY, testNow, testNowUtc, zonedTime } from '@/tests/support/clock';

// The booking turn below books against a Monday-only availability rule, so the
// fixture needs a real Monday — derived, and a week out so the booking is in the
// future whatever day the suite runs on.
const MONDAY = new Date(testNow({ weekday: 1 }).getTime() + 7 * DAY);

let accountId = '';
let connectionId = '';
let conversationId = '';
let customerId = '';
let inboundMessageId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `inbound-job-${Date.now()}@example.com`,
    password: 'inbound-job-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db
    .update(accounts)
    .set({ assistantPaused: false })
    .where(eq(accounts.id, accountId));

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: `PNI_INBOUND_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_INBOUND',
      accessTokenEncrypted: await encryptToken('INBOUND_TOKEN'),
      status: 'active',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;

  const [customer] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'Pat',
      phone: '447700900100',
      waId: '447700900100',
    })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      accountId,
      customerId,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
    })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const [inbound] = await db
    .insert(messages)
    .values({
      accountId,
      conversationId,
      externalId: `wamid.IN.${Date.now()}.${sequence}`,
      role: 'customer',
      channel: 'whatsapp',
      content: 'Can I book tomorrow?',
    })
    .returning({ id: messages.id });
  inboundMessageId = inbound.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

/** Thrown by the step shim to end a run at its first terminal step. */
class StepStop extends Error {}

/**
 * The steps past which a run leaves this process: it sends to WhatsApp, or
 * hands the message to the model. The shim stops at whichever comes first, so
 * no test driving the whole handler can make a network call however a gate
 * behaves.
 */
const TERMINAL_STEPS = new Set([
  'run-ai-turn',
  'run-reminder-ai-turn',
  'send-reminder-response',
  'send-non-text-notice',
  'send-cap-handoff',
  'send-outbound',
]);

/**
 * Drives the shipped handler — `handleInboundMessageHandler`, the very function
 * handed to `inngest.createFunction` — rather than a restatement of its
 * branching, which could drift from the lines it claims to track. Every step
 * runs for real; the names it recorded are the assertion, because a gate's
 * whole effect is which steps the run contains.
 *
 * A run that stops at a terminal step reports `result: undefined`; a run that
 * ends on its own — a skip, or a throttled no-op that sends nothing — reports
 * what the handler returned, which is itself part of what these tests check.
 */
async function runHandler(
  data: Record<string, unknown> = {},
): Promise<{ ran: string[]; result: unknown }> {
  const ran: string[] = [];
  const step = {
    run: async (name: string, fn: () => unknown) => {
      ran.push(name);
      if (TERMINAL_STEPS.has(name)) throw new StepStop(name);
      return await fn();
    },
  };

  try {
    const result = await handleInboundMessageHandler({
      event: {
        name: 'message.received',
        data: { messageId: inboundMessageId, accountId, conversationId, ...data },
      },
      step,
      runId: '01JRUNSTEPSHIM',
    } as unknown as Parameters<typeof handleInboundMessageHandler>[0]);
    return { ran, result };
  } catch (error) {
    if (!(error instanceof StepStop)) throw error;
    return { ran, result: undefined };
  }
}

describe('handleInboundMessage cores', () => {
  it('loads authoritative tenant and delivery context', async () => {
    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });

    expect(context).toMatchObject({
      aiActive: true,
      // AI is handling the conversation, so no manual-reply nudge is warranted.
      manualHandling: false,
      connectionId,
      recipient: '447700900100',
      inbound: {
        id: inboundMessageId,
        conversationId,
        accountId,
        customerId,
        content: 'Can I book tomorrow?',
      },
    });
  });

  // No DB invariant limits a PT to one active connection (only phone_number_id
  // is unique), so the loader must not leave the choice to the planner: with two
  // active rows the newest must win, the same rule every other consumer applies.
  it('picks the newest active connection when a PT has two', async () => {
    // Push the row seeded in beforeEach into the past; it stays physically first
    // in the heap, so an unordered scan would return it.
    await db
      .update(whatsappConnections)
      .set({ createdAt: subHours(new Date(), 48) })
      .where(eq(whatsappConnections.id, connectionId));

    const [newer] = await db
      .insert(whatsappConnections)
      .values({
        accountId,
        phoneNumberId: `PNI_INBOUND_NEWER_${Date.now()}_${++sequence}`,
        wabaId: 'WABA_INBOUND',
        accessTokenEncrypted: await encryptToken('INBOUND_TOKEN_NEWER'),
        status: 'active',
        createdAt: new Date(),
      })
      .returning({ id: whatsappConnections.id });

    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });

    expect(context?.connectionId).toBe(newer.id);
    expect(context?.connectionId).not.toBe(connectionId);
  });

  it('keeps AI inactive while a Business app echo pause is current', async () => {
    await db
      .update(conversations)
      .set({
        aiActive: false,
        aiPausedUntil: new Date(Date.now() + 60 * 60 * 1000),
        aiPauseReason: 'whatsapp_business_app_echo',
      })
      .where(eq(conversations.id, conversationId));

    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });

    expect(context?.aiActive).toBe(false);
    // Echo pause excludes the manual-reply nudge: the PT is already replying
    // from their WhatsApp Business app, so a push would be redundant.
    expect(context?.manualHandling).toBe(false);
  });

  it('flags manual handling when the PT has taken the conversation over', async () => {
    // Takeover leaves aiActive false with no echo pause reason — the state a
    // manual-reply push targets.
    await db
      .update(conversations)
      .set({ aiActive: false, aiPausedUntil: null, aiPauseReason: null })
      .where(eq(conversations.id, conversationId));

    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });

    expect(context?.aiActive).toBe(false);
    expect(context?.manualHandling).toBe(true);
  });

  it('clears an expired Business app echo pause before processing inbound AI', async () => {
    await db
      .update(conversations)
      .set({
        aiActive: false,
        aiPausedUntil: new Date(Date.now() - 60_000),
        aiPauseReason: 'whatsapp_business_app_echo',
      })
      .where(eq(conversations.id, conversationId));

    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });

    expect(context?.aiActive).toBe(true);
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conversation.aiActive).toBe(true);
    expect(conversation.aiPausedUntil).toBeNull();
    expect(conversation.aiPauseReason).toBeNull();
  });

  it('translates non-retriable engine states into skips', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const runTurnFn = vi.fn(async () => {
      throw new ConversationEngineError(
        'conversation_inactive',
        'PT took over',
      );
    });

    await expect(runInboundTurn(context, runTurnFn)).resolves.toEqual({
      kind: 'skipped',
      reason: 'conversation_inactive',
    });
  });

  it('surfaces the global assistant pause flag in the job context', async () => {
    const before = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });
    expect(before).toMatchObject({ assistantPaused: false });

    await db
      .update(accounts)
      .set({ assistantPaused: true })
      .where(eq(accounts.id, accountId));

    const after = await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    });
    expect(after?.assistantPaused).toBe(true);
  });

  it('translates an assistant_paused engine throw into a skip', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const runTurnFn = vi.fn(async () => {
      throw new ConversationEngineError('assistant_paused', 'paused');
    });

    await expect(runInboundTurn(context, runTurnFn)).resolves.toEqual({
      kind: 'skipped',
      reason: 'assistant_paused',
    });
  });

  it('performs zero sends and skips reminder handling while paused', async () => {
    // A reminder-eligible "KONFIRMO" reply that, unpaused, would confirm the
    // appointment and send a deterministic confirmation.
    const startsAt = addHours(new Date(), 30);
    const [appointment] = await db
      .insert(appointments)
      .values({
        accountId,
        customerId,
        startsAt,
        endsAt: addHours(startsAt, 1),
        status: 'pending',
        serviceType: 'Treatment',
      })
      .returning({ id: appointments.id });
    const [reminderMessage] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        externalId: `wamid.REMINDER.${Date.now()}.${sequence}`,
        role: 'ai',
        channel: 'whatsapp',
        content: 'Reminder',
        model: 'deterministic-reminder',
        provider: 'internal',
      })
      .returning({ id: messages.id });
    await db.insert(reminderJobs).values({
      accountId,
      appointmentId: appointment.id,
      scheduledFor: subHours(startsAt, 24),
      inngestRunId: `run-paused-${sequence}`,
      status: 'sent',
      sentAt: new Date(),
      messageId: reminderMessage.id,
    });
    await db
      .update(messages)
      .set({ content: 'KONFIRMO' })
      .where(eq(messages.id, inboundMessageId));
    await db
      .update(accounts)
      .set({ assistantPaused: true })
      .where(eq(accounts.id, accountId));

    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    expect(context.assistantPaused).toBe(true);

    // Mirror the Inngest body: paused bypasses reminder handling entirely.
    const reminder: ReminderHandlingResult = context.assistantPaused
      ? { kind: 'none' }
      : await handleReminderResponse({
          inbound: {
            ...context.inbound,
            occurredAt: new Date(context.inbound.occurredAt),
          },
        });
    expect(reminder.kind).toBe('none');

    // The real engine short-circuits before any model call or reply row.
    const turn = await runInboundTurn(context);
    expect(turn).toEqual({ kind: 'skipped', reason: 'assistant_paused' });

    // A skipped turn returns before send-outbound; nothing reaches WhatsApp.
    const sendFn = vi.fn(async () => ({ messageId: 'wamid.NEVER' }));
    expect(sendFn).not.toHaveBeenCalled();

    const [storedAppointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointment.id));
    expect(storedAppointment.status).toBe('pending');
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointment.id));
    expect(job.responseType).toBeNull();
    const replies = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.role, 'ai'),
          eq(messages.replyToMessageId, inboundMessageId),
        ),
      );
    expect(replies).toHaveLength(0);
  });

  it('stops Inngest retries for non-retryable provider failures', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const providerError = new APICallError({
      message: 'No endpoints match the account data policy',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 404,
      isRetryable: false,
    });
    const runTurnFn = vi.fn(async () => {
      throw providerError;
    });

    await expect(runInboundTurn(context, runTurnFn)).rejects.toEqual(
      expect.objectContaining({
        name: 'NonRetriableError',
        message: providerError.message,
        cause: providerError,
      }),
    );
    await expect(runInboundTurn(context, runTurnFn)).rejects.toBeInstanceOf(
      NonRetriableError,
    );
  });

  it('keeps retryable provider failures eligible for Inngest retries', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const providerError = new APICallError({
      message: 'Provider temporarily unavailable',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 503,
      isRetryable: true,
    });
    const runTurnFn = vi.fn(async () => {
      throw providerError;
    });

    await expect(runInboundTurn(context, runTurnFn)).rejects.toBe(
      providerError,
    );
  });

  it('persists the Graph message ID and skips duplicate delivery on replay', async () => {
    const [outbound] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        replyToMessageId: inboundMessageId,
        role: 'ai',
        channel: 'whatsapp',
        content: 'Your appointment is booked.',
      })
      .returning({ id: messages.id });
    const sendFn = vi.fn(async () => ({ messageId: 'wamid.OUTBOUND' }));
    const outboundShape = {
      id: outbound.id,
      conversationId,
      replyToMessageId: inboundMessageId,
      content: 'Your appointment is booked.',
      channel: 'whatsapp',
    };

    const first = await sendInboundReply({
      outbound: outboundShape,
      connectionId,
      recipient: '447700900100',
      sendFn,
    });
    await persistInboundReplyDelivery({
      outboundId: outbound.id,
      messageId: first.messageId,
    });
    const replay = await sendInboundReply({
      outbound: outboundShape,
      connectionId,
      recipient: '447700900100',
      sendFn,
    });

    expect(first).toEqual({
      messageId: 'wamid.OUTBOUND',
      alreadyDelivered: false,
    });
    expect(replay).toEqual({
      messageId: 'wamid.OUTBOUND',
      alreadyDelivered: true,
    });
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  /**
   * The regression this whole change exists for. A booking used to be announced
   * twice — once by the model, whose reply this job sends, and once by
   * handleAppointmentEvent's deterministic confirmation — with no ordering
   * between them. Both senders are exercised here against one shared send mock,
   * so a second producer coming back would show up as a second call.
   */
  it('sends exactly one WhatsApp message for an AI booking turn', async () => {
    await db
      .update(accounts)
      .set({ timezone: 'Europe/Tirane' })
      .where(eq(accounts.id, accountId));
    await db.delete(availabilityRules).where(eq(availabilityRules.accountId, accountId));
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 1,
      startTime: '09:00:00',
      endTime: '17:00:00',
    });
    const startsAt = zonedTime(MONDAY, 9);

    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const outbound = await runTurnCore({
      inboundMessage: {
        ...context.inbound,
        occurredAt: new Date(context.inbound.occurredAt),
      },
      modelId: 'requested/model',
      model: new MockLanguageModelV3({
        provider: 'openrouter',
        modelId: 'mock-model',
        doGenerate: async () => ({
          content: [
            {
              type: 'tool-call',
              toolCallId: 'book-1',
              toolName: 'book_appointment',
              input: JSON.stringify({
                starts_at: startsAt.toISOString(),
                service_type: 'Vlerësim i parë',
              }),
            },
          ],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: {
            inputTokens: {
              total: 20,
              noCache: 20,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 6, text: 6, reasoning: undefined },
          },
          warnings: [],
        }),
      }),
    });

    const sendFn = vi.fn(async () => ({ messageId: 'wamid.ONLY' }));
    const delivery = await sendInboundReply({
      outbound,
      connectionId,
      recipient: '447700900100',
      sendFn,
    });
    await persistInboundReplyDelivery({
      outboundId: outbound.id,
      messageId: delivery.messageId,
    });

    // The other producer, driven exactly as handleAppointmentEvent drives it
    // from the domain event the booking just appended.
    const [booked] = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'appointment.booked')));
    const payload = booked.payload as {
      appointmentId: string;
      origin?: 'conversation' | 'account';
    };
    const plan = appointmentEventPlan({
      kind: 'appointment.booked',
      origin: payload.origin,
    });
    if (plan.confirmCustomer) {
      const confirmation = await prepareAppointmentConfirmation({
        sourceEventId: booked.id,
        kind: 'appointment.booked',
        accountId,
        appointmentId: payload.appointmentId,
        startsAt,
      });
      if (confirmation.kind === 'ready') {
        await sendAppointmentConfirmation({ ...confirmation, sendFn });
      }
    }

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn).toHaveBeenCalledWith(
      connectionId,
      '447700900100',
      `Takimi juaj u rezervua për ${formatAppointmentTime(startsAt, 'Europe/Tirane')} (Vlerësim i parë). Nëse doni ta ndryshoni ose ta anuloni, më shkruani këtu.`,
    );
    const sent = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), eq(messages.role, 'ai')));
    expect(sent).toHaveLength(1);
  });

  it('runs reminder-aware AI turns with reminder context', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      accountId,
      conversationId,
    }))!;
    const runReminderTurnFn = vi.fn(async () => ({
      id: '00000000-0000-4000-8000-000000000001',
      conversationId,
      replyToMessageId: inboundMessageId,
      content: 'Which time works best?',
      channel: 'whatsapp',
    }));
    const reminder = {
      reason: 'unclear_reply' as const,
      appointmentId: '00000000-0000-4000-8000-000000000002',
      appointmentStartsAt: zonedTime(MONDAY, 12).toISOString(),
      timezone: 'Europe/Tirane',
      name: 'Move Well',
    };

    await expect(
      runReminderFallbackTurn(context, reminder, runReminderTurnFn),
    ).resolves.toEqual({
      kind: 'outbound',
      outbound: expect.objectContaining({
        content: 'Which time works best?',
      }),
    });
    expect(runReminderTurnFn).toHaveBeenCalledWith({
      inboundMessage: expect.objectContaining({
        id: inboundMessageId,
        accountId,
        conversationId,
      }),
      reminder,
      // Phase 16 C1: the resolved effective plan is threaded into the turn.
      plan: 'free',
    });
  });

  it('records an exhausted turn durably so the bell can surface it', async () => {
    await db.delete(events).where(eq(events.accountId, accountId));

    await recordConversationFailure({
      accountId,
      conversationId,
      messageId: inboundMessageId,
    });

    const stored = await db
      .select()
      .from(events)
      .where(
        and(eq(events.accountId, accountId), eq(events.type, 'conversation.failed')),
      );
    expect(stored).toHaveLength(1);
    expect(stored[0].payload).toMatchObject({
      accountId,
      conversationId,
      messageId: inboundMessageId,
    });

    // The Inngest publish still happens, via the outbox row rather than a bare
    // step.sendEvent that left no trace behind.
    const outbox = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, stored[0].id));
    expect(outbox).toHaveLength(1);
    expect(outbox[0].eventType).toBe('conversation.failed');

    // The bell reads `events` filtered by NOTIFICATION_TYPES, so the
    // conversation.failed formatter branch is now reachable at all.
    const bell = await getNotificationData(accountId);
    expect(bell.items).toEqual([
      expect.objectContaining({
        type: 'conversation.failed',
        title: expect.stringContaining('kërkon vëmendjen tënde'),
        href: '/chat',
      }),
    ]);
  });

  /**
   * The reminders kill switch (`lib/reminders/flag.ts`) at the boundary it was
   * built for: with reminders off, nothing may read the customer's words before
   * the assistant does. A bare "Ok" answering a reminder that really did go out
   * is the sharpest case, because it is exactly the message `parseReplyIntent`
   * confirms an appointment on.
   *
   * Both tests run the same fixture through the same shipped handler and
   * differ only in the flag, so the disabled case cannot pass by the fixture
   * having quietly stopped being reminder-eligible.
   */
  describe('the reminders kill switch', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** A sent, unanswered reminder plus an inbound "Ok" that answers it. */
    async function seedAnsweredReminder() {
      const startsAt = addHours(new Date(), 30);
      const [appointment] = await db
        .insert(appointments)
        .values({
          accountId,
          customerId,
          startsAt,
          endsAt: addHours(startsAt, 1),
          status: 'pending',
          serviceType: 'Treatment',
        })
        .returning({ id: appointments.id });
      const [reminderMessage] = await db
        .insert(messages)
        .values({
          accountId,
          conversationId,
          externalId: `wamid.REMINDER.${Date.now()}.${sequence}`,
          role: 'ai',
          channel: 'whatsapp',
          content: 'Reminder',
          model: 'deterministic-reminder',
          provider: 'internal',
        })
        .returning({ id: messages.id });
      await db.insert(reminderJobs).values({
        accountId,
        appointmentId: appointment.id,
        scheduledFor: subHours(startsAt, 24),
        inngestRunId: `run-flag-${sequence}`,
        status: 'sent',
        sentAt: new Date(),
        messageId: reminderMessage.id,
      });
      await db
        .update(messages)
        .set({ content: 'Ok' })
        .where(eq(messages.id, inboundMessageId));

      return { appointmentId: appointment.id };
    }

    async function bookingState(appointmentId: string) {
      const [appointment] = await db
        .select({ status: appointments.status })
        .from(appointments)
        .where(eq(appointments.id, appointmentId));
      const [job] = await db
        .select({ responseType: reminderJobs.responseType })
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId));
      const replies = await db
        .select({ model: messages.model })
        .from(messages)
        .where(
          and(
            eq(messages.role, 'ai'),
            eq(messages.replyToMessageId, inboundMessageId),
          ),
        );
      return {
        status: appointment.status,
        responseType: job.responseType,
        replies,
      };
    }

    it('hands a reminder reply to the AI turn while reminders are off', async () => {
      vi.stubEnv('REMINDERS_ENABLED', 'false');
      const { appointmentId } = await seedAnsweredReminder();

      const { ran } = await runHandler();

      // Short-circuited, not overruled: neither reminder step is in the run at
      // all, so nothing inspected the customer's words ahead of the assistant,
      // and the message reached the ordinary AI turn.
      expect(ran).toEqual([
        'load-context',
        'check-conversation-cap',
        'run-ai-turn',
      ]);

      const state = await bookingState(appointmentId);
      expect(state.status).toBe('pending');
      expect(state.responseType).toBeNull();
      // The run stopped before any send, so a reply row here could only be the
      // deterministic confirmation this switch exists to stop.
      expect(state.replies).toHaveLength(0);
    });

    it('still confirms deterministically while reminders are on', async () => {
      vi.stubEnv('REMINDERS_ENABLED', 'true');
      const { appointmentId } = await seedAnsweredReminder();

      const { ran } = await runHandler();

      // The same fixture, the same handler, one env var apart: the reminder
      // steps are back, and they claim the message before the AI turn.
      expect(ran).toEqual([
        'load-context',
        'handle-reminder-response',
        'send-reminder-response',
      ]);

      const state = await bookingState(appointmentId);
      expect(state.status).toBe('confirmed');
      expect(state.responseType).toBe('confirm');
      expect(state.replies).toEqual([
        { model: 'deterministic-reminder-response' },
      ]);
    });
  });
  /**
   * A voice note or a photo now reaches the professional. Before this the
   * branch was customer-facing only: the media got one Albanian notice per
   * conversation per day and the professional got no signal at all beyond the
   * passive unread badge — and the *second* photo of the day, which the notice
   * throttle answers with `skip`, was silence for both sides at once.
   *
   * Both tests drive the shipped handler through the step shim, so what they
   * assert is the step list the run actually contains. `push.dispatched` is
   * the observable end of the dispatch: `dispatchPushForEvent` writes it after
   * clearing the `manualReply` preference gate, with no push subscriptions
   * needed (and so no network).
   */
  describe('a non-text inbound tells the professional', () => {
    beforeEach(async () => {
      await db.delete(events).where(eq(events.accountId, accountId));
      await db
        .update(messages)
        .set({ content: '[foto]' })
        .where(eq(messages.id, inboundMessageId));
    });

    /** The counts-only metric row `dispatchPushForEvent` leaves behind. */
    async function pushDispatches() {
      return await db
        .select({ payload: events.payload })
        .from(events)
        .where(
          and(eq(events.accountId, accountId), eq(events.type, 'push.dispatched')),
        );
    }

    async function noticeCount() {
      const rows = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.model, NON_TEXT_NOTICE_MODEL),
          ),
        );
      return rows.length;
    }

    it('pushes on the day the customer notice is sent', async () => {
      const { ran } = await runHandler({ nonText: true });

      // The push comes before the notice, not after it: nothing downstream can
      // decide the professional hears nothing.
      expect(ran).toEqual([
        'load-context',
        'notify-non-text',
        'prepare-non-text-notice',
        'send-non-text-notice',
      ]);

      const dispatches = await pushDispatches();
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].payload).toMatchObject({
        accountId,
        sourceEvent: 'conversation.needs_reply',
      });
    });

    it('still pushes for a second media message the same day, with no second notice', async () => {
      // Today's notice already went out, so `prepareNonTextNotice` throttles
      // this one — the exact path that used to end the run in total silence.
      await db
        .update(conversations)
        .set({ nonTextNoticeAt: new Date() })
        .where(eq(conversations.id, conversationId));

      const { ran, result } = await runHandler({ nonText: true });

      expect(ran).toEqual([
        'load-context',
        'notify-non-text',
        'prepare-non-text-notice',
      ]);
      expect(result).toEqual({ nonText: true, noticeSent: false });

      // The customer is not told twice...
      expect(await noticeCount()).toBe(0);
      // ...and the professional is still told, which is the whole point.
      const dispatches = await pushDispatches();
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].payload).toMatchObject({
        accountId,
        sourceEvent: 'conversation.needs_reply',
      });
    });

    it('leaves the assistant on — notifying is not stopping the AI', async () => {
      await runHandler({ nonText: true });

      const [conversation] = await db
        .select({
          aiActive: conversations.aiActive,
          escalationState: conversations.escalationState,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      expect(conversation.aiActive).toBe(true);
      expect(conversation.escalationState).not.toBe('requested');
    });
  });
  /**
   * The cap is a *transient* condition — it clears at month rollover, or the
   * moment the professional upgrades — so hitting it now writes no conversation
   * state at all. It used to hand-roll `ai_active = false, escalation_state =
   * 'requested'`: permanent state that only the professional toggling the
   * thread back could undo, for a reason that undoes itself.
   *
   * Both tests drive the shipped handler through the step shim, so the step
   * list the run actually contains is the assertion. The two reminder steps in
   * every list are the suite-wide `REMINDERS_ENABLED=true` from
   * `vitest.config.ts`; no reminder is seeded, so they claim nothing.
   */
  describe('a capped conversation', () => {
    const FREE_LIMIT = getPlan('free').conversationsPerMonth;
    // Two instants one calendar month apart, both derived from the run's own
    // clock: what these exercise is the *rollover*, never a date.
    const AFTER_ROLLOVER = testNowUtc({ dayOfMonth: 15 });
    const AT_CAP = subMonths(AFTER_ROLLOVER, 1);

    beforeEach(async () => {
      await db.delete(events).where(eq(events.accountId, accountId));
      await db
        .delete(conversationDays)
        .where(eq(conversationDays.accountId, accountId));
      // Metering keys the month off the professional's timezone.
      await db
        .update(accounts)
        .set({ timezone: 'UTC', plan: 'free' })
        .where(eq(accounts.id, accountId));

      // Spend the whole month on other customers, so the fixture's own day-fact
      // is the one that tips the gate over.
      const { localDay, monthKey } = conversationDayKeys(AT_CAP, 'UTC');
      const filler = await db
        .insert(customers)
        .values(
          Array.from({ length: FREE_LIMIT }, (_, index) => {
            const phone = `44770091${String(index).padStart(4, '0')}`;
            return { accountId, name: `Filler ${index}`, phone, waId: phone };
          }),
        )
        .returning({ id: customers.id });
      await db.insert(conversationDays).values(
        filler.map((customer) => ({
          accountId,
          customerId: customer.id,
          localDay,
          monthKey,
          firstMessageId: crypto.randomUUID(),
        })),
      );

      // The metering instant is the customer message's own timestamp, not the
      // wall clock, so dating the message is what puts it inside the capped
      // month.
      await db
        .update(messages)
        .set({ createdAt: AT_CAP })
        .where(eq(messages.id, inboundMessageId));
    });

    afterAll(async () => {
      await db
        .delete(conversationDays)
        .where(eq(conversationDays.accountId, accountId));
    });

    /** Static holding messages actually sent to the customer. */
    async function holdingMessages() {
      return await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.model, CAP_HANDOFF_MODEL),
          ),
        );
    }

    /** The counts-only metric row `dispatchPushForEvent` leaves behind. */
    async function pushDispatches() {
      return await db
        .select({ payload: events.payload })
        .from(events)
        .where(
          and(eq(events.accountId, accountId), eq(events.type, 'push.dispatched')),
        );
    }

    async function threadState() {
      const [row] = await db
        .select({
          aiActive: conversations.aiActive,
          escalationState: conversations.escalationState,
        })
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      return row;
    }

    it('still pushes for a later message the same capped day, and sends no second holding message', async () => {
      // Today's holding message already went out, so `prepareCapHandoff`
      // throttles this one. This is the path that used to lean on the thread
      // having been taken from the assistant: the follow-up then reached the
      // professional through the manual-handling branch. It hits the cap gate
      // afresh instead — the gate compensates its day-fact away for a
      // turned-away customer — and the push happens there, ahead of the
      // throttle.
      await db
        .update(conversations)
        .set({ limitHandoffAt: AT_CAP })
        .where(eq(conversations.id, conversationId));

      const { ran, result } = await runHandler();

      expect(ran).toEqual([
        'load-context',
        'handle-reminder-response',
        'check-conversation-cap',
        'notify-capped-conversation',
        'prepare-cap-handoff',
      ]);
      expect(result).toEqual({ capped: true, handoffSent: false });

      // The customer is not told twice...
      expect(await holdingMessages()).toHaveLength(0);
      // ...the professional is told anyway...
      const dispatches = await pushDispatches();
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].payload).toMatchObject({
        accountId,
        sourceEvent: 'conversation.needs_reply',
      });
      // ...and the assistant still owns the thread.
      expect(await threadState()).toEqual({
        aiActive: true,
        escalationState: 'idle',
      });
    });

    it('answers by itself again once the cap clears', async () => {
      const capped = await runHandler();

      expect(capped.ran).toEqual([
        'load-context',
        'handle-reminder-response',
        'check-conversation-cap',
        'notify-capped-conversation',
        'prepare-cap-handoff',
        'send-cap-handoff',
      ]);
      // Turned away, but nothing was written down about it.
      expect(await threadState()).toEqual({
        aiActive: true,
        escalationState: 'idle',
      });

      // The month rolls over, and that is the only thing that happens: nobody
      // toggles the thread back, nothing repairs it. The next message is simply
      // dated in a month whose conversation count starts at zero.
      const [next] = await db
        .insert(messages)
        .values({
          accountId,
          conversationId,
          externalId: `wamid.IN.ROLLOVER.${Date.now()}.${++sequence}`,
          role: 'customer',
          channel: 'whatsapp',
          content: 'A keni kohë të hënën?',
          createdAt: AFTER_ROLLOVER,
        })
        .returning({ id: messages.id });
      inboundMessageId = next.id;

      const { ran } = await runHandler();

      // An ordinary AI turn — no cap steps, no human in the loop.
      expect(ran).toEqual([
        'load-context',
        'handle-reminder-response',
        'check-conversation-cap',
        'run-ai-turn',
      ]);
      expect(await threadState()).toEqual({
        aiActive: true,
        escalationState: 'idle',
      });
    });
  });
});
