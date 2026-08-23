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
  customers,
  waMessageStatuses,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  aggregateCostDailyCore,
  aggregateCostDailyWindow,
} from '../daily-cost-rollup';
import {
  DAY as DAY_MS,
  HOUR,
  MINUTE,
  SECOND,
  testNowUtc,
} from '@/tests/support/clock';

// The rollup buckets by UTC day, so the fixtures need a real one — derived, and
// set five days back so it stays well clear of "now": anything else in this DB
// is stamped by Postgres' own `now()`, which lands on today.
const DAY_START = new Date(testNowUtc({ hour: 0 }).getTime() - 5 * DAY_MS);
const DAY = new Date(DAY_START.getTime() + 12 * HOUR);
const NEXT_DAY_START = new Date(DAY_START.getTime() + DAY_MS);
const NEXT_DAY = new Date(NEXT_DAY_START.getTime() + 9 * HOUR);
const PREV_DAY = new Date(DAY_START.getTime() - DAY_MS + 9 * HOUR);
/** The `cost_daily.day` key for the target day. */
const DAY_KEY = DAY_START.toISOString().slice(0, 10);
/** A wall time (`hh:mm` or `hh:mm:ss`) inside the target UTC day. */
const inDay = (hms: string) => {
  const [h, m, s = 0] = hms.split(':').map(Number);
  return new Date(DAY_START.getTime() + h * HOUR + m * MINUTE + s * SECOND);
};

let accountA = '';
let accountB = '';

async function makeUser(tag: string): Promise<string> {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `cost-rollup-${tag}-${Date.now()}@example.com`,
    password: 'cost-rollup-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  return data.user.id;
}

// One whatsapp conversation is allowed per customer (unique on customer+channel),
// so each distinct conversation needs its own customer.
async function newConversation(accountId: string): Promise<string> {
  const [pat] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'seed',
      phone: `+49${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    })
    .returning({ id: customers.id });
  const [conv] = await db
    .insert(conversations)
    .values({ accountId, customerId: pat.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  return conv.id;
}

async function seedMessage(args: {
  accountId: string;
  conversationId: string;
  role: 'ai' | 'customer';
  createdAt: Date;
  model?: string;
  aiCostMicrousd?: number;
  cachedTokens?: number;
}): Promise<void> {
  await db.insert(messages).values({
    accountId: args.accountId,
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
  accountA = await makeUser('a');
  accountB = await makeUser('b');
});

beforeEach(async () => {
  await db.delete(costDaily).where(inArray(costDaily.accountId, [accountA, accountB]));
  await db.delete(customers).where(inArray(customers.accountId, [accountA, accountB]));

  // --- PT A: 2 AI turns + customer messages across 2 conversations on DAY ---
  const a1 = await newConversation(accountA);
  const a2 = await newConversation(accountA);

  await seedMessage({
    accountId: accountA,
    conversationId: a1,
    role: 'ai',
    createdAt: inDay('10:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 100,
    cachedTokens: 10,
  });
  await seedMessage({
    accountId: accountA,
    conversationId: a1,
    role: 'ai',
    createdAt: inDay('11:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 50,
    cachedTokens: 5,
  });
  // Two distinct inbound conversations (a1, a2) + a duplicate inbound in a1.
  await seedMessage({
    accountId: accountA,
    conversationId: a1,
    role: 'customer',
    createdAt: inDay('09:59'),
  });
  await seedMessage({
    accountId: accountA,
    conversationId: a1,
    role: 'customer',
    createdAt: inDay('10:30'),
  });
  await seedMessage({
    accountId: accountA,
    conversationId: a2,
    role: 'customer',
    createdAt: inDay('12:00'),
  });
  // Out-of-window: a costly AI turn the NEXT day and an inbound the PREV day.
  await seedMessage({
    accountId: accountA,
    conversationId: a1,
    role: 'ai',
    createdAt: NEXT_DAY,
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 9_999,
    cachedTokens: 999,
  });
  const a3 = await newConversation(accountA);
  await seedMessage({
    accountId: accountA,
    conversationId: a3,
    role: 'customer',
    createdAt: PREV_DAY,
  });

  // --- PT B: 1 AI turn + 1 inbound conversation on DAY ---
  const b1 = await newConversation(accountB);
  await seedMessage({
    accountId: accountB,
    conversationId: b1,
    role: 'ai',
    createdAt: inDay('14:00'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 200,
    cachedTokens: 20,
  });
  await seedMessage({
    accountId: accountB,
    conversationId: b1,
    role: 'customer',
    createdAt: inDay('13:59'),
  });
});

afterAll(async () => {
  await db.delete(costDaily).where(inArray(costDaily.accountId, [accountA, accountB]));
  const sb = createServiceClient();
  if (accountA) await sb.auth.admin.deleteUser(accountA);
  if (accountB) await sb.auth.admin.deleteUser(accountB);
});

async function rowFor(accountId: string) {
  const [row] = await db
    .select()
    .from(costDaily)
    .where(and(eq(costDaily.accountId, accountId), eq(costDaily.day, DAY_KEY)));
  return row;
}

describe('aggregateCostDailyCore', () => {
  it('sums AI cost/cached and counts distinct inbound conversations per PT', async () => {
    const rows = await aggregateCostDailyCore(DAY);

    const byAccount = new Map(rows.map((r) => [r.accountId, r]));
    expect(byAccount.get(accountA)).toMatchObject({
      aiCostMicrousd: 150,
      aiCachedTokens: 15,
      metaConversations: 2,
      metaCostMicroEur: 120_000,
    });
    expect(byAccount.get(accountB)).toMatchObject({
      aiCostMicrousd: 200,
      aiCachedTokens: 20,
      metaConversations: 1,
      metaCostMicroEur: 60_000,
    });

    const persistedA = await rowFor(accountA);
    expect(persistedA).toMatchObject({
      aiCostMicrousd: 150,
      aiCachedTokens: 15,
      metaConversations: 2,
      metaCostMicroEur: 120_000,
    });
    const persistedB = await rowFor(accountB);
    expect(persistedB.metaCostMicroEur).toBe(60_000);
  });

  it('is idempotent: re-running upserts in place and advances computed_at', async () => {
    await aggregateCostDailyCore(DAY);
    const first = await rowFor(accountA);
    await new Promise((r) => setTimeout(r, 10));
    await aggregateCostDailyCore(DAY);

    const rows = await db
      .select()
      .from(costDaily)
      .where(and(eq(costDaily.accountId, accountA), eq(costDaily.day, DAY_KEY)));
    expect(rows).toHaveLength(1);
    expect(rows[0].aiCostMicrousd).toBe(150);
    expect(rows[0].computedAt.getTime()).toBeGreaterThanOrEqual(
      first.computedAt.getTime(),
    );
  });

  it('has no status rows in the base fixtures → estimated fallback for accountA/accountB', async () => {
    await aggregateCostDailyCore(DAY);
    const a = await rowFor(accountA);
    const b = await rowFor(accountB);
    expect(a.metaCostSource).toBe('estimated');
    expect(a.metaBillableMessages).toBe(0);
    expect(a.metaCostMicroEur).toBe(120_000); // estimate(2 convos)
    expect(b.metaCostSource).toBe('estimated');
    expect(b.metaBillableMessages).toBe(0);
    expect(b.metaCostMicroEur).toBe(60_000); // estimate(1 convo)
  });
});

// --- Actual-first Meta costing off wa_message_statuses (Phase 16 C4) ---------
describe('aggregateCostDailyCore — Meta actual-first cost', () => {
  let accountC = '';
  let statusSeq = 0;

  async function seedStatus(args: {
    sentAt: Date | null;
    createdAt?: Date;
    billable: boolean | null;
    pricingCategory: string | null;
    lastStatus?: string;
  }): Promise<void> {
    await db.insert(waMessageStatuses).values({
      accountId: accountC,
      externalId: `wamid.c.${Date.now()}.${statusSeq++}.${Math.floor(
        Math.random() * 1e9,
      )}`,
      lastStatus: args.lastStatus ?? 'sent',
      sentAt: args.sentAt,
      billable: args.billable,
      pricingCategory: args.pricingCategory,
      createdAt: args.createdAt ?? args.sentAt ?? new Date(),
    });
  }

  async function rowForC() {
    const [row] = await db
      .select()
      .from(costDaily)
      .where(and(eq(costDaily.accountId, accountC), eq(costDaily.day, DAY_KEY)));
    return row;
  }

  beforeAll(async () => {
    accountC = await makeUser('c');
  });

  beforeEach(async () => {
    await db.delete(waMessageStatuses).where(eq(waMessageStatuses.accountId, accountC));
    await db.delete(costDaily).where(eq(costDaily.accountId, accountC));
    await db.delete(customers).where(eq(customers.accountId, accountC));
  });

  afterAll(async () => {
    await db.delete(waMessageStatuses).where(eq(waMessageStatuses.accountId, accountC));
    await db.delete(costDaily).where(eq(costDaily.accountId, accountC));
    await createServiceClient().auth.admin.deleteUser(accountC);
  });

  it('prices mixed billable categories from the rate card and marks source=actual', async () => {
    await seedStatus({
      sentAt: inDay('10:00'),
      billable: true,
      pricingCategory: 'utility',
    });
    await seedStatus({
      sentAt: inDay('11:00'),
      billable: true,
      pricingCategory: 'UTILITY', // case is normalized to the same rate
    });
    await seedStatus({
      sentAt: inDay('12:00'),
      billable: true,
      pricingCategory: 'service', // billable but €0 rate
    });
    await seedStatus({
      sentAt: inDay('13:00'),
      billable: false,
      pricingCategory: 'utility', // non-billable → excluded from cost
    });

    await aggregateCostDailyCore(DAY);
    const row = await rowForC();
    expect(row.metaCostSource).toBe('actual');
    expect(row.metaBillableMessages).toBe(3); // 2 utility + 1 service billable
    expect(row.metaCostMicroEur).toBe(2 * 21_000 + 1 * 0); // 42_000
  });

  it('records source=actual with €0 when every status row is non-billable', async () => {
    await seedStatus({
      sentAt: inDay('09:00'),
      billable: false,
      pricingCategory: 'utility',
    });
    await seedStatus({
      sentAt: inDay('10:00'),
      billable: false,
      pricingCategory: 'service',
    });

    await aggregateCostDailyCore(DAY);
    const row = await rowForC();
    expect(row.metaCostSource).toBe('actual');
    expect(row.metaBillableMessages).toBe(0);
    expect(row.metaCostMicroEur).toBe(0);
  });

  it('prices an unknown billable category at the utility fallback, not €0', async () => {
    await seedStatus({
      sentAt: inDay('08:00'),
      billable: true,
      pricingCategory: 'referral_conversion', // not in the known set
    });

    await aggregateCostDailyCore(DAY);
    const row = await rowForC();
    expect(row.metaCostSource).toBe('actual');
    expect(row.metaBillableMessages).toBe(1);
    expect(row.metaCostMicroEur).toBe(21_000); // fallback rate
  });

  it('buckets by send time: 23:59:59Z counts, the next midnight does not; null sent_at falls back to created_at', async () => {
    await seedStatus({
      sentAt: inDay('23:59:59'),
      billable: true,
      pricingCategory: 'utility',
    });
    await seedStatus({
      sentAt: NEXT_DAY_START, // next UTC day
      billable: true,
      pricingCategory: 'utility',
    });
    await seedStatus({
      sentAt: null, // buckets by created_at instead
      createdAt: inDay('06:00'),
      billable: true,
      pricingCategory: 'utility',
    });

    await aggregateCostDailyCore(DAY);
    const row = await rowForC();
    expect(row.metaCostSource).toBe('actual');
    expect(row.metaBillableMessages).toBe(2); // 23:59:59 + null-sentAt/in-day
    expect(row.metaCostMicroEur).toBe(2 * 21_000);
  });

  it('flips a day from estimated to actual when a status row lands on re-run (backfill window)', async () => {
    // Day starts with only a customer message → estimated fallback.
    const conv = await newConversation(accountC);
    await seedMessage({
      accountId: accountC,
      conversationId: conv,
      role: 'customer',
      createdAt: inDay('09:00'),
    });

    await aggregateCostDailyWindow(DAY, 1);
    const before = await rowForC();
    expect(before.metaCostSource).toBe('estimated');
    expect(before.metaBillableMessages).toBe(0);
    expect(before.metaCostMicroEur).toBe(60_000); // estimate(1 convo)

    // Meta status webhook lands afterwards; re-running the window flips it.
    await seedStatus({
      sentAt: inDay('10:00'),
      billable: true,
      pricingCategory: 'utility',
    });
    await aggregateCostDailyWindow(DAY, 1);

    const after = await db
      .select()
      .from(costDaily)
      .where(and(eq(costDaily.accountId, accountC), eq(costDaily.day, DAY_KEY)));
    expect(after).toHaveLength(1); // idempotent upsert, not a duplicate
    expect(after[0].metaCostSource).toBe('actual');
    expect(after[0].metaBillableMessages).toBe(1);
    expect(after[0].metaCostMicroEur).toBe(21_000);
  });
});
