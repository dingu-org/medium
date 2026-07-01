import { randomUUID } from 'node:crypto';
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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, events, patients } from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { escalateConversationToHuman } from '../escalation';

let ptId = '';
let patientId = '';
let conversationId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `escalation-${Date.now()}@example.com`,
    password: 'escalation-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(events).where(eq(events.ptId, ptId)); // cascades event_outbox
  await db.delete(patients).where(eq(patients.ptId, ptId)); // cascades conversations
  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: '447700900600',
      waId: '447700900600',
    })
    .returning({ id: patients.id });
  patientId = patient.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('escalateConversationToHuman', () => {
  it('flips the conversation and emits a published escalation event', async () => {
    const send = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    const escalated = await escalateConversationToHuman({
      ptId,
      patientId,
      conversationId,
    });
    expect(escalated).toBe(true);

    const [conversation] = await db
      .select({
        aiActive: conversations.aiActive,
        escalationState: conversations.escalationState,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conversation).toMatchObject({
      aiActive: false,
      escalationState: 'requested',
    });

    const rows = await db
      .select({ type: events.type })
      .from(events)
      .where(eq(events.ptId, ptId));
    expect(rows).toEqual([{ type: 'conversation.escalated' }]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'conversation.escalated',
        data: expect.objectContaining({ ptId, conversationId, patientId }),
      }),
    );
  });

  it('is a no-op when the conversation is already escalated (no duplicate event/push)', async () => {
    const send = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    expect(
      await escalateConversationToHuman({ ptId, patientId, conversationId }),
    ).toBe(true);
    // Second call on the now-escalated conversation must not re-emit.
    expect(
      await escalateConversationToHuman({ ptId, patientId, conversationId }),
    ).toBe(false);

    const rows = await db
      .select({ type: events.type })
      .from(events)
      .where(eq(events.ptId, ptId));
    expect(rows).toEqual([{ type: 'conversation.escalated' }]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no conversation matches', async () => {
    const send = vi
      .spyOn(inngest, 'send')
      .mockResolvedValue({ ids: [] } as never);

    const escalated = await escalateConversationToHuman({
      ptId,
      patientId,
      conversationId: randomUUID(),
    });
    expect(escalated).toBe(false);

    const rows = await db.select().from(events).where(eq(events.ptId, ptId));
    expect(rows).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
});
