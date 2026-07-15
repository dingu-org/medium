import { and, eq, inArray } from 'drizzle-orm';
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
import { POST as postAppointment } from '@/app/api/pwa/mutations/appointment/route';
import { POST as postMessage } from '@/app/api/pwa/mutations/message/route';
import {
  GraphApiError,
  OutsideWindowError,
} from '@/lib/channels/whatsapp/errors';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messages,
  patients,
  pwaMutations,
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

const { getUserMock, sendFreeFormMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  sendFreeFormMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/lib/channels/whatsapp/client', () => ({
  sendFreeForm: sendFreeFormMock,
}));

let ptId = '';
let otherPtId = '';
let counter = 0;

const nextId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

function makePost(path: string, body: object): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedConversation(ownerPtId: string) {
  const [patient] = await db
    .insert(patients)
    .values({
      ptId: ownerPtId,
      name: `Patient ${++counter}`,
      phone: `+1555000${counter}`,
      waId: `1555000${counter}`,
    })
    .returning({ id: patients.id });

  const [conversation] = await db
    .insert(conversations)
    .values({
      ptId: ownerPtId,
      patientId: patient.id,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
      aiActive: true,
    })
    .returning({ id: conversations.id });

  return { patientId: patient.id, conversationId: conversation.id };
}

async function seedConnection(ownerPtId: string) {
  await db.insert(whatsappConnections).values({
    ptId: ownerPtId,
    phoneNumberId: `PNI_${Date.now()}_${++counter}`,
    wabaId: `WABA_${counter}`,
    status: 'active',
  });
}

async function seedAppointment(ownerPtId: string) {
  const { patientId } = await seedConversation(ownerPtId);
  const [appointment] = await db
    .insert(appointments)
    .values({
      ptId: ownerPtId,
      patientId,
      startsAt: new Date('2026-07-10T09:00:00.000Z'),
      endsAt: new Date('2026-07-10T10:00:00.000Z'),
      status: 'pending',
    })
    .returning({ id: appointments.id });
  return appointment.id;
}

beforeAll(async () => {
  const supabase = createServiceClient();
  const a = await supabase.auth.admin.createUser({
    email: `pwa-route-${Date.now()}@example.com`,
    password: 'pwa-route-pass-1234',
    email_confirm: true,
  });
  if (a.error || !a.data.user) {
    throw new Error(`createUser failed: ${a.error?.message}`);
  }
  ptId = a.data.user.id;

  const b = await supabase.auth.admin.createUser({
    email: `pwa-route-other-${Date.now()}@example.com`,
    password: 'pwa-route-pass-1234',
    email_confirm: true,
  });
  if (b.error || !b.data.user) {
    throw new Error(`createUser failed: ${b.error?.message}`);
  }
  otherPtId = b.data.user.id;
});

beforeEach(async () => {
  getUserMock.mockReset();
  sendFreeFormMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
  sendFreeFormMock.mockResolvedValue({ messageId: 'wamid.pwa-test' });

  await db
    .delete(pwaMutations)
    .where(inArray(pwaMutations.ptId, [ptId, otherPtId]));
  await db
    .delete(whatsappConnections)
    .where(inArray(whatsappConnections.ptId, [ptId, otherPtId]));
  await db.delete(patients).where(inArray(patients.ptId, [ptId, otherPtId]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  const supabase = createServiceClient();
  if (ptId) await supabase.auth.admin.deleteUser(ptId);
  if (otherPtId) await supabase.auth.admin.deleteUser(otherPtId);
});

describe('PWA message mutation API', () => {
  it('requires authentication', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId: nextId(),
        conversationId: nextId(),
        body: 'Hello',
      }),
    );

    expect(res.status).toBe(401);
    expect(sendFreeFormMock).not.toHaveBeenCalled();
  });

  it('rejects conversations owned by another tenant', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(otherPtId);

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId: nextId(),
        conversationId,
        body: 'Hello',
      }),
    );

    expect(res.status).toBe(404);
    expect(sendFreeFormMock).not.toHaveBeenCalled();
  });

  it('does not duplicate sends or local messages for a replayed clientMutationId', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    const body = {
      clientMutationId,
      conversationId,
      body: 'Queued hello',
    };

    const first = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );
    const second = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const storedMessages = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.ptId, ptId),
          eq(messages.sourceEventId, clientMutationId),
        ),
      );
    expect(storedMessages).toHaveLength(1);
  });

  it('records WhatsApp send failures instead of leaving mutations processing', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    const body = {
      clientMutationId,
      conversationId,
      body: 'Queued hello',
    };
    sendFreeFormMock.mockRejectedValueOnce(
      new GraphApiError({ status: 500, message: 'Meta unavailable' }),
    );

    const first = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );
    const second = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(first.status).toBe(502);
    await expect(first.json()).resolves.toMatchObject({
      ok: false,
      error:
        "WhatsApp nuk e dërgoi mesazhin. Provo sërish ose rilidhe WhatsApp-in.",
    });
    expect(second.status).toBe(409);
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const [storedMutation] = await db
      .select({ status: pwaMutations.status, error: pwaMutations.error })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      )
      .limit(1);
    expect(storedMutation).toEqual({
      status: 'failed',
      error:
        "WhatsApp nuk e dërgoi mesazhin. Provo sërish ose rilidhe WhatsApp-in.",
    });
  });

  it('retries stale processing message mutations', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    await db.insert(pwaMutations).values({
      ptId,
      clientMutationId,
      type: 'message.send',
      status: 'processing',
      updatedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId,
        conversationId,
        body: 'Recovered hello',
      }),
    );

    expect(res.status).toBe(200);
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const [storedMutation] = await db
      .select({ status: pwaMutations.status, error: pwaMutations.error })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      )
      .limit(1);
    expect(storedMutation).toEqual({ status: 'success', error: null });
  });

  it('recovers a stamped-but-unpersisted send on the same clientMutationId without re-sending', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    const body = {
      clientMutationId,
      conversationId,
      body: 'Recoverable hello',
    };

    // Fail the persist transaction on the first attempt only. The Graph send has
    // already succeeded and been stamped ('sent') before the txn runs.
    const txSpy = vi
      .spyOn(db, 'transaction')
      .mockRejectedValueOnce(new Error('boom'));

    const first = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(first.status).toBe(503);
    await expect(first.json()).resolves.toMatchObject({
      ok: false,
      code: 'persist_pending',
    });
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const [stamped] = await db
      .select({ status: pwaMutations.status, result: pwaMutations.result })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      )
      .limit(1);
    expect(stamped.status).toBe('sent');
    expect((stamped.result as { graphMessageId?: string }).graphMessageId).toBe(
      'wamid.pwa-test',
    );

    const beforeRecover = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.ptId, ptId),
          eq(messages.sourceEventId, clientMutationId),
        ),
      );
    expect(beforeRecover).toHaveLength(0);

    // Same id, real transaction now: recover path finishes the DB write and
    // must NOT call Graph again.
    txSpy.mockRestore();
    const second = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(second.status).toBe(200);
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const storedMessages = await db
      .select({
        externalId: messages.externalId,
        sourceEventId: messages.sourceEventId,
      })
      .from(messages)
      .where(
        and(
          eq(messages.ptId, ptId),
          eq(messages.sourceEventId, clientMutationId),
        ),
      );
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].externalId).toBe('wamid.pwa-test');

    const [finalMutation] = await db
      .select({ status: pwaMutations.status })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      )
      .limit(1);
    expect(finalMutation.status).toBe('success');
  });

  it('recovers directly from a pre-seeded sent ledger row', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    await db.insert(pwaMutations).values({
      ptId,
      clientMutationId,
      type: 'message.send',
      status: 'sent',
      result: { graphMessageId: 'wamid.recover' },
    });

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId,
        conversationId,
        body: 'Recovered from sent',
      }),
    );

    expect(res.status).toBe(200);
    expect(sendFreeFormMock).not.toHaveBeenCalled();

    const storedMessages = await db
      .select({ externalId: messages.externalId })
      .from(messages)
      .where(
        and(
          eq(messages.ptId, ptId),
          eq(messages.sourceEventId, clientMutationId),
        ),
      );
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0].externalId).toBe('wamid.recover');

    const [storedMutation] = await db
      .select({ status: pwaMutations.status })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      )
      .limit(1);
    expect(storedMutation.status).toBe('success');
  });

  it('pre-send refusal discards the ledger so the same id can retry', async () => {
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    const body = {
      clientMutationId,
      conversationId,
      body: 'No connection yet',
    };

    const first = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(first.status).toBe(409);
    await expect(first.json()).resolves.toMatchObject({
      ok: false,
      code: 'no_connection',
    });
    expect(sendFreeFormMock).not.toHaveBeenCalled();

    const discarded = await db
      .select({ id: pwaMutations.id })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      );
    expect(discarded).toHaveLength(0);

    await seedConnection(ptId);
    const second = await postMessage(
      makePost('/api/pwa/mutations/message', body),
    );

    expect(second.status).toBe(200);
    expect(sendFreeFormMock).toHaveBeenCalledTimes(1);

    const storedMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.ptId, ptId),
          eq(messages.sourceEventId, clientMutationId),
        ),
      );
    expect(storedMessages).toHaveLength(1);
  });

  it('outside-window refusal discards the ledger', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    sendFreeFormMock.mockRejectedValueOnce(new OutsideWindowError());

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId,
        conversationId,
        body: 'Window closed',
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'outside_window',
    });

    const rows = await db
      .select({ id: pwaMutations.id })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('rate-limited (429) discards the ledger', async () => {
    await seedConnection(ptId);
    const { conversationId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    sendFreeFormMock.mockRejectedValueOnce(
      new GraphApiError({ status: 429, message: 'rate' }),
    );

    const res = await postMessage(
      makePost('/api/pwa/mutations/message', {
        clientMutationId,
        conversationId,
        body: 'Slow down',
      }),
    );

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      code: 'rate_limited',
    });

    const rows = await db
      .select({ id: pwaMutations.id })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      );
    expect(rows).toHaveLength(0);
  });
});

describe('PWA appointment mutation API', () => {
  it('requires authentication', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await postAppointment(
      makePost('/api/pwa/mutations/appointment', {
        clientMutationId: nextId(),
        action: 'notes',
        appointmentId: nextId(),
        notes: 'Bring reports',
      }),
    );

    expect(res.status).toBe(401);
  });

  it('rejects appointment mutations owned by another tenant', async () => {
    const appointmentId = await seedAppointment(otherPtId);

    const res = await postAppointment(
      makePost('/api/pwa/mutations/appointment', {
        clientMutationId: nextId(),
        action: 'cancel',
        appointmentId,
      }),
    );

    expect(res.status).toBe(404);
    const [otherAppointment] = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(otherAppointment.status).toBe('pending');
  });

  it('does not duplicate manual bookings for a replayed clientMutationId', async () => {
    const { patientId } = await seedConversation(ptId);
    const clientMutationId = nextId();
    const body = {
      clientMutationId,
      action: 'manual_book',
      patientId,
      date: '2026-07-11',
      time: '10:30',
      serviceType: 'Offline booking',
    };

    const first = await postAppointment(
      makePost('/api/pwa/mutations/appointment', body),
    );
    const second = await postAppointment(
      makePost('/api/pwa/mutations/appointment', body),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const storedAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.ptId, ptId));
    expect(storedAppointments).toHaveLength(1);

    const storedMutations = await db
      .select({ status: pwaMutations.status })
      .from(pwaMutations)
      .where(
        and(
          eq(pwaMutations.ptId, ptId),
          eq(pwaMutations.clientMutationId, clientMutationId),
        ),
      );
    expect(storedMutations).toEqual([{ status: 'success' }]);
  });
});
