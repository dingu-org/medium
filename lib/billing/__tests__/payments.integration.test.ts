import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

// Mock the POK network client so getOrder returns a controllable status; the
// settle logic (idempotency + extension) is the real code under test. Hoisted so
// the mock is in place before payments.ts resolves createPokClient.
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
import { applyOrderOutcome, type BillingPeriod } from '@/lib/billing/payments';
import { createServiceClient } from '@/lib/supabase/service';

let ptId = '';
let seq = 0;

async function seedCreatedOrder(
  period: BillingPeriod = 'monthly',
): Promise<string> {
  seq += 1;
  const pokOrderId = `pok-${Date.now()}-${seq}`;
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId,
    plan: 'solo',
    period,
    amountMinor: 250000,
    currency: 'ALL',
    status: 'created',
  });
  return pokOrderId;
}

async function countPaymentEvents(): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.ptId, ptId), eq(events.type, 'billing.payment_received')));
  return rows.length;
}

async function planState(): Promise<{ plan: string; expiresAt: Date | null }> {
  const [pt] = await db
    .select({ plan: pts.plan, expiresAt: pts.planExpiresAt })
    .from(pts)
    .where(eq(pts.id, ptId));
  return { plan: pt.plan, expiresAt: pt.expiresAt };
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `payments-${Date.now()}@example.com`,
    password: 'payments-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  mockGetOrder.mockReset();
  mockCreateOrder.mockReset();
  await db.delete(billingOrders).where(eq(billingOrders.ptId, ptId));
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db
    .update(pts)
    .set({
      plan: 'free',
      planExpiresAt: null,
      planLifetime: false,
      planDowngradedAt: null,
    })
    .where(eq(pts.id, ptId));
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('applyOrderOutcome', () => {
  it('is idempotent across two sequential settle calls', async () => {
    const pokOrderId = await seedCreatedOrder('monthly');
    mockGetOrder.mockResolvedValue({
      id: pokOrderId,
      isCaptured: true,
      amount: 2500,
      currencyCode: 'ALL',
    });

    const first = await applyOrderOutcome(pokOrderId);
    const afterFirst = await planState();
    const second = await applyOrderOutcome(pokOrderId);
    const afterSecond = await planState();

    expect(first).toBe('applied');
    expect(second).toBe('already_applied');

    expect(afterFirst.plan).toBe('solo');
    expect(afterFirst.expiresAt).not.toBeNull();
    // Extended exactly once: the second call must not move the expiry.
    expect(afterSecond.expiresAt?.getTime()).toBe(afterFirst.expiresAt?.getTime());

    const [order] = await db
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.pokOrderId, pokOrderId));
    expect(order.status).toBe('paid');
    expect(order.paidAt).not.toBeNull();
    expect(order.newExpiresAt?.getTime()).toBe(afterFirst.expiresAt?.getTime());

    expect(await countPaymentEvents()).toBe(1);
  });

  it('extends only once under two concurrent settle calls', async () => {
    const pokOrderId = await seedCreatedOrder('monthly');
    mockGetOrder.mockResolvedValue({ id: pokOrderId, isCaptured: true });

    const [a, b] = await Promise.all([
      applyOrderOutcome(pokOrderId),
      applyOrderOutcome(pokOrderId),
    ]);

    expect([a, b].sort()).toEqual(['already_applied', 'applied']);
    expect((await planState()).plan).toBe('solo');
    expect(await countPaymentEvents()).toBe(1);

    const [order] = await db
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.pokOrderId, pokOrderId));
    expect(order.status).toBe('paid');
  });

  it('returns "unknown" for an order id POK never issued (no POK call)', async () => {
    const result = await applyOrderOutcome('pok-forged-does-not-exist');
    expect(result).toBe('unknown');
    expect(mockGetOrder).not.toHaveBeenCalled();
  });

  it('leaves the row created and does not credit on a pending status', async () => {
    const pokOrderId = await seedCreatedOrder('monthly');
    mockGetOrder.mockResolvedValue({ id: pokOrderId, isCaptured: false });

    const result = await applyOrderOutcome(pokOrderId);
    expect(result).toBe('pending');
    expect((await planState()).plan).toBe('free');

    const [order] = await db
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.pokOrderId, pokOrderId));
    expect(order.status).toBe('created');
    expect(await countPaymentEvents()).toBe(0);
  });

  it('marks the row failed on a terminal failure status', async () => {
    const pokOrderId = await seedCreatedOrder('monthly');
    mockGetOrder.mockResolvedValue({ id: pokOrderId, isCanceled: true });

    const result = await applyOrderOutcome(pokOrderId);
    expect(result).toBe('failed');
    expect((await planState()).plan).toBe('free');

    const [order] = await db
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.pokOrderId, pokOrderId));
    expect(order.status).toBe('failed');
  });
});
