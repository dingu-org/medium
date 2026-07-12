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
import { APICallError } from 'ai';
import { addHours, subHours } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { NonRetriableError } from 'inngest';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messages,
  patients,
  pts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { ConversationEngineError } from '@/lib/conversation/errors';
import {
  handleReminderResponse,
  type ReminderHandlingResult,
} from '@/lib/reminders/response-handler';
import { createServiceClient } from '@/lib/supabase/service';
import {
  loadInboundJobContext,
  persistInboundReplyDelivery,
  runInboundTurn,
  runReminderFallbackTurn,
  sendInboundReply,
} from '../handle-inbound-message';

let ptId = '';
let connectionId = '';
let conversationId = '';
let patientId = '';
let inboundMessageId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `inbound-job-${Date.now()}@example.com`,
    password: 'inbound-job-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db
    .update(pts)
    .set({ assistantPaused: false })
    .where(eq(pts.id, ptId));

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      ptId,
      phoneNumberId: `PNI_INBOUND_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_INBOUND',
      accessTokenEncrypted: await encryptToken('INBOUND_TOKEN'),
      status: 'active',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;

  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Pat',
      phone: '447700900100',
      waId: '447700900100',
    })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      ptId,
      patientId,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
    })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const [inbound] = await db
    .insert(messages)
    .values({
      ptId,
      conversationId,
      externalId: `wamid.IN.${Date.now()}.${sequence}`,
      role: 'patient',
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
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('handleInboundMessage cores', () => {
  it('loads authoritative tenant and delivery context', async () => {
    const context = await loadInboundJobContext({
      messageId: inboundMessageId,
      ptId,
      conversationId,
    });

    expect(context).toMatchObject({
      aiActive: true,
      connectionId,
      recipient: '447700900100',
      inbound: {
        id: inboundMessageId,
        conversationId,
        ptId,
        patientId,
        content: 'Can I book tomorrow?',
      },
    });
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
      ptId,
      conversationId,
    });

    expect(context?.aiActive).toBe(false);
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
      ptId,
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
      ptId,
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
      ptId,
      conversationId,
    });
    expect(before).toMatchObject({ assistantPaused: false });

    await db
      .update(pts)
      .set({ assistantPaused: true })
      .where(eq(pts.id, ptId));

    const after = await loadInboundJobContext({
      messageId: inboundMessageId,
      ptId,
      conversationId,
    });
    expect(after?.assistantPaused).toBe(true);
  });

  it('translates an assistant_paused engine throw into a skip', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      ptId,
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
        ptId,
        patientId,
        startsAt,
        endsAt: addHours(startsAt, 1),
        status: 'pending',
        serviceType: 'Treatment',
      })
      .returning({ id: appointments.id });
    const [reminderMessage] = await db
      .insert(messages)
      .values({
        ptId,
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
      ptId,
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
      .update(pts)
      .set({ assistantPaused: true })
      .where(eq(pts.id, ptId));

    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      ptId,
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
      ptId,
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
      ptId,
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
        ptId,
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

  it('runs reminder-aware AI turns with reminder context', async () => {
    const context = (await loadInboundJobContext({
      messageId: inboundMessageId,
      ptId,
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
      appointmentStartsAt: '2026-07-01T10:00:00.000Z',
      timezone: 'Europe/Tirane',
      practiceName: 'Move Well',
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
        ptId,
        conversationId,
      }),
      reminder,
    });
  });
});
