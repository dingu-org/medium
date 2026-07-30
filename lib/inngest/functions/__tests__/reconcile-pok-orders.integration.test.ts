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

/** Bulk-seed `count` open orders of the same age (one statement). */
async function seedOrders(
  count: number,
  ageMs: number,
  now: Date,
): Promise<string[]> {
  const ids = Array.from({ length: count }, () => {
    seq += 1;
    return `pok-recon-${Date.now()}-${seq}`;
  });
  await db.insert(billingOrders).values(
    ids.map((pokOrderId, index) => ({
      ptId,
      pokOrderId,
      plan: 'solo' as const,
      period: 'monthly' as const,
      amountMinor: 250000,
      currency: 'ALL',
      status: 'created' as const,
      // Distinct timestamps so oldest-first ordering is deterministic.
      createdAt: new Date(now.getTime() - ageMs - index * 1000),
    })),
  );
  return ids;
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
  it('keeps re-polling an order POK answers with 404 while it is in budget', async () => {
    const now = new Date();
    const missing = await seedOrder(25 * HOUR, now);
    const paid = await seedOrder(30 * MIN, now);
    const { PokNotFoundError } = await import('@/lib/billing/pok/client');
    mockGetOrder.mockImplementation(async (id: string) => {
      if (id === missing) throw new PokNotFoundError('not found');
      return { id, isCaptured: true, amount: 250000 };
    });

    const result = await reconcilePokOrdersCore(now);

    // 'expired' is terminal for every settle path, so a 404 — which tells us
    // nothing about whether POK captured the payment — must leave the order
    // open for the next hourly poll instead of writing off the money. It is
    // counted apart from `reconciled`, which claimed the order had been dealt
    // with while it silently sat in the scan window forever.
    expect(result.expired).toBe(0);
    expect(result.notFound).toBe(1);
    expect(result.reconciled).toBe(1);
    expect(await statusOf(missing)).toBe('created');
    expect(await statusOf(paid)).toBe('paid');
  });

  it('gives up on an order POK has not known for the whole budget', async () => {
    const now = new Date();
    const abandoned = await seedOrder(8 * 24 * HOUR, now);
    const { PokNotFoundError } = await import('@/lib/billing/pok/client');
    mockGetOrder.mockRejectedValue(new PokNotFoundError('not found'));

    const result = await reconcilePokOrdersCore(now);

    // A week of hourly 404s is a dead order, not a transient inconsistency:
    // leaving it 'created' hides it from every counter AND (oldest-first) parks
    // it at the head of the capped scan for the rest of time.
    expect(result.expired).toBe(1);
    expect(result.notFound).toBe(0);
    expect(await statusOf(abandoned)).toBe('expired');
  });

  it('still polls fresh orders behind a full window of permanently stuck ones', async () => {
    const now = new Date();
    // More stuck orders than the scan can hold, all older than the fresh one.
    const stuck = await seedOrders(200, 30 * HOUR, now);
    const stuckIds = new Set(stuck);
    const fresh = await seedOrder(30 * MIN, now);
    const { PokNotFoundError } = await import('@/lib/billing/pok/client');
    mockGetOrder.mockImplementation(async (id: string) => {
      if (stuckIds.has(id)) throw new PokNotFoundError('not found');
      return { id, isCaptured: true, amount: 250000 };
    });

    const result = await reconcilePokOrdersCore(now);

    // Oldest-first alone let the stuck wall fill the whole window every hour,
    // so genuinely captured payments never settled again.
    expect(result.reconciled).toBe(1);
    expect(await statusOf(fresh)).toBe('paid');
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
      notFound: 0,
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
      notFound: 0,
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
      notFound: 0,
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
      'POK reconcile failed for all 2 polled orders',
    );
  });

  it('fails the run when every polled order 404s (wrong merchant/environment)', async () => {
    const now = new Date();
    await seedOrder(30 * MIN, now);
    await seedOrder(2 * HOUR, now);
    const { PokNotFoundError } = await import('@/lib/billing/pok/client');
    mockGetOrder.mockRejectedValue(new PokNotFoundError('not found'));

    await expect(reconcilePokOrdersCore(now)).rejects.toThrow(
      'POK reconcile failed for all 2 polled orders',
    );
  });

  it('does not raise the outage alarm on a run whose only poll failed', async () => {
    // One order failing every hour is a per-order problem (logged per order); a
    // latched run-level alarm on a single-order open set is just noise.
    const now = new Date();
    await seedOrder(30 * MIN, now);
    mockGetOrder.mockRejectedValue(new Error('pok 503'));

    await expect(reconcilePokOrdersCore(now)).resolves.toMatchObject({
      scanned: 1,
      failed: 1,
    });
  });

  it('still raises the outage alarm when a fresh unpolled order is in the scan', async () => {
    // The fresh order is never polled, so it is no evidence that settlement
    // works — counting it as progress muted the alarm during a real outage.
    const now = new Date();
    await seedOrder(2 * MIN, now);
    await seedOrder(30 * MIN, now);
    await seedOrder(2 * HOUR, now);
    mockGetOrder.mockRejectedValue(new Error('pok 503'));

    await expect(reconcilePokOrdersCore(now)).rejects.toThrow(
      'POK reconcile failed for all 2 polled orders',
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
      notFound: 0,
    });
    expect(mockGetOrder).not.toHaveBeenCalled();
  });
});
