import { and, desc, eq } from 'drizzle-orm';
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
 *    ('not_found') is NOT pending — POK told us nothing, so the order keeps being
 *    re-polled rather than terminally expired, but only for NOT_FOUND_BUDGET_MS:
 *    an order POK has denied all knowledge of for days is dead, and leaving it
 *    'created' forever both hides it from every alarm and (oldest-first) parks it
 *    in the capped scan window where it starves genuinely settleable orders.
 *
 * A POK failure on one order is logged and counted as `failed` — never expired,
 * and never allowed to abort the remaining orders in the scan. But a run where
 * every order we actually POLLED failed (or 404'd — an all-404 scan is a wrong
 * merchant/environment, not N benign answers) is an outage, not a quiet scan, so
 * it throws instead of reporting success.
 */

const TEN_MIN_MS = 10 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
// How long an order POK answers with 404 stays open. Generous — a 404 for an
// order we created is anomalous and POK's API has been inconsistent — but finite.
const NOT_FOUND_BUDGET_MS = 7 * 24 * 60 * 60 * 1000;

// Cap the per-run fan-out. A failing poll never moves the order off
// status='created', so a persistent POK/env failure grows the open set without
// bound. The window is split so a wall of permanently-stuck OLD orders can never
// head-of-line-block the newest ones: oldest-first still makes progress on the
// orders nearest the 24h decision, newest-first guarantees today's checkouts are
// always polled.
const SCAN_LIMIT = 200;
const OLDEST_SLICE = SCAN_LIMIT / 2;

// One step does the whole scan (see below), so it needs a deadline of its own:
// past this the run stops polling and reports the rest as skipped for the next
// hour rather than running into the next cron tick.
const SCAN_BUDGET_MS = 4 * 60 * 1000;

// A single order that fails every hour is a per-order problem (it logs every
// run); the run-level alarm is for systemic failure, so it needs more than one
// order's worth of evidence before it fires — otherwise it latches on forever
// and stops meaning anything.
const MIN_OUTAGE_POLLS = 2;

export type OpenOrder = { id: string; pokOrderId: string; createdAt: Date | string };
export type ReconcileOutcome =
  | 'expired'
  | 'reconciled'
  | 'skipped'
  | 'failed'
  | 'notFound';
export type ReconcileResult = {
  scanned: number;
  expired: number;
  reconciled: number;
  skipped: number;
  failed: number;
  /** POK answered 404 and the order is still inside its budget. */
  notFound: number;
};

/** All orders still awaiting settlement (owner connection; RLS-bypassing). */
export async function loadOpenOrders(): Promise<OpenOrder[]> {
  const columns = {
    id: billingOrders.id,
    pokOrderId: billingOrders.pokOrderId,
    createdAt: billingOrders.createdAt,
  };
  const [oldest, newest] = await Promise.all([
    db
      .select(columns)
      .from(billingOrders)
      .where(eq(billingOrders.status, 'created'))
      .orderBy(billingOrders.createdAt)
      .limit(OLDEST_SLICE),
    db
      .select(columns)
      .from(billingOrders)
      .where(eq(billingOrders.status, 'created'))
      .orderBy(desc(billingOrders.createdAt))
      .limit(SCAN_LIMIT - OLDEST_SLICE),
  ]);
  // The two slices overlap whenever the open set is smaller than SCAN_LIMIT.
  const byId = new Map<string, OpenOrder>();
  for (const order of [...oldest, ...newest]) byId.set(order.id, order);
  return [...byId.values()];
}

/** Terminal write for an order POK still reports as unpaid (or has lost). */
async function expireOrder(order: OpenOrder): Promise<boolean> {
  const expired = await db
    .update(billingOrders)
    .set({ status: 'expired' })
    .where(
      and(eq(billingOrders.id, order.id), eq(billingOrders.status, 'created')),
    )
    .returning({ id: billingOrders.id });
  return expired.length > 0;
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

  if (outcome === 'not_found') {
    if (ageMs < NOT_FOUND_BUDGET_MS) return 'notFound';
    // Out of budget: POK has denied this order for a week. Close it so it stops
    // occupying the scan and shows up as a decided order, and say so loudly —
    // if POK ever does surface a capture for it, this is the line an operator
    // settles by hand.
    if (!(await expireOrder(order))) return 'skipped';
    log.error(
      'pok.order_abandoned_not_found',
      'POK order expired after being unknown to POK for the whole budget',
      { order_id: order.pokOrderId, age_ms: ageMs },
    );
    return 'expired';
  }

  // Only an order POK still reports as awaiting payment may be expired.
  if (ageMs < TWENTY_FOUR_H_MS || outcome !== 'pending') return 'reconciled';

  if (!(await expireOrder(order))) return 'skipped';
  log.warn('pok.order_expired', 'POK order expired unpaid after 24h', {
    order_id: order.pokOrderId,
    age_ms: ageMs,
  });
  return 'expired';
}

/**
 * Every order this run actually polled came back broken: a POK/env/DB outage,
 * not a quiet scan. Throwing fails the cron run so the operator sees it —
 * otherwise a rotated credential silently stops settling money while the run
 * keeps reporting success.
 *
 * `skipped` orders (too fresh to poll, or already decided by a concurrent
 * settle) are evidence of nothing and stay out of the denominator: counting
 * them muted the alarm on any run that happened to contain a fresh checkout.
 */
function assertReconcileProgress(result: ReconcileResult): void {
  const polled = result.scanned - result.skipped;
  const broken = result.failed + result.notFound;
  if (polled >= MIN_OUTAGE_POLLS && broken === polled) {
    throw new Error(`POK reconcile failed for all ${polled} polled orders`);
  }
}

/** Testable core: scan all open orders and apply the age-based transition. */
export async function reconcilePokOrdersCore(
  now: Date = new Date(),
  budgetMs: number = SCAN_BUDGET_MS,
): Promise<ReconcileResult> {
  const orders = await loadOpenOrders();
  const deadline = Date.now() + budgetMs;
  const result: ReconcileResult = {
    scanned: orders.length,
    expired: 0,
    reconciled: 0,
    skipped: 0,
    failed: 0,
    notFound: 0,
  };
  for (const [index, order] of orders.entries()) {
    if (Date.now() >= deadline) {
      createLogger().warn(
        'pok.reconcile_budget_exhausted',
        'POK reconcile ran out of time before the end of the scan',
        { remaining: orders.length - index },
      );
      result.skipped += orders.length - index;
      break;
    }
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
    // Memoized through step.run: a retry must reuse the ORIGINAL instant, or an
    // order that was 23h59m old on the first attempt could cross 24h purely
    // because the run was retried.
    const nowIso = await step.run('now', () => new Date().toISOString());
    // The ENTIRE scan is one step. Per-order steps read better but made
    // `retries: 2` a lie: every one of them is memoized, so a retry replayed the
    // old results and re-threw without re-polling POK. applyOrderOutcome is
    // idempotent, so re-running the whole scan is the safe thing to retry.
    return step.run('reconcile-open-orders', () =>
      reconcilePokOrdersCore(new Date(nowIso)),
    );
  },
);
