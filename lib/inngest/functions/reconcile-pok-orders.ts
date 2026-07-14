import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingOrders } from '@/lib/db/schema';
import { applyOrderOutcome } from '@/lib/billing/payments';
import { inngest } from '../client';

/**
 * Hourly reconcile of open POK orders (Phase 16 C5). This is what makes the
 * payment flow survive a missed, delayed, or entirely nonexistent webhook: POK's
 * webhook contract is undocumented, so we never depend on it. Every still-'created'
 * order is re-driven through the same idempotent applyOrderOutcome settle.
 *
 * Per order, by age:
 *  - >= 24h old  → mark 'expired' (guarded on status='created'); POK checkout links
 *    are short-lived, so an order untouched this long will never complete.
 *  - >= 10min old → applyOrderOutcome (re-fetch + settle if paid); the 10-minute
 *    floor gives the inline webhook/redirect path first crack before we poll.
 *  - < 10min old  → skip; too fresh, let the trigger path handle it.
 */

const TEN_MIN_MS = 10 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

export type OpenOrder = { id: string; pokOrderId: string; createdAt: Date | string };
export type ReconcileResult = {
  scanned: number;
  expired: number;
  reconciled: number;
  skipped: number;
};

/** All orders still awaiting settlement (owner connection; RLS-bypassing). */
export async function loadOpenOrders(): Promise<OpenOrder[]> {
  return db
    .select({
      id: billingOrders.id,
      pokOrderId: billingOrders.pokOrderId,
      createdAt: billingOrders.createdAt,
    })
    .from(billingOrders)
    .where(eq(billingOrders.status, 'created'));
}

export async function reconcileOneOrder(
  order: OpenOrder,
  now: Date,
): Promise<'expired' | 'reconciled' | 'skipped'> {
  const createdAtMs =
    order.createdAt instanceof Date
      ? order.createdAt.getTime()
      : new Date(order.createdAt).getTime();
  const ageMs = now.getTime() - createdAtMs;

  if (ageMs >= TWENTY_FOUR_H_MS) {
    const expired = await db
      .update(billingOrders)
      .set({ status: 'expired' })
      .where(
        and(eq(billingOrders.id, order.id), eq(billingOrders.status, 'created')),
      )
      .returning({ id: billingOrders.id });
    return expired.length > 0 ? 'expired' : 'skipped';
  }

  if (ageMs >= TEN_MIN_MS) {
    await applyOrderOutcome(order.pokOrderId);
    return 'reconciled';
  }

  return 'skipped';
}

/** Testable core: scan all open orders and apply the age-based transition. */
export async function reconcilePokOrdersCore(
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const orders = await loadOpenOrders();
  const result: ReconcileResult = {
    scanned: orders.length,
    expired: 0,
    reconciled: 0,
    skipped: 0,
  };
  for (const order of orders) {
    const outcome = await reconcileOneOrder(order, now);
    result[outcome] += 1;
  }
  return result;
}

export const reconcilePokOrders = inngest.createFunction(
  { id: 'reconcile-pok-orders', retries: 2, concurrency: 1 },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const orders = await step.run('load-open-orders', () => loadOpenOrders());
    const now = new Date();
    const result: ReconcileResult = {
      scanned: orders.length,
      expired: 0,
      reconciled: 0,
      skipped: 0,
    };
    for (const order of orders) {
      const outcome = await step.run(`reconcile-${order.id}`, () =>
        reconcileOneOrder(order, now),
      );
      result[outcome] += 1;
    }
    return result;
  },
);
