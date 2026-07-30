/**
 * Read models for the billing surfaces (Phase 16 C6). Owner-connection reads
 * scoped by ptId — never PII from POK, never model names or cost-of-goods. All
 * usage math reuses the shipped primitives (getConversationUsage /
 * getReminderUsage / warnThreshold); all limits/prices come from plans.ts.
 */
import { desc, eq, inArray, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { billingOrders, pts } from '@/lib/db/schema';
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
  warnThreshold,
} from './usage';

const DAY_MS = 86_400_000;

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
  ptId: string,
  now: Date = new Date(),
): Promise<PlanId> {
  const [pt] = await db
    .select({
      plan: pts.plan,
      planLifetime: pts.planLifetime,
      planExpiresAt: pts.planExpiresAt,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  if (!pt) return 'free';
  return resolveEffectivePlan(pt, now);
}

function daysCeil(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / DAY_MS));
}

export async function getBillingSnapshot(
  ptId: string,
  now: Date = new Date(),
): Promise<BillingSnapshot> {
  const [pt] = await db
    .select({
      plan: pts.plan,
      planLifetime: pts.planLifetime,
      planExpiresAt: pts.planExpiresAt,
      planDowngradedAt: pts.planDowngradedAt,
      timezone: pts.timezone,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);

  const storedPlan: PlanId = pt?.plan ?? 'free';
  const planLifetime = pt?.planLifetime ?? false;
  const planExpiresAt = pt?.planExpiresAt ?? null;
  const effective = pt
    ? resolveEffectivePlan(pt, now)
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
    getConversationUsage(ptId, now),
    getReminderUsage(ptId, now),
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
          eq(billingOrders.ptId, ptId),
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
      .where(and(eq(billingOrders.ptId, ptId), eq(billingOrders.status, 'paid')))
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
    timezone: pt?.timezone ?? 'Europe/Berlin',
    plan: effective,
    storedPlan,
    planLifetime,
    planExpiresAt: planExpiresAt ? planExpiresAt.toISOString() : null,
    planDowngradedAt: pt?.planDowngradedAt
      ? pt.planDowngradedAt.toISOString()
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
