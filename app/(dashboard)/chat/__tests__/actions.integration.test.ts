import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messageTemplates,
  messages,
  patients,
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getUnreadChatCount } from '@/lib/chat/queries';
import { getChatListSnapshot } from '@/lib/pwa/read-models';
import { REMINDER_TEMPLATE } from '@/lib/inngest/functions/bootstrap-wa-connection';
import {
  markConversationRead,
  sendUpcomingReminderTemplate,
} from '../actions';

const authState = vi.hoisted(() => ({ userId: '' as string | null }));
const { errorSpy, redirectMock, sendTemplateMock } = vi.hoisted(() => ({
  errorSpy: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    const err = new Error(`REDIRECT:${path}`);
    (err as Error & { __isRedirect?: true }).__isRedirect = true;
    throw err;
  }),
  sendTemplateMock: vi.fn(),
}));

vi.mock('@/lib/channels/whatsapp/client', () => ({
  sendTemplate: sendTemplateMock,
  sendFreeForm: vi.fn(),
  getTemplateStatus: vi.fn(),
  submitTemplate: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  // Mirrors the real unstable_rethrow contract: rethrow redirect/notFound
  // control-flow errors, no-op (return) for anything else.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && (error as { __isRedirect?: true }).__isRedirect) {
      throw error;
    }
  },
}));
vi.mock('@/lib/log', () => ({
  logger: {
    error: errorSpy,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  newTraceId: () => 'test-trace-id',
  serializeError: (err: unknown) => ({
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.userId ? { id: authState.userId } : null },
      }),
    },
  }),
}));

let ptId = '';
let patientId = '';
let conversationId = '';
let olderId = '';
let newerId = '';
const older = new Date('2026-06-30T18:00:00.000Z');
const newer = new Date('2026-06-30T20:11:27.000Z');

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `chat-read-${Date.now()}@example.com`,
    password: 'chat-read-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
  authState.userId = ptId;
});

beforeEach(async () => {
  // Cascades conversations + messages.
  await db.delete(patients).where(eq(patients.ptId, ptId));
  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: '447700900700',
      waId: '447700900700',
    })
    .returning({ id: patients.id });
  patientId = patient.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const inserted = await db
    .insert(messages)
    .values([
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'older',
        createdAt: older,
      },
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'newer',
        createdAt: newer,
      },
    ])
    .returning({ id: messages.id, createdAt: messages.createdAt });
  olderId = inserted.find((m) => m.createdAt.getTime() === older.getTime())!.id;
  newerId = inserted.find((m) => m.createdAt.getTime() === newer.getTime())!.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('markConversationRead', () => {
  it('advances last_read_at to the through-message time (regression: Date must be serialized for the sql`` fragment)', async () => {
    const result = await markConversationRead(conversationId, newerId);
    expect(result).toEqual({ ok: true });

    const [conv] = await db
      .select({ lastReadAt: conversations.lastReadAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.lastReadAt?.getTime()).toBe(newer.getTime());
  });

  it('never moves the watermark backwards (GREATEST)', async () => {
    await markConversationRead(conversationId, newerId);
    const result = await markConversationRead(conversationId, olderId);
    expect(result).toEqual({ ok: true });

    const [conv] = await db
      .select({ lastReadAt: conversations.lastReadAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.lastReadAt?.getTime()).toBe(newer.getTime());
  });

  it('returns ok:false for a message outside the conversation', async () => {
    const result = await markConversationRead(conversationId, randomUUID());
    expect(result).toEqual({ ok: false });
  });

  it('clears unread when the through-message uses the DB-default now() timestamp (regression: unread-microseconds)', async () => {
    // Insert WITHOUT an explicit createdAt so the column default now() applies:
    // that value carries microsecond precision, which the old JS-Date round-trip
    // truncated to milliseconds — leaving the through-message counted as unread.
    // Every other test passes explicit ms-precision Dates, which is exactly why
    // this bug went uncaught.
    const [fresh] = await db
      .insert(messages)
      .values({
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'micros',
      })
      .returning({ id: messages.id });

    const result = await markConversationRead(conversationId, fresh.id);
    expect(result).toEqual({ ok: true });

    const rows = await getChatListSnapshot(ptId);
    expect(rows.find((r) => r.id === conversationId)?.unread_count).toBe(0);
    await expect(getUnreadChatCount(ptId)).resolves.toBe(0);
  });
});

describe('instrumentedAction wrapper (via markConversationRead)', () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it('logs action.error once and rethrows a genuine failure', async () => {
    // Not a valid UUID: the underlying query throws a real Postgres error
    // (invalid input syntax for uuid), giving instrumentedAction something
    // real to catch, log, and rethrow.
    await expect(
      markConversationRead(conversationId, 'not-a-uuid'),
    ).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [eventName, message, attrs] = errorSpy.mock.calls[0];
    expect(eventName).toBe('action.error');
    expect(message).toBe('chat.markConversationRead');
    expect(attrs).toMatchObject({ action: 'chat.markConversationRead' });
  });

  it('passes a redirect through unchanged, without logging', async () => {
    const previous = authState.userId;
    authState.userId = null;
    try {
      await expect(
        markConversationRead(conversationId, newerId),
      ).rejects.toThrow('REDIRECT:/sign-in');
    } finally {
      authState.userId = previous;
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('sendUpcomingReminderTemplate', () => {
  let templateId = '';

  beforeEach(async () => {
    errorSpy.mockClear();
    sendTemplateMock.mockReset();
    sendTemplateMock.mockResolvedValue({ messageId: 'wamid.tpl' });

    // The outer beforeEach recreated the patient + whatsapp conversation (and
    // cascade-cleared appointments/messages). Connections and templates key on
    // ptId, so clear + reseed them here for a deterministic reminder path.
    await db
      .delete(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));

    await db.insert(whatsappConnections).values({
      ptId,
      phoneNumberId: `PNI_${Date.now()}`,
      wabaId: `WABA_${Date.now()}`,
      status: 'active',
    });
    await db.insert(appointments).values({
      ptId,
      patientId,
      startsAt: new Date('2026-08-01T09:00:00.000Z'),
      endsAt: new Date('2026-08-01T10:00:00.000Z'),
      status: 'confirmed',
    });
    const [template] = await db
      .insert(messageTemplates)
      .values({
        ptId,
        name: REMINDER_TEMPLATE.name,
        language: REMINDER_TEMPLATE.language,
        status: 'approved',
        body: 'Kujtesë: {{1}} te {{2}} më {{3}}.',
      })
      .returning({ id: messageTemplates.id });
    templateId = template.id;
  });

  it('persists the reminder and pauses the AI on a successful send', async () => {
    const result = await sendUpcomingReminderTemplate(conversationId);
    expect(result).toEqual({ ok: true });
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);

    const stored = await db
      .select({
        externalId: messages.externalId,
        templateId: messages.templateId,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    expect(stored).toHaveLength(1);
    expect(stored[0].externalId).toBe('wamid.tpl');

    const [conv] = await db
      .select({ aiActive: conversations.aiActive })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.aiActive).toBe(false);
  });

  it('reports "sent but not saved" (not "not sent") and logs the wamid when persistence fails', async () => {
    const txSpy = vi
      .spyOn(db, 'transaction')
      .mockRejectedValueOnce(new Error('boom'));

    const result = await sendUpcomingReminderTemplate(conversationId);
    txSpy.mockRestore();

    expect(result).toEqual({
      ok: false,
      error: 'Kujtesa u dërgua, por nuk u ruajt. Rifresko bisedën.',
    });
    // The paid template must NOT be re-sent, and no reminder row was persisted.
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const stored = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    expect(stored).toHaveLength(0);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [eventName, , attrs] = errorSpy.mock.calls[0];
    expect(eventName).toBe('chat.reminder_persist_failed');
    expect(attrs).toMatchObject({ externalId: 'wamid.tpl' });
  });
});
