import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

// Mock the POK network client so getOrder returns a per-order outcome; the
// age-based reconcile transitions are the real code under test. POK has no
// string status — it exposes boolean flags (isCaptured/isCanceled/isRefunded),
// so the mock must speak that shape or classifyPokStatus reads every order as
// pending.
const { mockGetOrder, mockCreateOrder, mockCaptureOrder, mockLogin } = vi.hoisted(
  () => ({
    mockGetOrder: vi.fn(),
    mockCreateOrder: vi.fn(),
    mockCaptureOrder: vi.fn(),
    mockLogin: vi.fn(),
  }),
);

vi.mock('@/lib/billing/pok/client', () => ({
  createPokClient: () => ({
    login: mockLogin,
    createOrder: mockCreateOrder,
    getOrder: mockGetOrder,
    captureOrder: mockCaptureOrder,
  }),
  PokError: class PokError extends Error {},
  PokAuthError: class PokAuthError extends Error {},
  PokNotFoundError: class PokNotFoundError extends Error {},
}));

import { db } from '@/lib/db';
import { billingOrders, eventOutbox, events, pts } from '@/lib/db/schema';
import { reconcilePokOrdersCore } from '@/lib/inngest/functions/reconcile-pok-orders';
import { createServiceClient } from '@/lib/supabase/service';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

let ptId = '';
let seq = 0;

async function seedOrder(ageMs: number, now: Date): Promise<string> {
  seq += 1;
  const pokOrderId = `pok-recon-${Date.now()}-${seq}`;
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId,
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250000,
    currency: 'ALL',
    status: 'created',
    createdAt: new Date(now.getTime() - ageMs),
  });
  return pokOrderId;
}

async function statusOf(pokOrderId: string): Promise<string> {
  const [order] = await db
    .select({ status: billingOrders.status })
    .from(billingOrders)
    .where(eq(billingOrders.pokOrderId, pokOrderId));
  return order.status;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `reconcile-${Date.now()}@example.com`,
    password: 'reconcile-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  mockGetOrder.mockReset();
  // Global scan: wipe the ledger so only this test's rows are visible.
  await db.delete(billingOrders);
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db
    .update(pts)
    .set({ plan: 'free', planExpiresAt: null, planLifetime: false })
    .where(eq(pts.id, ptId));
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('reconcilePokOrdersCore', () => {
  it('never expires an order POK answers with 404, however old it is', async () => {
    const now = new Date();
    const missing = await seedOrder(25 * HOUR, now);
    const { PokNotFoundError } = await import('@/lib/billing/pok/client');
    mockGetOrder.mockRejectedValue(new PokNotFoundError('not found'));

    const result = await reconcilePokOrdersCore(now);

    // 'expired' is terminal for every settle path, so a 404 — which tells us
    // nothing about whether POK captured the payment — must leave the order
    // open for the next hourly poll instead of writing off the money.
    expect(result.expired).toBe(0);
    expect(await statusOf(missing)).toBe('created');
  });

  it('applies the age-based transition for each open order', async () => {
    const now = new Date();
    const fresh = await seedOrder(5 * MIN, now); // < 10min → skipped
    const paid = await seedOrder(30 * MIN, now); // >= 10min → settle (CAPTURED)
    const stillPending = await seedOrder(30 * MIN, now); // >= 10min → settle (PENDING)
    const stale = await seedOrder(25 * HOUR, now); // >= 24h → expired

    mockGetOrder.mockImplementation(async (id: string) => {
      if (id === paid) return { id, isCaptured: true, amount: 250000 };
      if (id === stillPending) return { id, isCaptured: false };
      if (id === stale) return { id, isCaptured: false };
      throw new Error(`unexpected getOrder for ${id}`);
    });

    const result = await reconcilePokOrdersCore(now);

    expect(result).toEqual({
      scanned: 4,
      expired: 1,
      reconciled: 2,
      skipped: 1,
      failed: 0,
    });

    expect(await statusOf(fresh)).toBe('created');
    expect(await statusOf(paid)).toBe('paid');
    expect(await statusOf(stillPending)).toBe('created');
    expect(await statusOf(stale)).toBe('expired');

    // The captured order flipped the PT to solo; only the too-fresh order
    // skipped the POK fetch — expiry is never decided on age alone.
    const [pt] = await db
      .select({ plan: pts.plan })
      .from(pts)
      .where(eq(pts.id, ptId));
    expect(pt.plan).toBe('solo');
    expect(mockGetOrder).toHaveBeenCalledTimes(3);
  });

  it('settles an over-age order POK captured late instead of expiring it', async () => {
    const now = new Date();
    const lateCapture = await seedOrder(25 * HOUR, now);
    mockGetOrder.mockResolvedValue({
      id: lateCapture,
      isCaptured: true,
      amount: 250000,
    });

    const result = await reconcilePokOrdersCore(now);

    expect(result).toEqual({
      scanned: 1,
      expired: 0,
      reconciled: 1,
      skipped: 0,
      failed: 0,
    });
    expect(await statusOf(lateCapture)).toBe('paid');

    const [pt] = await db
      .select({ plan: pts.plan, planExpiresAt: pts.planExpiresAt })
      .from(pts)
      .where(eq(pts.id, ptId));
    expect(pt.plan).toBe('solo');
    expect(pt.planExpiresAt).not.toBeNull();

    const paymentEvents = await db
      .select({ type: events.type })
      .from(events)
      .where(eq(events.ptId, ptId));
    expect(paymentEvents.map((e) => e.type)).toEqual(['billing.payment_received']);
  });

  it('does not expire or abort the scan when the POK poll throws', async () => {
    const now = new Date();
    const broken = await seedOrder(25 * HOUR, now);
    const paid = await seedOrder(30 * MIN, now);

    mockGetOrder.mockImplementation(async (id: string) => {
      if (id === broken) throw new Error('pok 503');
      return { id, isCaptured: true, amount: 250000 };
    });

    const result = await reconcilePokOrdersCore(now);

    expect(result).toEqual({
      scanned: 2,
      expired: 0,
      reconciled: 1,
      skipped: 0,
      failed: 1,
    });
    // The throwing order keeps its non-terminal status and is retried next hour.
    expect(await statusOf(broken)).toBe('created');
    expect(await statusOf(paid)).toBe('paid');
  });

  it('fails the run when every polled order fails, instead of reporting success', async () => {
    // A rotated POK secret / missing POK_* var / DB blip makes applyOrderOutcome
    // throw for every order. Pre-fix that returned {reconciled:0, skipped:N} as a
    // SUCCESS, so retries never fired and settlement stopped silently.
    const now = new Date();
    await seedOrder(30 * MIN, now);
    await seedOrder(25 * HOUR, now);
    mockGetOrder.mockRejectedValue(new Error('POK_MERCHANT_ID is required'));

    await expect(reconcilePokOrdersCore(now)).rejects.toThrow(
      'POK reconcile failed for all 2 open orders',
    );
  });

  it('does not fail the run when the only orders are too fresh to poll', async () => {
    const now = new Date();
    await seedOrder(2 * MIN, now);

    await expect(reconcilePokOrdersCore(now)).resolves.toEqual({
      scanned: 1,
      expired: 0,
      reconciled: 0,
      skipped: 1,
      failed: 0,
    });
    expect(mockGetOrder).not.toHaveBeenCalled();
  });
});
