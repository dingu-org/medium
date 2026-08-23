import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  conversationDays,
  conversations,
  events,
  eventOutbox,
  messages,
  customers,
  accounts,
} from '@/lib/db/schema';
import {
  checkAndRecordConversation,
  getConversationUsage,
} from '@/lib/billing/usage';
import { getPlan } from '@/lib/billing/plans';
import { createServiceClient } from '@/lib/supabase/service';
import { testNow } from '@/tests/support/clock';

const FREE_LIMIT = getPlan('free').conversationsPerMonth;
// The unit under test IS a calendar month, so these need a real one. The year is
// derived so nothing here can go stale; the month is pinned to July on purpose —
// it has 31 days (the free cap is 30 customer-days plus one over-cap day on top)
// and Europe/Tirane runs at UTC+2 in July, which is what makes the month-end
// straddle below actually straddle. A 28-day or winter month breaks both.
const YEAR = testNow().getUTCFullYear();
const MONTH_KEY = `${YEAR}-07`;
const NEXT_MONTH_KEY = `${YEAR}-08`;
const localDay = (day: number) => `${MONTH_KEY}-${String(day).padStart(2, '0')}`;
const dayAt = (day: number, hhmm: string) =>
  new Date(`${localDay(day)}T${hhmm}:00Z`);
let accountId = '';
let customerId = '';
let conversationId = '';
let seq = 0;

async function makeCustomerConversation(): Promise<{
  customerId: string;
  conversationId: string;
}> {
  seq += 1;
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: `P${seq}`, phone: `44770090${seq}`, waId: `44770090${seq}` })
    .returning({ id: customers.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  return { customerId: customer.id, conversationId: conversation.id };
}

/** Seed a counted day-fact directly (bypasses the gate) for a distinct day. */
async function seedDay(monthKey: string, localDay: string) {
  await db.insert(conversationDays).values({
    accountId,
    customerId,
    conversationId,
    localDay,
    monthKey,
    firstMessageId: crypto.randomUUID(),
  });
}

/**
 * Seed a contiguous range of counted day-facts in ONE insert. Bulk-inserting
 * keeps these cap-filling tests well under the default timeout — dozens of
 * single-row round-trips otherwise flirt with it.
 */
async function seedDayRange(monthKey: string, startDay: number, endDay: number) {
  if (startDay > endDay) return;
  const values = [];
  for (let day = startDay; day <= endDay; day += 1) {
    values.push({
      accountId,
      customerId,
      conversationId,
      localDay: `${monthKey}-${String(day).padStart(2, '0')}`,
      monthKey,
      firstMessageId: crypto.randomUUID(),
    });
  }
  await db.insert(conversationDays).values(values);
}

async function countEvents(type: string): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.accountId, accountId), eq(events.type, type)));
  return rows.length;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `usage-${Date.now()}@example.com`,
    password: 'usage-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(conversationDays).where(eq(conversationDays.accountId, accountId));
  await db.delete(messages).where(eq(messages.accountId, accountId));
  await db.delete(conversations).where(eq(conversations.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(eventOutbox).where(eq(eventOutbox.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db
    .update(accounts)
    .set({ plan: 'free', planLifetime: false, planExpiresAt: null, timezone: 'UTC' })
    .where(eq(accounts.id, accountId));
  const seeded = await makeCustomerConversation();
  customerId = seeded.customerId;
  conversationId = seeded.conversationId;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('checkAndRecordConversation', () => {
  it('counts a customer-day once and is idempotent for the same day', async () => {
    const args = {
      accountId,
      customerId,
      conversationId,
      plan: 'free' as const,
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(5, '10:00'),
    };
    const first = await checkAndRecordConversation(args);
    const second = await checkAndRecordConversation({
      ...args,
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(5, '18:00'),
    });

    expect(first).toMatchObject({ status: 'allowed', counted: true });
    expect(second).toMatchObject({ status: 'allowed', counted: false });

    const rows = await db
      .select({ id: conversationDays.id })
      .from(conversationDays)
      .where(eq(conversationDays.accountId, accountId));
    expect(rows).toHaveLength(1);
  });

  it('keys the day-fact by the PT timezone (Europe/Tirane)', async () => {
    // 22:30 UTC on Jul 31 is 00:30 Aug 1 in Tirane (UTC+2).
    await checkAndRecordConversation({
      accountId,
      customerId,
      conversationId,
      plan: 'free',
      timezone: 'Europe/Tirane',
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(31, '22:30'),
    });
    const [row] = await db
      .select({
        localDay: conversationDays.localDay,
        monthKey: conversationDays.monthKey,
      })
      .from(conversationDays)
      .where(eq(conversationDays.accountId, accountId));
    expect(row).toMatchObject({
      localDay: `${NEXT_MONTH_KEY}-01`,
      monthKey: NEXT_MONTH_KEY,
    });
  });

  it('lets exactly one of two boundary racers through', { timeout: 15000 }, async () => {
    // Pre-fill to one below the cap with distinct filler days.
    await seedDayRange(MONTH_KEY, 1, FREE_LIMIT - 1);
    const a = await makeCustomerConversation();
    const b = await makeCustomerConversation();

    const [ra, rb] = await Promise.all([
      checkAndRecordConversation({
        accountId,
        customerId: a.customerId,
        conversationId: a.conversationId,
        plan: 'free',
        timezone: 'UTC',
        inboundMessageId: crypto.randomUUID(),
        instant: dayAt(30, '09:00'),
      }),
      checkAndRecordConversation({
        accountId,
        customerId: b.customerId,
        conversationId: b.conversationId,
        plan: 'free',
        timezone: 'UTC',
        inboundMessageId: crypto.randomUUID(),
        instant: dayAt(30, '09:00'),
      }),
    ]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual(['allowed', 'at_cap']);

    const rows = await db
      .select({ id: conversationDays.id })
      .from(conversationDays)
      .where(
        and(
          eq(conversationDays.accountId, accountId),
          eq(conversationDays.monthKey, MONTH_KEY),
        ),
      );
    expect(rows).toHaveLength(FREE_LIMIT);
  });

  it('emits one warning and one reached event, deduped', { timeout: 15000 }, async () => {
    const warn = Math.ceil(0.8 * FREE_LIMIT);
    // Seed up to just below the warn threshold.
    await seedDayRange(MONTH_KEY, 1, warn - 1);
    // Crossing the warn threshold emits exactly one warning.
    await checkAndRecordConversation({
      accountId,
      customerId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(warn, '10:00'),
    });
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(0);

    // Fill the gap up to just below the cap, then cross it.
    await seedDayRange(MONTH_KEY, warn + 1, FREE_LIMIT - 1);
    await checkAndRecordConversation({
      accountId,
      customerId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(FREE_LIMIT, '10:00'),
    });
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(1);

    // A fresh customer-day over the cap is turned away and emits nothing new.
    const over = await checkAndRecordConversation({
      accountId,
      customerId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: dayAt(31, '10:00'),
    });
    expect(over.status).toBe('at_cap');
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(1);
  });
});

describe('getConversationUsage', () => {
  it('reports the effective plan cap and month usage', async () => {
    await seedDay(MONTH_KEY, localDay(1));
    await seedDay(MONTH_KEY, localDay(2));
    const usage = await getConversationUsage(
      accountId,
      dayAt(15, '10:00'),
    );
    expect(usage).toMatchObject({
      used: 2,
      limit: FREE_LIMIT,
      monthKey: MONTH_KEY,
      atCap: false,
    });
  });
});
