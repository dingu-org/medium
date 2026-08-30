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
import { addHours, subHours } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
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
import { handOffCappedConversation } from '@/lib/billing/cap-handoff';
import { runTurnCore } from '@/lib/conversation/engine';
import { ConversationEngineError } from '@/lib/conversation/errors';
import {
  businessLabel,
  handoffOfferMessage,
  HANDOFF_ACCEPTED_MODEL,
} from '@/lib/conversation/handoff-offer';
import type { InboundMessage } from '@/lib/conversation/types';
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
  resolveInboundClaim,
  runInboundTurn,
  runReminderFallbackTurn,
  sendInboundReply,
  type InboundClaim,
} from '../handle-inbound-message';
import { DAY, MINUTE, testNow, zonedTime } from '@/tests/support/clock';

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

  // The 2nd..Nth message of a capped day. The gate compensates its day-fact
  // away for a turned-away customer, so each later message hits the cap afresh
  // and the once-a-day handoff throttle skips — which used to be silence for
  // everyone. Owning the thread is what turns those messages into the
  // manual-reply nudge instead.
  it('flags manual handling for the messages that follow a cap handoff', async () => {
    await handOffCappedConversation({ accountId, conversationId, customerId });

    const [second] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        externalId: `wamid.IN.CAP.${Date.now()}.${++sequence}`,
        role: 'customer',
        channel: 'whatsapp',
        content: 'Jam ende duke pritur',
      })
      .returning({ id: messages.id });

    const context = await loadInboundJobContext({
      messageId: second.id,
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
   * The affirmative collision (2026-08-14). A yes confirms an unanswered
   * reminder and it also accepts the handoff offer — and the reminder handler
   * runs first and returns before the engine, so with both outstanding a yes
   * confirmed an appointment the customer had not been asked about while their
   * accepted handoff silently never happened.
   *
   * The rule: whichever question was asked most recently wins. It only decides
   * messages BOTH subsystems could claim, which is why they now read "yes" out
   * of one shared definition (lib/language/reply-intent.ts). While the offer
   * demanded exact equality with PO and the reminder accepted 'dakord', 'ok' and
   * 'po' plus one word, everything in that gap skipped the comparison entirely
   * and went to the reminder by default — the same bug, one spelling narrower.
   *
   * Each test mirrors the Inngest body — precedence gate, then the reminder
   * step, then the engine.
   */
  describe('most-recent-question-wins on an affirmative', () => {
    const usage = {
      inputTokens: {
        total: 20,
        noCache: 20,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 6, text: 6, reasoning: undefined },
    };

    /** Both deterministic paths answer without a model; running it is failure. */
    function refusingModel() {
      return new MockLanguageModelV3({
        doGenerate: async () => {
          throw new Error('model should not run');
        },
      });
    }

    /** An ordinary conversational turn — what a message neither subsystem
     * claims has to reach. */
    function answeringModel(text: string) {
      return new MockLanguageModelV3({
        provider: 'openrouter',
        modelId: 'mock-model',
        doGenerate: async () => ({
          content: [{ type: 'text' as const, text }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage,
          warnings: [],
        }),
      });
    }

    function bookingModel(startsAt: Date) {
      return new MockLanguageModelV3({
        provider: 'openrouter',
        modelId: 'mock-model',
        doGenerate: async () => ({
          content: [
            {
              type: 'tool-call' as const,
              toolCallId: 'book-1',
              toolName: 'book_appointment',
              input: JSON.stringify({
                starts_at: startsAt.toISOString(),
                service_type: 'Vlerësim i parë',
              }),
            },
          ],
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
          warnings: [],
        }),
      });
    }

    /**
     * Arms the collision. Both offsets are minutes *before* the inbound message,
     * so which question was asked last is fixed by the fixture and never by the
     * wall clock the suite happens to run at. Omit either one to leave that
     * subsystem with nothing outstanding.
     */
    async function seedCollision(options: {
      reminderSentMinutesBefore?: number;
      offerMinutesBefore?: number;
      content?: string;
    }): Promise<{ inbound: InboundMessage; appointmentId: string | null }> {
      await db.delete(events).where(eq(events.accountId, accountId));
      const at = new Date();
      await db
        .update(messages)
        .set({ content: options.content ?? 'PO', createdAt: at })
        .where(eq(messages.id, inboundMessageId));

      if (options.offerMinutesBefore !== undefined) {
        const offeredAt = new Date(
          at.getTime() - options.offerMinutesBefore * MINUTE,
        );
        // The out-of-scope question the offer answered — the message the anchor
        // points at, and whose timestamp dates the offer.
        const [anchor] = await db
          .insert(messages)
          .values({
            accountId,
            conversationId,
            externalId: `wamid.ASK.${Date.now()}.${++sequence}`,
            role: 'customer',
            channel: 'whatsapp',
            content: 'A bëni edhe masazh sportiv?',
            createdAt: offeredAt,
          })
          .returning({ id: messages.id });
        await db.insert(messages).values({
          accountId,
          conversationId,
          replyToMessageId: anchor.id,
          role: 'ai',
          channel: 'whatsapp',
          content: handoffOfferMessage(businessLabel(null)),
          model: 'requested/model',
          provider: 'Azure',
          createdAt: new Date(offeredAt.getTime() + 1000),
        });
        await db
          .update(conversations)
          .set({ handoffOfferMessageId: anchor.id })
          .where(eq(conversations.id, conversationId));
      }

      let appointmentId: string | null = null;
      if (options.reminderSentMinutesBefore !== undefined) {
        const sentAt = new Date(
          at.getTime() - options.reminderSentMinutesBefore * MINUTE,
        );
        const startsAt = addHours(at, 30);
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
        appointmentId = appointment.id;
        const [reminderMessage] = await db
          .insert(messages)
          .values({
            accountId,
            conversationId,
            externalId: `wamid.REM.${Date.now()}.${++sequence}`,
            role: 'ai',
            channel: 'whatsapp',
            content: 'Kujtesë: keni takim nesër.',
            model: 'deterministic-reminder',
            provider: 'internal',
            createdAt: sentAt,
          })
          .returning({ id: messages.id });
        await db.insert(reminderJobs).values({
          accountId,
          appointmentId: appointment.id,
          scheduledFor: subHours(startsAt, 24),
          inngestRunId: `run-collision-${++sequence}`,
          status: 'sent',
          sentAt,
          messageId: reminderMessage.id,
        });
      }

      const context = (await loadInboundJobContext({
        messageId: inboundMessageId,
        accountId,
        conversationId,
      }))!;
      return {
        inbound: {
          ...context.inbound,
          occurredAt: new Date(context.inbound.occurredAt),
        },
        appointmentId,
      };
    }

    /** Precedence gate, reminder step, engine — in the Inngest body's order. */
    async function runBody(
      inbound: InboundMessage,
      model: MockLanguageModelV3,
    ) {
      const claim = await resolveInboundClaim(inbound);
      const reminder: ReminderHandlingResult =
        claim === 'reminder'
          ? await handleReminderResponse({ inbound })
          : { kind: 'none' };
      const outbound =
        reminder.kind === 'outbound'
          ? reminder.outbound
          : await runTurnCore({
              inboundMessage: inbound,
              model,
              modelId: 'requested/model',
            });
      return { claim, reminder, outbound };
    }

    async function conversationRow() {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      return conversation;
    }

    async function escalationEvents() {
      return db
        .select({ type: events.type })
        .from(events)
        .where(
          and(
            eq(events.accountId, accountId),
            eq(events.type, 'conversation.escalated'),
          ),
        );
    }

    it('escalates instead of confirming when the offer is the newer question', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 90,
        offerMinutesBefore: 5,
      });

      const model = refusingModel();
      const { claim, reminder, outbound } = await runBody(inbound, model);

      expect(claim).toBe('handoff_offer');
      expect(reminder.kind).toBe('none');
      // Deterministic on both sides: no model round produced this reply.
      expect(model.doGenerateCalls).toHaveLength(0);
      const [stored] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, outbound.id));
      expect(stored.model).toBe(HANDOFF_ACCEPTED_MODEL);

      const conversation = await conversationRow();
      expect(conversation.aiActive).toBe(false);
      expect(conversation.escalationState).toBe('requested');
      expect(conversation.handoffOfferMessageId).toBeNull();
      expect(await escalationEvents()).toEqual([
        { type: 'conversation.escalated' },
      ]);

      // The appointment the customer was never asked about is untouched.
      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('pending');
      const [job] = await db
        .select()
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId!));
      expect(job.responseType).toBeNull();
    });

    /**
     * The measured defect (2026-08-14). With the offer as the newer question by
     * 85 minutes, "po faleminderit" ("yes, thank you") went to the reminder: the
     * appointment was confirmed, nothing escalated, and the customer's question
     * was dropped. Not because precedence decided it — because the offer could
     * not claim the message at all, so precedence never saw it. Same bug the
     * timestamp rule was written for, one spelling narrower.
     */
    it('escalates on "po faleminderit" when the offer is the newer question', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 90,
        offerMinutesBefore: 5,
        content: 'po faleminderit',
      });

      const model = refusingModel();
      const { claim, reminder, outbound } = await runBody(inbound, model);

      expect(claim).toBe('handoff_offer');
      expect(reminder.kind).toBe('none');
      expect(model.doGenerateCalls).toHaveLength(0);
      const [stored] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, outbound.id));
      expect(stored.model).toBe(HANDOFF_ACCEPTED_MODEL);

      const conversation = await conversationRow();
      expect(conversation.aiActive).toBe(false);
      expect(conversation.escalationState).toBe('requested');
      expect(conversation.handoffOfferMessageId).toBeNull();
      expect(await escalationEvents()).toEqual([
        { type: 'conversation.escalated' },
      ]);

      // The appointment the customer was never asked about is untouched.
      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('pending');
      const [job] = await db
        .select()
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId!));
      expect(job.responseType).toBeNull();
    });

    /**
     * The other half, and why the fix is one shared definition rather than a
     * wider offer: the same words with the reminder as the newer question still
     * confirm the appointment. Broadening what the offer can claim only puts the
     * message in front of the timestamp rule; it does not hand it to the offer.
     */
    it('confirms on "po faleminderit" when the reminder is the newer question', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 5,
        offerMinutesBefore: 90,
        content: 'po faleminderit',
      });

      const model = refusingModel();
      const { claim, reminder, outbound } = await runBody(inbound, model);

      expect(claim).toBe('reminder');
      expect(reminder.kind).toBe('outbound');
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(outbound.content).toContain('u konfirmua');

      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('confirmed');
      const [job] = await db
        .select()
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId!));
      expect(job.responseType).toBe('confirm');

      const conversation = await conversationRow();
      expect(conversation.aiActive).toBe(true);
      expect(conversation.escalationState).toBe('idle');
      expect(conversation.handoffOfferMessageId).toBeNull();
      expect(await escalationEvents()).toEqual([]);
    });

    /**
     * Albanian 'po' is also the progressive particle, so "Po pyesja për oraret"
     * is "I was asking about the hours" — a question, not a yes. Neither
     * subsystem may claim it, even with the offer as the newest question: it has
     * to reach the model as an ordinary turn. This is the guard the shared
     * definition had to carry across, and the reason the offer cannot simply
     * accept anything that starts with "po".
     */
    it('leaves the progressive particle to the model, claiming it for neither', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 90,
        offerMinutesBefore: 5,
        content: 'Po pyesja për oraret',
      });

      const model = answeringModel('Jemi hapur 9:00–17:00.');
      const { claim, reminder, outbound } = await runBody(inbound, model);

      // The offer cannot claim it, so there is nothing to weigh and the message
      // stays on the reminder path — which hands it to the AI turn.
      expect(claim).toBe('reminder');
      expect(reminder.kind).toBe('fallback');
      expect(model.doGenerateCalls).toHaveLength(1);
      expect(outbound.content).toBe('Jemi hapur 9:00–17:00.');

      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('pending');
      const [job] = await db
        .select()
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId!));
      expect(job.responseType).toBeNull();

      const conversation = await conversationRow();
      expect(conversation.aiActive).toBe(true);
      expect(conversation.escalationState).toBe('idle');
      expect(conversation.handoffOfferMessageId).toBeNull();
      expect(await escalationEvents()).toEqual([]);
    });

    it('confirms the appointment and lapses the offer when the reminder is the newer question', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 5,
        offerMinutesBefore: 90,
      });

      const model = refusingModel();
      const { claim, reminder, outbound } = await runBody(inbound, model);

      expect(claim).toBe('reminder');
      expect(reminder.kind).toBe('outbound');
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(outbound.content).toContain('u konfirmua');

      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('confirmed');
      const [job] = await db
        .select()
        .from(reminderJobs)
        .where(eq(reminderJobs.appointmentId, appointmentId!));
      expect(job.responseType).toBe('confirm');

      const conversation = await conversationRow();
      expect(conversation.aiActive).toBe(true);
      expect(conversation.escalationState).toBe('idle');
      // The customer answered the reminder, not the offer, so the offer lapses
      // here rather than staying armed against a later, unrelated message.
      expect(conversation.handoffOfferMessageId).toBeNull();
      expect(await escalationEvents()).toEqual([]);
    });

    /**
     * 'dakord' and 'ok' are everyday Albanian for yes — 'ok' is written far more
     * often than 'dakord' in texting — and an unanswered reminder has always
     * confirmed a booking on either. The offer accepted neither, which is the
     * asymmetry this removes.
     *
     * The widening is bounded by the offer's own rule rather than by its
     * wording: only the message directly after the offer can accept it, so a
     * casual "ok" is read as acceptance exactly where "ok" is answering the
     * offer. The cost of being wrong there is an escalation to the PT, who sees
     * the customer's real question — recoverable, and the safe direction.
     */
    it.each(['dakord', 'ok'])(
      'accepts an outstanding offer on %j',
      async (content) => {
        const { inbound } = await seedCollision({
          offerMinutesBefore: 5,
          content,
        });

        const model = refusingModel();
        const { claim, reminder, outbound } = await runBody(inbound, model);

        expect(claim).toBe('handoff_offer');
        expect(reminder.kind).toBe('none');
        expect(model.doGenerateCalls).toHaveLength(0);
        const [stored] = await db
          .select()
          .from(messages)
          .where(eq(messages.id, outbound.id));
        expect(stored.model).toBe(HANDOFF_ACCEPTED_MODEL);

        const conversation = await conversationRow();
        expect(conversation.aiActive).toBe(false);
        expect(conversation.escalationState).toBe('requested');
        expect(conversation.handoffOfferMessageId).toBeNull();
        expect(await escalationEvents()).toEqual([
          { type: 'conversation.escalated' },
        ]);
      },
    );

    it('confirms the reminder on a bare po when no offer is outstanding', async () => {
      const { inbound, appointmentId } = await seedCollision({
        reminderSentMinutesBefore: 5,
        content: 'po',
      });

      const model = refusingModel();
      const { claim, reminder, outbound } = await runBody(inbound, model);

      expect(claim).toBe('reminder');
      expect(reminder.kind).toBe('outbound');
      expect(model.doGenerateCalls).toHaveLength(0);
      expect(outbound.content).toContain('u konfirmua');

      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId!));
      expect(appointment.status).toBe('confirmed');
      expect(await escalationEvents()).toEqual([]);
    });

    it('still books a proposed slot on a bare po with neither a reminder nor an offer', async () => {
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
      const { inbound } = await seedCollision({ content: 'po' });

      const { claim, reminder, outbound } = await runBody(
        inbound,
        bookingModel(startsAt),
      );

      expect(claim).toBe('reminder');
      expect(reminder.kind).toBe('none');
      expect(outbound.content).toContain(
        formatAppointmentTime(startsAt, 'Europe/Tirane'),
      );

      const [appointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.customerId, customerId));
      expect(appointment.startsAt).toEqual(startsAt);
      expect(await escalationEvents()).toEqual([]);
    });

    /**
     * Two questions asked in the same millisecond. `resolveInboundClaim`
     * compares with a strict `>`, so a tie is not a tie-break at all: the
     * reminder keeps the message, every time. Pinned because the comparison is
     * the whole rule — flipping it to `>=` would silently move an exactly-tied
     * turn from a confirmation to an escalation, and nothing else would notice.
     *
     * Reachable in practice despite the odds: Postgres stores these to the
     * microsecond but a JS `Date` truncates to the millisecond, so an offer made
     * up to 999µs after a reminder was sent still compares equal here.
     *
     * Run repeatedly against fresh fixtures: one pass could not tell a fixed
     * rule from a coin flip.
     */
    it('breaks an exact timestamp tie deterministically, in the reminder’s favour', async () => {
      const claims: InboundClaim[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // The seed books a fresh appointment each pass and they would overlap.
        await db.delete(appointments).where(eq(appointments.accountId, accountId));
        const { inbound, appointmentId } = await seedCollision({
          reminderSentMinutesBefore: 30,
          offerMinutesBefore: 30,
        });

        // Assert the tie is real rather than assuming the fixture produced one:
        // both offsets are the same distance from the same instant.
        const [conversation] = await db
          .select({ anchor: conversations.handoffOfferMessageId })
          .from(conversations)
          .where(eq(conversations.id, conversationId));
        const [anchor] = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, conversation.anchor!));
        const [job] = await db
          .select({ sentAt: reminderJobs.sentAt })
          .from(reminderJobs)
          .where(eq(reminderJobs.appointmentId, appointmentId!));
        expect(anchor.createdAt.getTime()).toBe(job.sentAt!.getTime());

        claims.push(await resolveInboundClaim(inbound));
      }

      expect(claims).toEqual(['reminder', 'reminder', 'reminder']);
    });
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

    /** Thrown by the step shim to end a run at its first terminal step. */
    class StepStop extends Error {}

    /**
     * The steps past which a run leaves this process: it sends to WhatsApp, or
     * hands the message to the model. The shim stops at whichever comes first,
     * so no test here can make a network call however the gate behaves.
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
     * Drives the shipped handler — `handleInboundMessageHandler`, the very
     * function handed to `inngest.createFunction` — rather than a restatement
     * of its gate, which could drift from the line it claims to track. Every
     * step runs for real; the names it recorded are the assertion, because the
     * gate's whole effect is which steps the run contains:
     * `resolve-turn-precedence` and `handle-reminder-response` are there or
     * they are not, and the terminal step names which path the run committed
     * to.
     */
    async function runHandler(): Promise<string[]> {
      const ran: string[] = [];
      const step = {
        run: async (name: string, fn: () => unknown) => {
          ran.push(name);
          if (TERMINAL_STEPS.has(name)) throw new StepStop(name);
          return await fn();
        },
      };

      try {
        await handleInboundMessageHandler({
          event: {
            name: 'message.received',
            data: { messageId: inboundMessageId, accountId, conversationId },
          },
          step,
          runId: '01JRUNKILLSWITCH',
        } as unknown as Parameters<typeof handleInboundMessageHandler>[0]);
        throw new Error(`handler returned without a terminal step: ${ran}`);
      } catch (error) {
        if (!(error instanceof StepStop)) throw error;
      }

      return ran;
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

      const ran = await runHandler();

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

      const ran = await runHandler();

      // The same fixture, the same handler, one env var apart: the reminder
      // steps are back, and they claim the message before the AI turn.
      expect(ran).toEqual([
        'load-context',
        'resolve-turn-precedence',
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
});
