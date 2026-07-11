import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  conversations,
  costDaily,
  messages,
  patients,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { aggregateCostDailyCore } from '../daily-cost-rollup';

// Fixed target UTC day, well clear of "now" so in/out-of-window seeding is exact.
const DAY = new Date('2026-06-15T12:00:00.000Z');
const inDay = (hhmm: string) => new Date(`2026-06-15T${hhmm}:00.000Z`);
const NEXT_DAY = new Date('2026-06-16T09:00:00.000Z');
const PREV_DAY = new Date('2026-06-14T09:00:00.000Z');

let ptA = '';
let ptB = '';

async function makeUser(tag: string): Promise<string> {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `cost-rollup-${tag}-${Date.now()}@example.com`,
    password: 'cost-rollup-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  return data.user.id;
}

// One whatsapp conversation is allowed per patient (unique on patient+channel),
// so each distinct conversation needs its own patient.
async function newConversation(ptId: string): Promise<string> {
  const [pat] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'seed',
      phone: `+49${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    })
    .returning({ id: patients.id });
  const [conv] = await db
    .insert(conversations)
    .values({ ptId, patientId: pat.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  return conv.id;
}

async function seedMessage(args: {
  ptId: string;
  conversationId: string;
  role: 'ai' | 'patient';
  createdAt: Date;
  model?: string;
  aiCostMicrousd?: number;
  cachedTokens?: number;
}): Promise<void> {
  await db.insert(messages).values({
    ptId: args.ptId,
    conversationId: args.conversationId,
    role: args.role,
    channel: 'whatsapp',
    content: 'x',
    model: args.model ?? null,
    aiCostMicrousd: args.aiCostMicrousd ?? null,
    cachedTokens: args.cachedTokens ?? null,
    createdAt: args.createdAt,
  });
}

beforeAll(async () => {
  ptA = await makeUser('a');
  ptB = await makeUser('b');
});

beforeEach(async () => {
  await db.delete(costDaily).where(inArray(costDaily.ptId, [ptA, ptB]));
  await db.delete(patients).where(inArray(patients.ptId, [ptA, ptB]));

  // --- PT A: 2 AI turns + patient messages across 2 conversations on DAY ---
  const a1 = await newConversation(ptA);
  const a2 = await newConversation(ptA);

  await seedMessage({
    ptId: ptA,
    conversationId: a1,
    role: 'ai',
    createdAt: inDay('10:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 100,
    cachedTokens: 10,
  });
  await seedMessage({
    ptId: ptA,
    conversationId: a1,
    role: 'ai',
    createdAt: inDay('11:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 50,
    cachedTokens: 5,
  });
  // Two distinct inbound conversations (a1, a2) + a duplicate inbound in a1.
  await seedMessage({
    ptId: ptA,
    conversationId: a1,
    role: 'patient',
    createdAt: inDay('09:59'),
  });
  await seedMessage({
    ptId: ptA,
    conversationId: a1,
    role: 'patient',
    createdAt: inDay('10:30'),
  });
  await seedMessage({
    ptId: ptA,
    conversationId: a2,
    role: 'patient',
    createdAt: inDay('12:00'),
  });
  // Out-of-window: a costly AI turn the NEXT day and an inbound the PREV day.
  await seedMessage({
    ptId: ptA,
    conversationId: a1,
    role: 'ai',
    createdAt: NEXT_DAY,
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 9_999,
    cachedTokens: 999,
  });
  const a3 = await newConversation(ptA);
  await seedMessage({
    ptId: ptA,
    conversationId: a3,
    role: 'patient',
    createdAt: PREV_DAY,
  });

  // --- PT B: 1 AI turn + 1 inbound conversation on DAY ---
  const b1 = await newConversation(ptB);
  await seedMessage({
    ptId: ptB,
    conversationId: b1,
    role: 'ai',
    createdAt: inDay('14:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 200,
    cachedTokens: 20,
  });
  await seedMessage({
    ptId: ptB,
    conversationId: b1,
    role: 'patient',
    createdAt: inDay('13:59'),
  });
});

afterAll(async () => {
  await db.delete(costDaily).where(inArray(costDaily.ptId, [ptA, ptB]));
  const sb = createServiceClient();
  if (ptA) await sb.auth.admin.deleteUser(ptA);
  if (ptB) await sb.auth.admin.deleteUser(ptB);
});

async function rowFor(ptId: string) {
  const [row] = await db
    .select()
    .from(costDaily)
    .where(and(eq(costDaily.ptId, ptId), eq(costDaily.day, '2026-06-15')));
  return row;
}

describe('aggregateCostDailyCore', () => {
  it('sums AI cost/cached and counts distinct inbound conversations per PT', async () => {
    const rows = await aggregateCostDailyCore(DAY);

    const byPt = new Map(rows.map((r) => [r.ptId, r]));
    expect(byPt.get(ptA)).toMatchObject({
      aiCostMicrousd: 150,
      aiCachedTokens: 15,
      metaConversations: 2,
      metaCostMicroEur: 120_000,
    });
    expect(byPt.get(ptB)).toMatchObject({
      aiCostMicrousd: 200,
      aiCachedTokens: 20,
      metaConversations: 1,
      metaCostMicroEur: 60_000,
    });

    const persistedA = await rowFor(ptA);
    expect(persistedA).toMatchObject({
      aiCostMicrousd: 150,
      aiCachedTokens: 15,
      metaConversations: 2,
      metaCostMicroEur: 120_000,
    });
    const persistedB = await rowFor(ptB);
    expect(persistedB.metaCostMicroEur).toBe(60_000);
  });

  it('is idempotent: re-running upserts in place and advances computed_at', async () => {
    await aggregateCostDailyCore(DAY);
    const first = await rowFor(ptA);
    await new Promise((r) => setTimeout(r, 10));
    await aggregateCostDailyCore(DAY);

    const rows = await db
      .select()
      .from(costDaily)
      .where(and(eq(costDaily.ptId, ptA), eq(costDaily.day, '2026-06-15')));
    expect(rows).toHaveLength(1);
    expect(rows[0].aiCostMicrousd).toBe(150);
    expect(rows[0].computedAt.getTime()).toBeGreaterThanOrEqual(
      first.computedAt.getTime(),
    );
  });
});
