import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingOrders } from '@/lib/db/schema';
import { applyOrderOutcome, type ApplyOrderResult } from '@/lib/billing/payments';
import { createLogger } from '@/lib/log';
import { inngest } from '../client';

/**
 * Hourly reconcile of open POK orders (Phase 16 C5). This is what makes the
 * payment flow survive a missed, delayed, or entirely nonexistent webhook: POK's
 * webhook contract is undocumented, so we never depend on it. Every still-'created'
 * order is re-driven through the same idempotent applyOrderOutcome settle.
 *
 * Per order, by age:
 *  - < 10min old  → skip; too fresh, let the trigger path handle it.
 *  - >= 10min old → applyOrderOutcome (re-fetch + settle if paid); the 10-minute
 *    floor gives the inline webhook/redirect path first crack before we poll.
 *  - >= 24h old   → same poll FIRST, then mark 'expired' only if POK still reports
 *    pending (guarded on status='created'). 'expired' is terminal for every settle
 *    path (applyOrderOutcome short-circuits on it), so expiring on age alone would
 *    permanently lose a payment POK captured after our last sub-24h poll. A 404
 *    ('not_found') is NOT pending — POK told us nothing, so the order is left
 *    'created' and re-polled rather than terminally expired.
 *
 * A POK failure on one order is logged and counted as `failed` — never expired,
 * and never allowed to abort the remaining orders in the scan. But a run where
 * EVERY polled order failed is an outage, not N benign skips (a rotated POK
 * secret, a missing POK_* var — the client is built lazily now — or a DB blip),
 * so it throws instead of reporting success with reconciled:0.
 */

const TEN_MIN_MS = 10 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

// Cap the per-run fan-out. A failing poll never moves the order off
// status='created', so a persistent POK/env failure grows the open set without
// bound; oldest-first ordering means a capped scan still makes progress on the
// orders nearest the 24h decision.
const SCAN_LIMIT = 200;

export type OpenOrder = { id: string; pokOrderId: string; createdAt: Date | string };
export type ReconcileOutcome = 'expired' | 'reconciled' | 'skipped' | 'failed';
export type ReconcileResult = {
  scanned: number;
  expired: number;
  reconciled: number;
  skipped: number;
  failed: number;
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
    .where(eq(billingOrders.status, 'created'))
    // Oldest first: a deterministic order means a partial scan always makes
    // progress on the orders closest to the 24h decision.
    .orderBy(billingOrders.createdAt)
    .limit(SCAN_LIMIT);
}

export async function reconcileOneOrder(
  order: OpenOrder,
  now: Date,
): Promise<ReconcileOutcome> {
  const createdAtMs =
    order.createdAt instanceof Date
      ? order.createdAt.getTime()
      : new Date(order.createdAt).getTime();
  const ageMs = now.getTime() - createdAtMs;
  const log = createLogger();

  if (ageMs < TEN_MIN_MS) return 'skipped';

  // Always ask POK before deciding anything — including for an over-age order.
  let outcome: ApplyOrderResult;
  try {
    outcome = await applyOrderOutcome(order.pokOrderId);
  } catch (error) {
    // Contained: this order keeps status='created' and gets another chance next
    // hour; the rest of the scan continues. Counted as 'failed', not 'skipped',
    // so the caller can tell "nothing to do" apart from "settlement is broken" —
    // and the message goes in the log, because `errorName` alone is just 'Error'.
    log.warn('pok.reconcile_poll_failed', 'POK poll failed during reconcile', {
      order_id: order.pokOrderId,
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return 'failed';
  }

  // Only an order POK still reports as awaiting payment may be expired.
  if (ageMs < TWENTY_FOUR_H_MS || outcome !== 'pending') return 'reconciled';

  const expired = await db
    .update(billingOrders)
    .set({ status: 'expired' })
    .where(
      and(eq(billingOrders.id, order.id), eq(billingOrders.status, 'created')),
    )
    .returning({ id: billingOrders.id });
  if (expired.length === 0) return 'skipped';
  log.warn('pok.order_expired', 'POK order expired unpaid after 24h', {
    order_id: order.pokOrderId,
    age_ms: ageMs,
  });
  return 'expired';
}

/**
 * Every polled order failed: this is a POK/env/DB outage, not a quiet scan.
 * Throwing makes the cron run fail so Inngest retries it and the operator sees
 * it — otherwise a rotated credential silently stops settling money while the
 * run keeps reporting success.
 */
function assertReconcileProgress(result: ReconcileResult): void {
  if (result.scanned > 0 && result.failed === result.scanned) {
    throw new Error(
      `POK reconcile failed for all ${result.scanned} open orders`,
    );
  }
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
    failed: 0,
  };
  for (const order of orders) {
    const outcome = await reconcileOneOrder(order, now);
    result[outcome] += 1;
  }
  assertReconcileProgress(result);
  return result;
}

export const reconcilePokOrders = inngest.createFunction(
  { id: 'reconcile-pok-orders', retries: 2, concurrency: 1 },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const orders = await step.run('load-open-orders', () => loadOpenOrders());
    // Memoized through step.run: a retry must reuse the ORIGINAL instant, or an
    // order that was 23h59m old on the first attempt could cross 24h purely
    // because the run was retried.
    const nowIso = await step.run('now', () => new Date().toISOString());
    const now = new Date(nowIso);
    const result: ReconcileResult = {
      scanned: orders.length,
      expired: 0,
      reconciled: 0,
      skipped: 0,
      failed: 0,
    };
    for (const order of orders) {
      const outcome = await step.run(`reconcile-${order.id}`, () =>
        reconcileOneOrder(order, now),
      );
      result[outcome] += 1;
    }
    assertReconcileProgress(result);
    return result;
  },
);
