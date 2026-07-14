import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { billingOrders, pts } from '@/lib/db/schema';
import { getBillingSnapshot } from '@/lib/billing/read-model';
import { createServiceClient } from '@/lib/supabase/service';

const DAY = 86_400_000;
const NOW = new Date('2026-06-20T12:00:00.000Z');
let ptId = '';
let seq = 0;

async function seedOrder(args: {
  period: 'monthly' | 'yearly';
  status: 'created' | 'paid' | 'failed';
  ageDays: number;
}) {
  seq += 1;
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId: `pok-rm-${Date.now()}-${seq}`,
    plan: 'solo',
    period: args.period,
    amountMinor: args.period === 'yearly' ? 2_500_000 : 250_000,
    currency: 'ALL',
    status: args.status,
    createdAt: new Date(NOW.getTime() - args.ageDays * DAY),
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

  it('lists settled receipts newest-first with whole-ALL amounts, excluding created orders', async () => {
    await seedOrder({ period: 'monthly', status: 'paid', ageDays: 40 });
    await seedOrder({ period: 'yearly', status: 'failed', ageDays: 10 });
    await seedOrder({ period: 'monthly', status: 'created', ageDays: 1 });

    const snap = await getBillingSnapshot(ptId, NOW);
    expect(snap.receipts).toHaveLength(2); // the 'created' order is not a receipt
    // Newest first: the failed yearly precedes the paid monthly.
    expect(snap.receipts[0]).toMatchObject({
      period: 'yearly',
      status: 'failed',
      amountAll: 25000,
    });
    expect(snap.receipts[1]).toMatchObject({
      period: 'monthly',
      status: 'paid',
      amountAll: 2500,
    });
  });
});
