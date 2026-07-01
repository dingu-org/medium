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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { markConversationRead } from '../actions';

const authState = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: authState.userId } } }),
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
});
