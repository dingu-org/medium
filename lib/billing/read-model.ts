/**
 * Read models for the billing surfaces (Phase 16 C6). Owner-connection reads
 * scoped by accountId — never PII from POK, never model names or cost-of-goods. All
 * usage math reuses the shipped primitives (getConversationUsage /
 * getReminderUsage / warnThreshold); all limits/prices come from plans.ts.
 */
import { desc, eq, inArray, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingOrders, accounts } from '@/lib/db/schema';
import type { ApplyOrderResult } from './payments';
import { resolveEffectivePlan } from './entitlements';
import {
  EXPIRY_GRACE_DAYS,
  getPlan,
  RENEWAL_REMINDER_DAYS_BEFORE,
  type PlanId,
} from './plans';
import {
  getConversationUsage,
  getReminderUsage,
  type ReminderUsage,
  warnThreshold,
} from './usage';
import { remindersEnabled } from '@/lib/reminders/flag';

const DAY_MS = 86_400_000;

/**
 * Reminders are parked — see lib/reminders/flag.ts. Nothing schedules or sends
 * one, so the meter can only ever read zero, and the billing page hides it
 * while the feature is off. Standing in for the two COUNT queries behind
 * `getReminderUsage` keeps them off every billing page load.
 *
 * Identical to the shape `getReminderUsage` returns for a missing account, so
 * "no reminder usage" has one representation rather than two.
 */
const PARKED_REMINDER_USAGE: ReminderUsage = {
  delivered: 0,
  inFlight: 0,
  used: 0,
  limit: 0,
  remaining: 0,
  monthKey: '',
};

export type BillingLifecycleState =
  | 'active'
  | 'expiring'
  | 'grace'
  | 'free'
  | 'lifetime';

export type BillingUsageMeter = { used: number; limit: number; warn: boolean };

export type BillingReceipt = {
  id: string;
  createdAt: string;
  period: 'monthly' | 'yearly';
  /** What was actually charged for THIS order (never the current list price). */
  amountAll: number;
  status: 'paid' | 'failed';
};

export type BillingSnapshot = {
  /** PT timezone — dates (expiry, receipts) format against it. */
  timezone: string;
  /** Grace-aware effective plan (what entitlements apply now). */
  plan: PlanId;
  storedPlan: PlanId;
  planLifetime: boolean;
  planExpiresAt: string | null;
  planDowngradedAt: string | null;
  state: BillingLifecycleState;
  /** Days to expiry (active/expiring) or days left to renew (grace); else null. */
  daysLeft: number | null;
  conversations: BillingUsageMeter;
  /** Delivered reminders vs the monthly cap (authoritative usage). */
  reminders: BillingUsageMeter;
  receipts: BillingReceipt[];
  /** Period of the most recent PAID order — drives the upgrade/renew slot. null if never paid. */
  currentPeriod: 'monthly' | 'yearly' | null;
  /** Whole-ALL VAT-inclusive Solo prices (null if Solo is not purchasable). */
  price: { monthly: number; yearly: number } | null;
};

/** The grace-aware effective plan for a PT — used by the upgrade-gate guards. */
export async function loadEffectivePlan(
  accountId: string,
  now: Date = new Date(),
): Promise<PlanId> {
  const [account] = await db
    .select({
      plan: accounts.plan,
      planLifetime: accounts.planLifetime,
      planExpiresAt: accounts.planExpiresAt,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) return 'free';
  return resolveEffectivePlan(account, now);
}

function daysCeil(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / DAY_MS));
}

export async function getBillingSnapshot(
  accountId: string,
  now: Date = new Date(),
): Promise<BillingSnapshot> {
  const [account] = await db
    .select({
      plan: accounts.plan,
      planLifetime: accounts.planLifetime,
      planExpiresAt: accounts.planExpiresAt,
      planDowngradedAt: accounts.planDowngradedAt,
      timezone: accounts.timezone,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const storedPlan: PlanId = account?.plan ?? 'free';
  const planLifetime = account?.planLifetime ?? false;
  const planExpiresAt = account?.planExpiresAt ?? null;
  const effective = account
    ? resolveEffectivePlan(account, now)
    : 'free';

  let state: BillingLifecycleState;
  let daysLeft: number | null = null;
  if (planLifetime) {
    state = 'lifetime';
  } else if (effective === 'free') {
    state = 'free';
  } else if (planExpiresAt && now.getTime() >= planExpiresAt.getTime()) {
    // Past expiry but still inside the grace window (resolveEffectivePlan kept
    // it Solo) → days left to renew before the downgrade cron flips to Free.
    state = 'grace';
    daysLeft = daysCeil(
      now.getTime(),
      planExpiresAt.getTime() + EXPIRY_GRACE_DAYS * DAY_MS,
    );
  } else if (
    planExpiresAt &&
    now.getTime() >= planExpiresAt.getTime() - RENEWAL_REMINDER_DAYS_BEFORE[0] * DAY_MS
  ) {
    state = 'expiring';
    daysLeft = daysCeil(now.getTime(), planExpiresAt.getTime());
  } else {
    state = 'active';
    daysLeft = planExpiresAt
      ? daysCeil(now.getTime(), planExpiresAt.getTime())
      : null;
  }

  const [conversations, reminders, receiptRows, paidPeriodRows] = await Promise.all([
    getConversationUsage(accountId, now),
    remindersEnabled()
      ? getReminderUsage(accountId, now)
      : PARKED_REMINDER_USAGE,
    db
      .select({
        id: billingOrders.id,
        createdAt: billingOrders.createdAt,
        period: billingOrders.period,
        amountMinor: billingOrders.amountMinor,
        status: billingOrders.status,
      })
      .from(billingOrders)
      // Real payment attempts only. A 'created' order was never settled, and an
      // 'expired' one is a checkout the PT opened and abandoned — showing it as
      // "Dështoi" next to a price reads as a charge that failed.
      .where(
        and(
          eq(billingOrders.accountId, accountId),
          inArray(billingOrders.status, ['paid', 'failed']),
        ),
      )
      .orderBy(desc(billingOrders.createdAt))
      .limit(50),
    // Own query, not a scan of the capped receipt list: the most recent PAID
    // order must drive the upgrade/renew slot even behind 50 newer failures.
    db
      .select({ period: billingOrders.period })
      .from(billingOrders)
      .where(and(eq(billingOrders.accountId, accountId), eq(billingOrders.status, 'paid')))
      .orderBy(
        sql`${billingOrders.paidAt} desc nulls last`,
        desc(billingOrders.createdAt),
      )
      .limit(1),
  ]);

  const soloPrice = getPlan('solo').price;

  const convMeter: BillingUsageMeter = {
    used: conversations.used,
    limit: conversations.limit,
    warn:
      conversations.limit > 0 &&
      conversations.used >= warnThreshold(conversations.limit),
  };
  const reminderMeter: BillingUsageMeter = {
    used: reminders.delivered,
    limit: reminders.limit,
    warn:
      reminders.limit > 0 &&
      reminders.delivered >= warnThreshold(reminders.limit),
  };

  const receipts: BillingReceipt[] = receiptRows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    period: row.period,
    // The amount stored ON THIS ORDER. `amount_minor` is already whole ALL
    // (ALL_MINOR_FACTOR = 1, spike-confirmed in payments.ts), so a later price
    // change never restates a historical receipt.
    amountAll: row.amountMinor,
    status: row.status as BillingReceipt['status'],
  }));

  const currentPeriod = paidPeriodRows[0]?.period ?? null;

  return {
    timezone: account?.timezone ?? 'Europe/Berlin',
    plan: effective,
    storedPlan,
    planLifetime,
    planExpiresAt: planExpiresAt ? planExpiresAt.toISOString() : null,
    planDowngradedAt: account?.planDowngradedAt
      ? account.planDowngradedAt.toISOString()
      : null,
    state,
    daysLeft,
    conversations: convMeter,
    reminders: reminderMeter,
    receipts,
    currentPeriod,
    price: soloPrice ? { monthly: soloPrice.monthly, yearly: soloPrice.yearly } : null,
  };
}

/** Banner tone for a post-redirect settle result; null renders nothing. */
export type CheckoutBannerTone = 'paid' | 'pending' | 'failed';

/**
 * Pure + unit-tested. `not_found` reads as PENDING, never as failure: POK's
 * read-after-write lag 404s an order for the first seconds after checkout, which
 * is exactly when POK redirects the customer back here — telling a PT who has
 * just paid that their payment failed is the worst possible reading of "POK told
 * us nothing yet". The hourly reconcile settles it either way.
 */
export function checkoutBannerTone(
  result: ApplyOrderResult,
): CheckoutBannerTone | null {
  switch (result) {
    case 'unknown':
      return null;
    case 'applied':
    case 'already_applied':
      return 'paid';
    case 'pending':
    case 'not_found':
      return 'pending';
    case 'failed':
      return 'failed';
  }
}

export type CheckoutSlotKind = 'none' | 'upgrade' | 'switch' | 'reassure' | 'renew';
export type CheckoutSlot = {
  kind: CheckoutSlotKind;
  periods?: ('monthly' | 'yearly')[];
  defaultPeriod?: 'monthly' | 'yearly';
};

/**
 * What the billing screen's payment slot should render, given the snapshot.
 * Pure + unit-tested. Never sells to lifetime pilots or when Solo is not
 * purchasable. Active Solo users are NOT shown "Upgrade to Solo": a monthly
 * buyer gets the yearly-value upsell, a yearly buyer gets a reassurance note,
 * and everyone gets a renew prompt once expiring / in grace.
 */
export function resolveCheckoutSlot(snapshot: BillingSnapshot): CheckoutSlot {
  if (snapshot.planLifetime || snapshot.price === null) return { kind: 'none' };
  switch (snapshot.state) {
    case 'free':
      return { kind: 'upgrade', periods: ['monthly', 'yearly'], defaultPeriod: 'yearly' };
    case 'active':
      if (snapshot.currentPeriod === 'monthly')
        return { kind: 'switch', periods: ['yearly'], defaultPeriod: 'yearly' };
      if (snapshot.currentPeriod === 'yearly') return { kind: 'reassure' };
      return { kind: 'none' };
    case 'expiring':
    case 'grace':
      return { kind: 'renew', periods: ['monthly', 'yearly'], defaultPeriod: 'yearly' };
    default:
      return { kind: 'none' };
  }
}
