import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { billingOrders, pts } from '@/lib/db/schema';
import { getBillingSnapshot } from '@/lib/billing/read-model';
import { createServiceClient } from '@/lib/supabase/service';
import { testNowUtc } from '@/tests/support/clock';

const DAY = 86_400_000;
// Derived: `seedOrder` places every order at an age in days behind NOW, so a
// written-down date bought nothing and drifted from the DB's own clock forever.
const NOW = testNowUtc();
let ptId = '';
let seq = 0;

async function seedOrder(args: {
  period: 'monthly' | 'yearly';
  status: 'created' | 'paid' | 'failed' | 'expired';
  ageDays: number;
  /** Whole ALL actually charged (ALL_MINOR_FACTOR = 1). */
  amountMinor?: number;
}) {
  seq += 1;
  const createdAt = new Date(NOW.getTime() - args.ageDays * DAY);
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId: `pok-rm-${Date.now()}-${seq}`,
    plan: 'solo',
    period: args.period,
    amountMinor: args.amountMinor ?? (args.period === 'yearly' ? 25_000 : 2_500),
    currency: 'ALL',
    status: args.status,
    createdAt,
    paidAt: args.status === 'paid' ? createdAt : null,
  });
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `billing-readmodel-${Date.now()}@example.com`,
    password: 'billing-rm-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  await db.delete(billingOrders).where(eq(billingOrders.ptId, ptId));
  await db
    .update(pts)
    .set({
      plan: 'free',
      planLifetime: false,
      planExpiresAt: null,
      planDowngradedAt: null,
      timezone: 'Europe/Tirane',
    })
    .where(eq(pts.id, ptId));
});

describe('getBillingSnapshot', () => {
  it('reports an active Solo plan with days-to-expiry and VAT-inclusive price', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: new Date(NOW.getTime() + 20 * DAY) })
      .where(eq(pts.id, ptId));

    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.plan).toBe('solo');
    expect(snap.state).toBe('active');
    expect(snap.daysLeft).toBe(20);
    expect(snap.price).toEqual({ monthly: 2500, yearly: 25000 });
    expect(snap.conversations.limit).toBe(400);
    expect(snap.reminders.limit).toBe(250);
  });

  it('reports the grace state with days left to renew', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: new Date(NOW.getTime() - 1 * DAY) })
      .where(eq(pts.id, ptId));

    const snap = await getBillingSnapshot(ptId, NOW);
    // Past expiry but inside the 3-day grace → still effectively Solo.
    expect(snap.plan).toBe('solo');
    expect(snap.state).toBe('grace');
    expect(snap.daysLeft).toBe(2);
  });

  it('reports lifetime pilots as a lifetime plan', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(pts.id, ptId));

    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.state).toBe('lifetime');
    expect(snap.planLifetime).toBe(true);
  });

  it('reports Free with the Free limits', async () => {
    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.plan).toBe('free');
    expect(snap.state).toBe('free');
    expect(snap.conversations.limit).toBe(30);
    expect(snap.reminders.limit).toBe(10);
  });

  it('derives currentPeriod from the most recent PAID order, ignoring failed ones', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: new Date(NOW.getTime() + 20 * DAY) })
      .where(eq(pts.id, ptId));
    await seedOrder({ period: 'monthly', status: 'paid', ageDays: 40 });
    await seedOrder({ period: 'yearly', status: 'paid', ageDays: 5 });
    await seedOrder({ period: 'monthly', status: 'failed', ageDays: 1 });

    const snap = await getBillingSnapshot(ptId, NOW);
    // Most recent PAID order is the yearly one; the newer failed order is ignored.
    expect(snap.currentPeriod).toBe('yearly');
  });

  it('reports currentPeriod null when the PT has no orders', async () => {
    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.currentPeriod).toBeNull();
  });

  it('lists paid/failed receipts newest-first with the amount actually charged', async () => {
    // Deliberately NOT today's list price (2500 / 25000) — a receipt must echo
    // what the PT paid, not what Solo costs now.
    await seedOrder({
      period: 'monthly',
      status: 'paid',
      ageDays: 40,
      amountMinor: 2_000,
    });
    await seedOrder({
      period: 'yearly',
      status: 'failed',
      ageDays: 10,
      amountMinor: 20_000,
    });
    await seedOrder({ period: 'monthly', status: 'created', ageDays: 1 });
    // Abandoned checkout the cron expired — never a payment attempt.
    await seedOrder({ period: 'yearly', status: 'expired', ageDays: 2 });

    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.receipts).toHaveLength(2);
    // Newest first: the failed yearly precedes the paid monthly.
    expect(snap.receipts[0]).toMatchObject({
      period: 'yearly',
      status: 'failed',
      amountAll: 20_000,
    });
    expect(snap.receipts[1]).toMatchObject({
      period: 'monthly',
      status: 'paid',
      amountAll: 2_000,
    });
    // Historical amounts are independent of the live plan price.
    expect(snap.price).toEqual({ monthly: 2500, yearly: 25000 });
  });

  it('resolves currentPeriod from the paid order even behind a full page of failures', async () => {
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: new Date(NOW.getTime() + 200 * DAY) })
      .where(eq(pts.id, ptId));
    await seedOrder({ period: 'yearly', status: 'paid', ageDays: 100 });
    for (let i = 0; i < 51; i += 1) {
      await seedOrder({ period: 'monthly', status: 'failed', ageDays: 50 - i / 100 });
    }

    const snap = await getBillingSnapshot(ptId, NOW);
    // The paid order fell out of the 50-row receipt window …
    expect(snap.receipts).toHaveLength(50);
    expect(snap.receipts.every((r) => r.status === 'failed')).toBe(true);
    // … but currentPeriod (and therefore the renew/upsell slot) still holds.
    expect(snap.currentPeriod).toBe('yearly');
  });
});
