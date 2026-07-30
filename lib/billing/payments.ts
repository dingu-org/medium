/**
 * POK payments boundary (Phase 16 C5). The ONLY module that may import
 * lib/billing/pok/. Everything the rest of the app needs about payments —
 * starting a checkout and settling an order into prepaid plan time — goes
 * through the two exported entry points here.
 *
 * No internal subscription state machine: a payment is a single one-off POK
 * order. On success we set `pts.plan='solo'` and extend `plan_expires_at` by the
 * purchased period FROM max(now, current expiry), so renewing early loses no
 * days. Truth is server-side: the webhook is only a trigger; every settle
 * RE-FETCHES the order from POK and acts on the authoritative status, and the
 * settle is idempotent (a double webhook + a concurrent redirect must not
 * double-extend).
 *
 * TODO(pok-subscriptions): when POK ships native recurring plans, POK becomes
 * the renewal source of truth. At that point: `applyOrderOutcome` stays the
 * single period-extension entry point (recurring charges settle through it too);
 * `pts` gains a `pok_subscription_id`; and the C6 renewal/expiry crons skip PTs
 * backed by a POK subscription (POK renews them) rather than downgrading on
 * `plan_expires_at`. Nothing here needs to change shape — this is a seam, not a
 * rewrite.
 */
import { TZDate } from '@date-fns/tz';
import { addMonths, addYears } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingOrders, pts } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { createLogger, newTraceId } from '@/lib/log';
import { PLANS } from './plans';
import { createPokClient, PokNotFoundError, type PokOrder } from './pok/client';

export type BillingPeriod = 'monthly' | 'yearly';
export type ApplyOrderResult =
  | 'applied'
  | 'already_applied'
  | 'pending'
  | 'not_found'
  | 'failed'
  | 'unknown';

// POK_* live in .env.local (dev/build) and the deployment env (prod), where a
// missing var is a hard misconfiguration and must throw. They are deliberately
// absent from .env.test (C5 must not touch env files) and the network client is
// mocked in every test, so under Vitest we fall back to an obviously-fake value
// that is never used for a real request. (Smallest correct deviation from the
// plain module-top throw convention, forced by the untouchable test env.)
function requirePokEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.VITEST) return `vitest-placeholder-${name}`;
  throw new Error(`${name} is required`);
}

/** POK API base: POK_ENV (production→prod host, else staging) + POK_API_BASE override. */
export function pokApiBase(): string {
  const override = process.env.POK_API_BASE;
  if (override) return override;
  const env = (process.env.POK_ENV ?? 'staging').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://api.pokpay.io'
    : 'https://api-staging.pokpay.io';
}

let cachedPokClient: ReturnType<typeof createPokClient> | undefined;

/**
 * The POK client, built (and cached) on the first real payment call — NOT at
 * module scope. This module is in the import graph of the Inngest function
 * registry, so a module-scope throw for a missing POK_* var would fail the load
 * of /api/inngest and take down every background job (AI replies, reminders,
 * outbox, push) over a payments credential. Lazily, only checkout and settle
 * fail.
 */
function pokClient(): ReturnType<typeof createPokClient> {
  cachedPokClient ??= createPokClient({
    apiBase: pokApiBase(),
    merchantId: requirePokEnv('POK_MERCHANT_ID'),
    keyId: requirePokEnv('POK_KEY_ID'),
    keySecret: requirePokEnv('POK_KEY_SECRET'),
  });
  return cachedPokClient;
}

// ONE documented minor-unit constant. CONFIRMED by the POK staging spike
// (scripts/smoke-pok.ts, 2026-07-14): an order sent as amount `250000` renders on
// POK's hosted payment page as "250,000.00 ALL" — i.e. POK treats the integer
// amount as WHOLE ALL (not minor units / cents). So the factor is 1: send the
// plans.ts whole-ALL price directly. (A factor of 100 would overcharge 100×.)
const ALL_MINOR_FACTOR = 1;

const CURRENCY = 'ALL';

/** Whole-ALL price × the minor-unit factor. Prices come only from plans.ts. */
function amountMinorFor(period: BillingPeriod): number {
  const price = PLANS.solo.price;
  if (!price) throw new Error('Solo plan has no price configured');
  return price[period] * ALL_MINOR_FACTOR;
}

// POK exposes no string status — it uses boolean flags (spike-confirmed). We
// credit ONLY on isCaptured (money actually taken; autoCapture:true makes a
// successful guest payment land captured in one flow); a canceled/refunded order
// is a failure; anything else (still awaiting payment) is pending. We never
// credit plan time on an ambiguous state.
function classifyPokStatus(order: PokOrder): 'paid' | 'pending' | 'failed' {
  if (order.isCaptured) return 'paid';
  if (order.isCanceled || order.isRefunded) return 'failed';
  return 'pending';
}

/** PII-free order snapshot persisted on the ledger row (no customer fields). */
function orderSnapshot(order: PokOrder): Record<string, unknown> {
  return {
    id: order.id,
    isCaptured: order.isCaptured ?? null,
    isCompleted: order.isCompleted ?? null,
    isCanceled: order.isCanceled ?? null,
    isRefunded: order.isRefunded ?? null,
    amount: order.amount ?? null,
    currencyCode: order.currencyCode ?? null,
  };
}

/**
 * Pure, exported, unit-tested. The new expiry after purchasing `period`:
 * extend from max(now, currentExpiry) so renewing early never loses days.
 * UTC calendar arithmetic (TZDate('UTC')) so the boundary is machine-independent.
 */
export function computeExtendedExpiry(
  currentExpiry: Date | null,
  period: BillingPeriod,
  now: Date,
): Date {
  const base =
    currentExpiry && currentExpiry.getTime() > now.getTime()
      ? currentExpiry
      : now;
  const utcBase = new TZDate(base, 'UTC');
  const extended = period === 'yearly' ? addYears(utcBase, 1) : addMonths(utcBase, 1);
  return new Date(extended.getTime());
}

/**
 * Start a checkout: create a one-off POK order for the Solo price of `period`
 * and record a 'created' ledger row. Expiry columns stay null until settle.
 */
export async function createCheckout(
  ptId: string,
  period: BillingPeriod,
  returnUrl: string,
): Promise<{ pokOrderId: string; confirmUrl?: string; amountMinor: number }> {
  const amountMinor = amountMinorFor(period);
  // POK captures on its own hosted page (autoCapture) and redirects the customer
  // back to `returnUrl` (POK appends `?orderId=…`) on both success and failure;
  // the /settings/billing page then re-fetches the order and settles. No webhook
  // (POK has none) — the hourly reconcile cron is the safety net.
  const order = await pokClient().createOrder({
    amountMinor,
    currency: CURRENCY,
    extra: {
      description: `Medium Solo (${period})`,
      redirectUrl: returnUrl,
      failRedirectUrl: returnUrl,
    },
  });

  await db.insert(billingOrders).values({
    ptId,
    pokOrderId: order.id,
    plan: 'solo',
    period,
    amountMinor,
    currency: CURRENCY,
    status: 'created',
  });

  return { pokOrderId: order.id, confirmUrl: order.confirmUrl, amountMinor };
}

/**
 * The single idempotent settle. Called by the webhook route, the reconcile cron,
 * and (C6) the post-redirect confirm action. Re-fetches the authoritative order
 * from POK — a forged trigger for an unknown/paid/failed order is harmless.
 */
export async function applyOrderOutcome(
  pokOrderId: string,
): Promise<ApplyOrderResult> {
  const log = createLogger();

  // 1. Cheap pre-check — no POK call for a forged/terminal id.
  const [existing] = await db
    .select({ id: billingOrders.id, status: billingOrders.status })
    .from(billingOrders)
    .where(eq(billingOrders.pokOrderId, pokOrderId))
    .limit(1);
  if (!existing) return 'unknown';
  if (existing.status === 'paid') return 'already_applied';
  // Both terminal-failure states report as 'failed' (the result union has no
  // separate 'expired'); the row keeps its precise status.
  if (existing.status === 'failed' || existing.status === 'expired') {
    return 'failed';
  }

  // 2. Authoritative fetch. Network/5xx errors THROW (webhook still returns 200;
  // the cron retries). A 404 for an order we created is anomalous but transient —
  // never credit, and report it distinctly from 'pending': 'pending' means POK
  // told us the order is still awaiting payment, which is what licenses the
  // reconcile cron to expire it at 24h. Expiring on a 404 would be terminal
  // (this function short-circuits on 'expired'), losing a payment POK captures
  // later once its API is consistent again.
  let order: PokOrder;
  try {
    order = await pokClient().getOrder(pokOrderId);
  } catch (error) {
    if (error instanceof PokNotFoundError) {
      log.warn('pok.order_not_found', 'POK getOrder returned 404 for a created order', {
        order_id: pokOrderId,
        pokErrorCode: error.pokErrorCode,
      });
      return 'not_found';
    }
    throw error;
  }

  const outcome = classifyPokStatus(order);

  if (outcome === 'failed') {
    // Guarded on status='created', like settleOrder's locked re-check: two
    // overlapping settles can hold different POK snapshots (a canceled one and a
    // captured one), and an unguarded write would stamp 'failed' over an order
    // that already extended the plan and emitted billing.payment_received —
    // after which every later settle short-circuits to 'failed' forever.
    const failed = await db
      .update(billingOrders)
      .set({ status: 'failed' })
      .where(
        and(
          eq(billingOrders.pokOrderId, pokOrderId),
          eq(billingOrders.status, 'created'),
        ),
      )
      .returning({ id: billingOrders.id });
    if (failed.length === 0) {
      const [current] = await db
        .select({ status: billingOrders.status })
        .from(billingOrders)
        .where(eq(billingOrders.pokOrderId, pokOrderId))
        .limit(1);
      return current?.status === 'paid' ? 'already_applied' : 'failed';
    }
    log.info('pok.order_failed', 'POK order settled as failed', {
      order_id: pokOrderId,
      canceled: order.isCanceled ?? null,
      refunded: order.isRefunded ?? null,
    });
    return 'failed';
  }

  if (outcome === 'pending') {
    return 'pending';
  }

  return settleOrder(existing.id, order, log);
}

/**
 * Settle transaction — the idempotency + extension core. The `FOR UPDATE` row
 * lock on the ledger row is the mutex: a double webhook + a concurrent redirect
 * all block on it, and exactly one observer sees status='created' and extends.
 */
async function settleOrder(
  orderRowId: string,
  order: PokOrder,
  log: ReturnType<typeof createLogger>,
): Promise<'applied' | 'already_applied'> {
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(billingOrders)
      .where(eq(billingOrders.id, orderRowId))
      .for('update');
    if (!row || row.status !== 'created') {
      return { applied: false as const };
    }

    const [pt] = await tx
      .select({ planExpiresAt: pts.planExpiresAt })
      .from(pts)
      .where(eq(pts.id, row.ptId))
      .for('update');
    const previousExpiresAt = pt?.planExpiresAt ?? null;
    const newExpiresAt = computeExtendedExpiry(previousExpiresAt, row.period, now);

    await tx
      .update(billingOrders)
      .set({
        status: 'paid',
        paidAt: now,
        previousExpiresAt,
        newExpiresAt,
        pokPayload: orderSnapshot(order),
      })
      .where(eq(billingOrders.id, row.id));

    await tx
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: newExpiresAt, planDowngradedAt: null })
      .where(eq(pts.id, row.ptId));

    const eventId = await appendBackgroundEvent(tx, {
      type: 'billing.payment_received',
      data: {
        ptId: row.ptId,
        orderId: row.id,
        period: row.period,
        newExpiresAt: newExpiresAt.toISOString(),
        traceId: newTraceId(),
      },
    });

    return { applied: true as const, eventId };
  });

  if (!result.applied) return 'already_applied';

  await tryPublishOutboxEvent(result.eventId);
  log.info('pok.order_applied', 'POK order settled and plan extended', {
    order_id: order.id,
    captured: order.isCaptured ?? null,
  });
  return 'applied';
}
