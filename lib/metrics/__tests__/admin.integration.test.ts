import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  billingOrders,
  conversationDays,
  conversations,
  costDaily,
  events,
  messages,
  customers,
  accounts,
  waMessageStatuses,
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  type FunnelWindow,
  getAdminMetrics,
  getBillingMetrics,
} from '@/lib/metrics/admin';
import { DAY, HOUR, testNowUtc } from '@/tests/support/clock';
import { deltaOf } from '@/tests/support/isolation';

// Fixed evaluation instant, derived rather than written down: every funnel and
// billing window here is measured backwards from `now`, so what the fixtures
// need is a stable *offset*, never a calendar date. Noon UTC on the 15th keeps
// every ±14d fixture inside the same month whatever its length, and leaves the
// ±12h ones on the same UTC day.
const NOW = testNowUtc({ dayOfMonth: 15 });
/** Days (and optionally hours) either side of NOW. */
const at = (days: number, hours = 0) =>
  new Date(NOW.getTime() + days * DAY + hours * HOUR);
/** The `yyyy-MM` key of NOW's month. */
const MONTH_KEY = NOW.toISOString().slice(0, 7);
/** The `cost_daily.day` key (a UTC yyyy-mm-dd string) that offset falls on. */
const dayKey = (days: number) => at(days).toISOString().slice(0, 10);

type Account = { id: string; email: string };
const created: Account[] = [];

async function makeUser(tag: string, createdAt: Date): Promise<Account> {
  const email = `admin-metrics-${tag}-${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}@example.com`;
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: 'admin-metrics-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  const id = data.user.id;
  // The signup trigger stamps created_at = now(); override to the test window.
  await db.update(accounts).set({ createdAt }).where(eq(accounts.id, id));
  const account = { id, email };
  created.push(account);
  return account;
}

async function newCustomer(accountId: string): Promise<string> {
  const [pat] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'seed',
      phone: `+49${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    })
    .returning({ id: customers.id });
  return pat.id;
}

async function newConversation(accountId: string, customerId: string): Promise<string> {
  const [conv] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp' })
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
}): Promise<void> {
  await db.insert(messages).values({
    accountId: args.accountId,
    conversationId: args.conversationId,
    role: args.role,
    channel: 'whatsapp',
    content: 'x',
    model: args.model ?? null,
    aiCostMicrousd: args.aiCostMicrousd ?? null,
    createdAt: args.createdAt,
  });
}

async function seedConnection(accountId: string, connectedAt: Date): Promise<void> {
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-${accountId.slice(0, 8)}-${Date.now()}`,
    wabaId: `w-${accountId.slice(0, 8)}`,
    connectedAt,
    status: 'active',
  });
}

async function seedAppointment(
  accountId: string,
  customerId: string,
  createdAt: Date,
): Promise<void> {
  await db.insert(appointments).values({
    accountId,
    customerId,
    startsAt: at(15, 22),
    endsAt: at(15, 23),
    createdAt,
  });
}

async function seedCostDaily(args: {
  accountId: string;
  day: string;
  ai: number;
  meta: number;
  metaCostSource?: 'actual' | 'estimated';
  metaBillableMessages?: number;
}): Promise<void> {
  await db.insert(costDaily).values({
    accountId: args.accountId,
    day: args.day,
    aiCostMicrousd: args.ai,
    metaCostMicroEur: args.meta,
    metaCostSource: args.metaCostSource ?? 'estimated',
    metaBillableMessages: args.metaBillableMessages ?? 0,
  });
}

let waStatusSeq = 0;
async function seedStatus(args: {
  accountId: string;
  sentAt: Date;
  billable: boolean;
  pricingCategory: string;
}): Promise<void> {
  await db.insert(waMessageStatuses).values({
    accountId: args.accountId,
    externalId: `wamid.admin.${Date.now()}.${waStatusSeq++}.${Math.floor(
      Math.random() * 1e9,
    )}`,
    lastStatus: 'sent',
    sentAt: args.sentAt,
    billable: args.billable,
    pricingCategory: args.pricingCategory,
    createdAt: args.sentAt,
  });
}

async function seedPushEvent(args: {
  accountId: string;
  occurredAt: Date;
  sent: number;
  removed: number;
}): Promise<void> {
  await db.insert(events).values({
    accountId: args.accountId,
    type: 'push.dispatched',
    payload: {
      accountId: args.accountId,
      sourceEvent: 'notification.requested',
      sent: args.sent,
      removed: args.removed,
    },
    occurredAt: args.occurredAt,
  });
}

// --- Phase 16 C7 billing-metric seeding helpers ---------------------------

async function setPlan(
  accountId: string,
  fields: {
    plan?: 'free' | 'solo';
    planLifetime?: boolean;
    planExpiresAt?: Date | null;
  },
): Promise<void> {
  await db.update(accounts).set(fields).where(eq(accounts.id, accountId));
}

let orderSeq = 0;
async function seedOrder(args: {
  accountId: string;
  status: 'created' | 'paid' | 'failed' | 'expired';
  plan?: 'free' | 'solo';
  period?: 'monthly' | 'yearly';
  amountMinor?: number;
  createdAt: Date;
  paidAt?: Date | null;
  previousExpiresAt?: Date | null;
  newExpiresAt?: Date | null;
}): Promise<void> {
  await db.insert(billingOrders).values({
    accountId: args.accountId,
    pokOrderId: `admin-order-${Date.now()}-${orderSeq++}-${Math.floor(
      Math.random() * 1e9,
    )}`,
    plan: args.plan ?? 'solo',
    period: args.period ?? 'monthly',
    amountMinor: args.amountMinor ?? 250000,
    currency: 'ALL',
    status: args.status,
    createdAt: args.createdAt,
    paidAt: args.paidAt ?? null,
    previousExpiresAt: args.previousExpiresAt ?? null,
    newExpiresAt: args.newExpiresAt ?? null,
  });
}

async function seedConvDay(args: {
  accountId: string;
  localDay: string;
  monthKey: string;
}): Promise<void> {
  const customerId = await newCustomer(args.accountId);
  const conversationId = await newConversation(args.accountId, customerId);
  await db.insert(conversationDays).values({
    accountId: args.accountId,
    customerId,
    conversationId,
    localDay: args.localDay,
    monthKey: args.monthKey,
  });
}

async function seedBillingEvent(args: {
  accountId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}): Promise<void> {
  await db.insert(events).values({
    accountId: args.accountId,
    type: args.type,
    payload: args.payload,
    occurredAt: args.occurredAt,
  });
}

let accountY: Account;
let accountWeek: Account;
// `getAdminMetrics` is cross-tenant by design, so every count it returns
// includes whatever else is already in the local database — other suites' PTs,
// or a leftover `seed:qa` practitioner who also signed up "today". Capture a
// baseline before seeding and assert on the delta rather than an absolute
// total. The cohort has no time filter at all; the funnel windows do, but
// "yesterday" and "the last 7 days" are exactly where a fresh leftover tenant
// lands, so they need the same treatment.
let cohortBaseline: { totalAccounts: number; connectedWithin24h: number };
let funnelBaseline: { yesterday: FunnelWindow; sevenDay: FunnelWindow };

beforeAll(async () => {
  const base = await getAdminMetrics(NOW);
  cohortBaseline = {
    totalAccounts: base.cohort.totalAccounts,
    connectedWithin24h: base.cohort.connectedWithin24h,
  };
  funnelBaseline = {
    yesterday: base.funnelYesterday,
    sevenDay: base.funnel7d,
  };

  // pt_y — full funnel, all inside "yesterday" (06-14).
  accountY = await makeUser('y', at(-1, -2));
  const yPat1 = await newCustomer(accountY.id);
  const yConv1 = await newConversation(accountY.id, yPat1);
  await seedConnection(accountY.id, at(-1, -1));
  await seedMessage({
    accountId: accountY.id,
    conversationId: yConv1,
    role: 'customer',
    createdAt: at(-1),
  });
  await seedAppointment(accountY.id, yPat1, at(0, -23));
  // pt_y "today" (06-15) live-cost data in a second conversation.
  const yPat2 = await newCustomer(accountY.id);
  const yConv2 = await newConversation(accountY.id, yPat2);
  await seedMessage({
    accountId: accountY.id,
    conversationId: yConv2,
    role: 'customer',
    createdAt: at(0, -4),
  });
  await seedMessage({
    accountId: accountY.id,
    conversationId: yConv2,
    role: 'ai',
    createdAt: at(0, -3),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 777,
  });

  // pt_week — inside the 7d window but not "yesterday".
  accountWeek = await makeUser('week', at(-5, -2));
  const wPat = await newCustomer(accountWeek.id);
  const wConv = await newConversation(accountWeek.id, wPat);
  await seedConnection(accountWeek.id, at(-5, -1));
  await seedMessage({
    accountId: accountWeek.id,
    conversationId: wConv,
    role: 'customer',
    createdAt: at(-5),
  });
  await seedAppointment(accountWeek.id, wPat, at(-4, -23));

  // pt_boundary — first message BEFORE all windows (06-01) plus an in-window
  // message (06-14). Must NOT count toward ptsWithFirstMessage.
  const accountBoundary = await makeUser('boundary', at(-14, -2));
  const bPat = await newCustomer(accountBoundary.id);
  const bConv = await newConversation(accountBoundary.id, bPat);
  await seedMessage({
    accountId: accountBoundary.id,
    conversationId: bConv,
    role: 'customer',
    createdAt: at(-14),
  });
  await seedMessage({
    accountId: accountBoundary.id,
    conversationId: bConv,
    role: 'customer',
    createdAt: at(-1),
  });

  // pt_slow — connected >24h after signup (cohort miss), all before the windows.
  const accountSlow = await makeUser('slow', at(-10, -12));
  await seedConnection(accountSlow.id, at(-8, -12));

  // Cost rollup rows + push events.
  await seedCostDaily({ accountId: accountY.id, day: dayKey(-1), ai: 1000, meta: 60_000 });
  await seedCostDaily({
    accountId: accountWeek.id,
    day: dayKey(-5),
    ai: 500,
    meta: 120_000,
  });
  await seedPushEvent({
    accountId: accountY.id,
    occurredAt: at(-1, -2),
    sent: 3,
    removed: 1,
  });
  await seedPushEvent({
    accountId: accountY.id,
    occurredAt: at(-3, -2),
    sent: 2,
    removed: 0,
  });
  await seedPushEvent({
    accountId: accountY.id,
    occurredAt: at(-14, -2), // out of 7d window
    sent: 99,
    removed: 99,
  });
});

afterAll(async () => {
  const sb = createServiceClient();
  for (const account of created) await sb.auth.admin.deleteUser(account.id);
});

describe('getAdminMetrics', () => {
  it('computes the yesterday + 7d funnel windows', async () => {
    const m = await getAdminMetrics(NOW);
    // pt_y contributes the whole funnel inside "yesterday"; pt_week adds a
    // second of each inside the 7d window. pt_boundary's first message predates
    // both windows and pt_slow never connects, so neither may show up here.
    expect(deltaOf(m.funnelYesterday, funnelBaseline.yesterday)).toEqual({
      signups: 1,
      whatsappConnections: 1,
      ptsWithFirstMessage: 1,
      ptsWithFirstBooking: 1,
    });
    expect(deltaOf(m.funnel7d, funnelBaseline.sevenDay)).toEqual({
      signups: 2,
      whatsappConnections: 2,
      ptsWithFirstMessage: 2,
      ptsWithFirstBooking: 2,
    });
  });

  it('computes the 24h onboarding cohort', async () => {
    const m = await getAdminMetrics(NOW);
    // 4 PTs seeded; 2 connected within 24h (pt_y, pt_week).
    expect(m.cohort.totalAccounts - cohortBaseline.totalAccounts).toBe(4);
    expect(m.cohort.connectedWithin24h - cohortBaseline.connectedWithin24h).toBe(
      2,
    );
    // pct is self-consistent with the reported counts.
    expect(m.cohort.pct).toBeCloseTo(
      m.cohort.connectedWithin24h / m.cohort.totalAccounts,
      9,
    );
  });

  it('reports rolled-up yesterday + current-month cost and today live cost', async () => {
    const m = await getAdminMetrics(NOW);

    const yRow = m.cost.yesterday.find((r) => r.accountId === accountY.id);
    expect(yRow).toMatchObject({
      email: accountY.email,
      aiCostMicrousd: 1000,
      metaCostMicroEur: 60_000,
    });
    expect(m.cost.yesterday.some((r) => r.accountId === accountWeek.id)).toBe(false);

    const monthAccountY = m.cost.currentMonth.find((r) => r.accountId === accountY.id);
    const monthAccountWeek = m.cost.currentMonth.find((r) => r.accountId === accountWeek.id);
    expect(monthAccountY?.aiCostMicrousd).toBe(1000);
    expect(monthAccountWeek?.aiCostMicrousd).toBe(500);
    expect(monthAccountWeek?.metaCostMicroEur).toBe(120_000);

    const todayAccountY = m.cost.today.find((r) => r.accountId === accountY.id);
    expect(todayAccountY).toMatchObject({
      aiCostMicrousd: 777,
      metaCostMicroEur: 60_000, // 1 inbound conversation today
    });
  });

  it('aggregates 7d push delivery counts', async () => {
    const m = await getAdminMetrics(NOW);
    expect(m.push).toEqual({ sent: 5, removed: 1, dispatches: 2 });
  });

  it('reports today live cost as estimated when a PT has messages but no status rows', async () => {
    const m = await getAdminMetrics(NOW);
    const todayAccountY = m.cost.today.find((r) => r.accountId === accountY.id);
    expect(todayAccountY).toMatchObject({
      metaCostSource: 'estimated',
      metaBillableMessages: 0,
      metaCostMicroEur: 60_000,
    });
  });
});

// --- Meta cost provenance: actual / estimated / mixed labels (Phase 16 C4) ---
// New PTs are created here (after the funnel/cohort assertions above have run)
// with an out-of-window signup date so they never perturb those counts.
describe('getAdminMetrics — Meta cost provenance (C4)', () => {
  let accountActual: Account;
  let accountMixed: Account;
  let accountTodayActual: Account;
  const OUT_OF_WINDOW = at(-45, -2);

  beforeAll(async () => {
    // All-actual current-month rows → 'actual', billable-message SUM = 4.
    accountActual = await makeUser('actual', OUT_OF_WINDOW);
    await seedCostDaily({
      accountId: accountActual.id,
      day: dayKey(-3),
      ai: 100,
      meta: 42_000,
      metaCostSource: 'actual',
      metaBillableMessages: 3,
    });
    await seedCostDaily({
      accountId: accountActual.id,
      day: dayKey(-2),
      ai: 50,
      meta: 21_000,
      metaCostSource: 'actual',
      metaBillableMessages: 1,
    });

    // One actual + one estimated day in the month → derived 'mixed' label.
    accountMixed = await makeUser('mixed', OUT_OF_WINDOW);
    await seedCostDaily({
      accountId: accountMixed.id,
      day: dayKey(-3),
      ai: 80,
      meta: 21_000,
      metaCostSource: 'actual',
      metaBillableMessages: 1,
    });
    await seedCostDaily({
      accountId: accountMixed.id,
      day: dayKey(-2),
      ai: 20,
      meta: 60_000,
      metaCostSource: 'estimated',
      metaBillableMessages: 0,
    });

    // Status rows today, no messages → today live cost is 'actual' off the union.
    accountTodayActual = await makeUser('today-actual', OUT_OF_WINDOW);
    await seedStatus({
      accountId: accountTodayActual.id,
      sentAt: at(0, -4),
      billable: true,
      pricingCategory: 'utility',
    });
    await seedStatus({
      accountId: accountTodayActual.id,
      sentAt: at(0, -3),
      billable: true,
      pricingCategory: 'utility',
    });
    await seedStatus({
      accountId: accountTodayActual.id,
      sentAt: at(0, -2),
      billable: true,
      pricingCategory: 'service', // billable but €0 rate
    });
  });

  it('labels an all-actual month row "actual" and sums billable messages', async () => {
    const m = await getAdminMetrics(NOW);
    const row = m.cost.currentMonth.find((r) => r.accountId === accountActual.id);
    expect(row).toMatchObject({
      metaCostSource: 'actual',
      metaBillableMessages: 4,
      metaCostMicroEur: 63_000,
      aiCostMicrousd: 150,
    });
  });

  it('labels a month spanning actual + estimated days "mixed"', async () => {
    const m = await getAdminMetrics(NOW);
    const row = m.cost.currentMonth.find((r) => r.accountId === accountMixed.id);
    expect(row).toMatchObject({
      metaCostSource: 'mixed',
      metaBillableMessages: 1,
      metaCostMicroEur: 81_000,
    });
  });

  it('prices today live cost from status rows as "actual" even with no messages', async () => {
    const m = await getAdminMetrics(NOW);
    const row = m.cost.today.find((r) => r.accountId === accountTodayActual.id);
    expect(row).toMatchObject({
      metaCostSource: 'actual',
      metaBillableMessages: 3, // 2 utility + 1 service billable
      metaCostMicroEur: 42_000, // 2 × 21_000 + 1 × 0
      aiCostMicrousd: 0,
    });
  });
});

// --- Monetization success metrics (Phase 16 C7) ---------------------------
// Every metric is asserted as a DELTA against a baseline captured before this
// block seeds, so other suites' rows (and the concurrent C6 agent sharing this
// local Postgres) coexist. NOW sits mid-month on the real calendar, so "current
// month" here is the real current month: the delta assertions are what keep
// other suites' `now()`-stamped rows from mattering.
describe('getBillingMetrics (C7)', () => {
  const SIGNUP = at(-45, -2);
  let baseline: Awaited<ReturnType<typeof getBillingMetrics>>;
  let accountDowngrade: Account;

  beforeAll(async () => {
    baseline = await getBillingMetrics(NOW);

    // Plan distribution + Free-COGS source PT (effective free).
    const accountFree = await makeUser('bill-free', SIGNUP);
    await seedCostDaily({
      accountId: accountFree.id,
      day: dayKey(-5),
      ai: 1000,
      meta: 42_000,
      metaCostSource: 'actual',
      metaBillableMessages: 3,
    });
    await seedCostDaily({
      accountId: accountFree.id,
      day: dayKey(-4),
      ai: 500,
      meta: 60_000,
      metaCostSource: 'estimated',
      metaBillableMessages: 0,
    });

    // Effective solo (active expiry) + the this-month converter. Its cost_daily
    // must be EXCLUDED from Free-COGS (asserted by the exact µUSD/µEUR deltas).
    const accountSoloActive = await makeUser('bill-solo', SIGNUP);
    await setPlan(accountSoloActive.id, {
      plan: 'solo',
      planExpiresAt: at(29, 12),
    });
    await seedOrder({
      accountId: accountSoloActive.id,
      status: 'paid',
      createdAt: at(-14, -3),
      paidAt: at(-9, -3),
      newExpiresAt: at(20, 12), // future → not a renewal boundary
    });
    await seedCostDaily({
      accountId: accountSoloActive.id,
      day: dayKey(-5),
      ai: 9999,
      meta: 99_999,
      metaCostSource: 'actual',
      metaBillableMessages: 5,
    });

    // Lapsed solo (past expiry + grace) → effective free.
    const accountSoloLapsed = await makeUser('bill-lapsed', SIGNUP);
    await setPlan(accountSoloLapsed.id, {
      plan: 'solo',
      planExpiresAt: at(-14, -12),
    });

    // Lifetime pilot → its own bucket, excluded from conversion.
    const accountLifetime = await makeUser('bill-lifetime', SIGNUP);
    await setPlan(accountLifetime.id, { planLifetime: true });

    // Renewal chain: R1 comes due (June 5) and is renewed by R2 (paid within grace).
    const accountRenewer = await makeUser('bill-renewer', SIGNUP);
    await seedOrder({
      accountId: accountRenewer.id,
      status: 'paid',
      createdAt: at(-45, -3),
      paidAt: at(-41, -3),
      newExpiresAt: at(-10, -12),
    });
    await seedOrder({
      accountId: accountRenewer.id,
      status: 'paid',
      createdAt: at(-14, -3),
      paidAt: at(-11, -3), // <= 06-05 + 3d grace
      previousExpiresAt: at(-10, -12),
      newExpiresAt: at(19, 12),
    });

    // Non-renewer: a single due boundary (June 10) with no follow-on paid order.
    const accountNonRenewer = await makeUser('bill-nonrenewer', SIGNUP);
    await seedOrder({
      accountId: accountNonRenewer.id,
      status: 'paid',
      createdAt: at(-45, -3),
      paidAt: at(-36, -3),
      newExpiresAt: at(-5, -12),
    });

    // Cap hits (by kind) + the active-PT denominator (conversation_days).
    const accountCapConv = await makeUser('bill-capconv', SIGNUP);
    await seedConvDay({
      accountId: accountCapConv.id,
      localDay: dayKey(-5),
      monthKey: MONTH_KEY,
    });
    await seedBillingEvent({
      accountId: accountCapConv.id,
      type: 'billing.limit_reached',
      payload: {
        accountId: accountCapConv.id,
        kind: 'conversations',
        used: 30,
        limit: 30,
        monthKey: MONTH_KEY,
      },
      occurredAt: at(-5),
    });

    const accountCapRem = await makeUser('bill-caprem', SIGNUP);
    await seedConvDay({
      accountId: accountCapRem.id,
      localDay: dayKey(-5),
      monthKey: MONTH_KEY,
    });
    await seedBillingEvent({
      accountId: accountCapRem.id,
      type: 'billing.limit_reached',
      payload: {
        accountId: accountCapRem.id,
        kind: 'reminders',
        used: 10,
        limit: 10,
        monthKey: MONTH_KEY,
      },
      occurredAt: at(-5),
    });

    // Active this month but never capped — denominator only.
    const accountActiveOnly = await makeUser('bill-active', SIGNUP);
    await seedConvDay({
      accountId: accountActiveOnly.id,
      localDay: dayKey(-4),
      monthKey: MONTH_KEY,
    });

    // Downgrades: one this month, one previous month (read by string type;
    // `billing.downgraded` is a C6 event that this worktree does not emit).
    accountDowngrade = await makeUser('bill-downgrade', SIGNUP);
    await seedBillingEvent({
      accountId: accountDowngrade.id,
      type: 'billing.downgraded',
      payload: { accountId: accountDowngrade.id },
      occurredAt: at(-3),
    });
    await seedBillingEvent({
      accountId: accountDowngrade.id,
      type: 'billing.downgraded',
      payload: { accountId: accountDowngrade.id },
      occurredAt: at(-34),
    });
  });

  it('buckets PTs by effective plan (lapsed solo → free, lifetime its own bucket)', async () => {
    const m = await getBillingMetrics(NOW);
    const d = m.planDistribution;
    const b = baseline.planDistribution;
    expect(d.free - b.free).toBe(8);
    expect(d.solo - b.solo).toBe(1);
    expect(d.lifetime - b.lifetime).toBe(1);
    expect(d.total - b.total).toBe(10);
  });

  it('computes all-time conversion (lifetime excluded) + this-month first payments', async () => {
    const m = await getBillingMetrics(NOW);
    const c = m.conversion;
    const b = baseline.conversion;
    expect(c.eligibleAccounts - b.eligibleAccounts).toBe(9);
    expect(c.paidAccounts - b.paidAccounts).toBe(3);
    expect(c.newThisMonth - b.newThisMonth).toBe(1);
    expect(c.rate).toBeCloseTo(c.paidAccounts / c.eligibleAccounts, 9);
    expect(c.avgDaysToUpgrade).not.toBeNull();
    expect(c.avgDaysToUpgrade ?? -1).toBeGreaterThanOrEqual(0);
    expect(c.medianDaysToUpgrade).not.toBeNull();
  });

  it('computes ledger-only renewal (renewed chain vs non-renewed due boundary)', async () => {
    const m = await getBillingMetrics(NOW);
    const r = m.renewal;
    const b = baseline.renewal;
    expect(r.dueAllTime - b.dueAllTime).toBe(2);
    expect(r.renewedAllTime - b.renewedAllTime).toBe(1);
    expect(r.due90d - b.due90d).toBe(2);
    expect(r.renewed90d - b.renewed90d).toBe(1);
  });

  it('counts billing.downgraded events this + previous month', async () => {
    const m = await getBillingMetrics(NOW);
    const dg = m.downgrades;
    const b = baseline.downgrades;
    expect(dg.thisMonth - b.thisMonth).toBe(1);
    expect(dg.prevMonth - b.prevMonth).toBe(1);
    expect(dg.distinctAccountsThisMonth - b.distinctAccountsThisMonth).toBe(1);
  });

  it('computes cap-hits per kind over the active-PT denominator', async () => {
    const m = await getBillingMetrics(NOW);
    const b = baseline.capHits;
    expect(m.capHits.conversations.accounts - b.conversations.accounts).toBe(1);
    expect(m.capHits.reminders.accounts - b.reminders.accounts).toBe(1);
    expect(m.capHits.conversations.activeAccounts - b.conversations.activeAccounts).toBe(3);
    expect(m.capHits.reminders.activeAccounts - b.reminders.activeAccounts).toBe(3);
  });

  it('aggregates Free-tier COGS only for effective-free PTs, µUSD/µEUR separate', async () => {
    const m = await getBillingMetrics(NOW);
    const f = m.freeCogs;
    const b = baseline.freeCogs;
    // Only accountFree (effective free) contributes; accountSoloActive's cost is excluded.
    expect(f.freeAccountCount - b.freeAccountCount).toBe(1);
    expect(f.aiCostMicrousd - b.aiCostMicrousd).toBe(1500); // µUSD
    expect(f.metaCostMicroEur - b.metaCostMicroEur).toBe(102_000); // µEUR
    expect(f.metaBillableMessages - b.metaBillableMessages).toBe(3);
    expect(f.actualAccountDays - b.actualAccountDays).toBe(1);
    expect(f.estimatedAccountDays - b.estimatedAccountDays).toBe(1);
  });

  it('lists current-month payments joined to the PT email', async () => {
    const m = await getBillingMetrics(NOW);
    // accountSoloActive's order was created 14 days before NOW — same month.
    const soloRow = m.recentPayments.find(
      (p) => p.status === 'paid' && p.amountMinor === 250000 && p.currency === 'ALL',
    );
    expect(soloRow).toBeTruthy();
    // Downgrade PT never bought anything → absent from the payments list.
    expect(m.recentPayments.some((p) => p.accountId === accountDowngrade.id)).toBe(false);
  });
});
