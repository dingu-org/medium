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
  it('applies the age-based transition for each open order', async () => {
    const now = new Date();
    const fresh = await seedOrder(5 * MIN, now); // < 10min → skipped
    const paid = await seedOrder(30 * MIN, now); // >= 10min → settle (CAPTURED)
    const stillPending = await seedOrder(30 * MIN, now); // >= 10min → settle (PENDING)
    const stale = await seedOrder(25 * HOUR, now); // >= 24h → expired

    mockGetOrder.mockImplementation(async (id: string) => {
      if (id === paid) return { id, isCaptured: true, amount: 250000 };
      if (id === stillPending) return { id, isCaptured: false };
      throw new Error(`unexpected getOrder for ${id}`);
    });

    const result = await reconcilePokOrdersCore(now);

    expect(result).toEqual({
      scanned: 4,
      expired: 1,
      reconciled: 2,
      skipped: 1,
    });

    expect(await statusOf(fresh)).toBe('created');
    expect(await statusOf(paid)).toBe('paid');
    expect(await statusOf(stillPending)).toBe('created');
    expect(await statusOf(stale)).toBe('expired');

    // The captured order flipped the PT to solo; the stale/fresh ones did not
    // trigger a POK fetch.
    const [pt] = await db
      .select({ plan: pts.plan })
      .from(pts)
      .where(eq(pts.id, ptId));
    expect(pt.plan).toBe('solo');
    expect(mockGetOrder).toHaveBeenCalledTimes(2);
  });
});
