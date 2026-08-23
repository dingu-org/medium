import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, accounts, services } from '@/lib/db/schema';
import { EXPIRY_GRACE_DAYS, PLANS, RENEWAL_REMINDER_DAYS_BEFORE } from '@/lib/billing/plans';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { newTraceId } from '@/lib/log';
import { inngest } from '../client';

/**
 * Daily prepaid-plan lifecycle cron (Phase 16 C6). Mirrors reconcile-pok-orders:
 * a testable pure core plus a thin step-per-PT Inngest function. Runs at 07:00
 * UTC (after billing-usage-monitor at 06:00). There is NO internal subscription
 * state machine — the only writes are the grace-elapsed downgrade below; the
 * renewal itself is a normal POK payment (applyOrderOutcome) that moves
 * plan_expires_at forward, which re-arms both reminders naturally.
 *
 * TZ EDGE (accepted, ruling 9): expiry/grace/downgrade are compared as exact
 * instants, and the cron fires once a day, so a boundary crossed between two
 * daily runs is acted on up to ~1 day late relative to a local midnight. This is
 * money-trivial (entitlements already honor the grace window live) and self-
 * corrects on the next run.
 *
 * TODO(pok-subscriptions): once POK ships native recurring plans, skip PTs
 * backed by a pok_subscription_id here (POK renews them); the seam lives in
 * lib/billing/payments.ts. Until then every non-lifetime Solo is managed here.
 */

const DAY_MS = 86_400_000;

export type RenewalDecision =
  | { type: 'renewal_due'; offset: number }
  | { type: 'grace_started' }
  | { type: 'downgrade' };

export type RenewalCandidate = {
  id: string;
  planExpiresAt: Date | string | null;
  planLifetime?: boolean;
};

export type RenewalOutcome = {
  remindersDue: number;
  graceStarted: boolean;
  downgraded: boolean;
};

export type RenewalMonitorResult = {
  scanned: number;
  remindersDue: number;
  gracesStarted: number;
  downgrades: number;
};

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * Pure decision core — what SHOULD fire for a PT at `now`, ignoring dedupe and
 * DB state. Dedupe (renewal/grace already emitted) and the conditional
 * downgrade write are applied by processRenewalForAccount. Lifetime / expiry-less
 * rows produce no actions (defensive: the scan already excludes them).
 */
export function planRenewalActions(
  account: { planExpiresAt: Date | string | null; planLifetime?: boolean },
  now: Date,
): RenewalDecision[] {
  if (account.planLifetime) return [];
  const expiresAt = toDate(account.planExpiresAt);
  if (!expiresAt) return [];

  const nowMs = now.getTime();
  const expMs = expiresAt.getTime();
  const graceEndMs = expMs + EXPIRY_GRACE_DAYS * DAY_MS;
  const decisions: RenewalDecision[] = [];

  // Renewal reminders: one per configured offset. The 5-day reminder is scoped
  // to before expiry; the day-0 reminder fires from expiry onward (deduped, so
  // it lands exactly once regardless of how many post-expiry runs see it).
  for (const offset of RENEWAL_REMINDER_DAYS_BEFORE) {
    if (nowMs >= expMs - offset * DAY_MS && (offset !== 5 || nowMs < expMs)) {
      decisions.push({ type: 'renewal_due', offset });
    }
  }

  // Grace: from expiry until the grace window closes (day-0 reminder + grace on
  // the same expiry-day run — their copy is deliberately differentiated).
  if (nowMs >= expMs && nowMs < graceEndMs) {
    decisions.push({ type: 'grace_started' });
  }

  // Downgrade once the grace window has fully elapsed.
  if (nowMs >= graceEndMs) {
    decisions.push({ type: 'downgrade' });
  }

  return decisions;
}

/** All non-lifetime Solo PTs with a real expiry — the only rows the cron acts on. */
export async function loadRenewalCandidates(): Promise<RenewalCandidate[]> {
  return db
    .select({
      id: accounts.id,
      planExpiresAt: accounts.planExpiresAt,
      // TODO(pok-subscriptions): also skip accounts backed by a pok_subscription_id.
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.plan, 'solo'),
        eq(accounts.planLifetime, false),
        isNotNull(accounts.planExpiresAt),
      ),
    );
}

/** Emit a billing lifecycle event once, deduped on the given payload keys. */
async function emitLifecycleEventOnce(
  accountId: string,
  match: { type: 'billing.renewal_due' | 'billing.grace_started'; expiresAtIso: string; offset?: number },
  build: () => Parameters<typeof appendBackgroundEvent>[1],
): Promise<boolean> {
  const eventId = await db.transaction(async (tx) => {
    const conditions = [
      eq(events.accountId, accountId),
      eq(events.type, match.type),
      sql`${events.payload}->>'expiresAt' = ${match.expiresAtIso}`,
    ];
    if (match.offset !== undefined) {
      conditions.push(sql`${events.payload}->>'offset' = ${String(match.offset)}`);
    }
    const [existing] = await tx
      .select({ id: events.id })
      .from(events)
      .where(and(...conditions))
      .limit(1);
    if (existing) return null;
    return appendBackgroundEvent(tx, build());
  });
  if (!eventId) return false;
  await tryPublishOutboxEvent(eventId);
  return true;
}

/**
 * Downgrade transaction (the only money-path write). The conditional plan
 * write re-checks `plan_expires_at + 3d <= now` INSIDE the tx: this is the mutex
 * against a concurrent settle — a payment that landed between the scan and this
 * write has extended plan_expires_at (or nulled plan_downgraded_at), so the
 * WHERE misses and rowcount 0 => skipped, never downgraded. Nothing is deleted:
 * services beyond Free's active cap flip to inactive (oldest active stays; the
 * PT can swap later), and retention is clamped lazily by purge-expired-messages.
 */
async function runDowngrade(accountId: string, now: Date): Promise<boolean> {
  const maxActive = PLANS.free.maxActiveServices ?? 1;
  const result = await db.transaction(async (tx) => {
    const downgraded = await tx
      .update(accounts)
      .set({ plan: 'free', planDowngradedAt: now })
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.plan, 'solo'),
          eq(accounts.planLifetime, false),
          isNotNull(accounts.planExpiresAt),
          sql`${accounts.planExpiresAt} + interval '3 days' <= ${now.toISOString()}::timestamptz`,
        ),
      )
      .returning({ id: accounts.id });
    if (downgraded.length === 0) return null;

    // Deactivate every active service except the oldest `maxActive` — no picker
    // UI, deterministic, and reversible (the PT swaps by toggling active).
    await tx
      .update(services)
      .set({ active: false })
      .where(
        and(
          eq(services.accountId, accountId),
          eq(services.active, true),
          sql`${services.id} NOT IN (
            SELECT id FROM services
            WHERE account_id = ${accountId} AND active = true
            ORDER BY created_at ASC
            LIMIT ${maxActive}
          )`,
        ),
      );

    return appendBackgroundEvent(tx, {
      type: 'billing.downgraded',
      data: { accountId, from: 'solo', to: 'free', traceId: newTraceId() },
    });
  });

  if (!result) return false;
  await tryPublishOutboxEvent(result);
  return true;
}

/** Evaluate + apply the lifecycle for a single PT (deduped emits + downgrade). */
export async function processRenewalForAccount(
  account: RenewalCandidate,
  now: Date,
): Promise<RenewalOutcome> {
  const expiresAt = toDate(account.planExpiresAt);
  const outcome: RenewalOutcome = {
    remindersDue: 0,
    graceStarted: false,
    downgraded: false,
  };
  if (!expiresAt) return outcome;
  const expiresAtIso = expiresAt.toISOString();

  for (const decision of planRenewalActions(account, now)) {
    if (decision.type === 'renewal_due') {
      const fired = await emitLifecycleEventOnce(
        account.id,
        { type: 'billing.renewal_due', expiresAtIso, offset: decision.offset },
        () => ({
          type: 'billing.renewal_due',
          data: {
            accountId: account.id,
            expiresAt: expiresAtIso,
            daysLeft: decision.offset,
            offset: decision.offset,
            traceId: newTraceId(),
          },
        }),
      );
      if (fired) outcome.remindersDue += 1;
    } else if (decision.type === 'grace_started') {
      const fired = await emitLifecycleEventOnce(
        account.id,
        { type: 'billing.grace_started', expiresAtIso },
        () => ({
          type: 'billing.grace_started',
          data: { accountId: account.id, expiresAt: expiresAtIso, traceId: newTraceId() },
        }),
      );
      if (fired) outcome.graceStarted = true;
    } else {
      outcome.downgraded = await runDowngrade(account.id, now);
    }
  }

  return outcome;
}

/** Testable core: scan every candidate and apply its lifecycle transition. */
export async function runBillingRenewalMonitor(
  now: Date = new Date(),
): Promise<RenewalMonitorResult> {
  const candidates = await loadRenewalCandidates();
  const result: RenewalMonitorResult = {
    scanned: candidates.length,
    remindersDue: 0,
    gracesStarted: 0,
    downgrades: 0,
  };
  for (const candidate of candidates) {
    const outcome = await processRenewalForAccount(candidate, now);
    result.remindersDue += outcome.remindersDue;
    if (outcome.graceStarted) result.gracesStarted += 1;
    if (outcome.downgraded) result.downgrades += 1;
  }
  return result;
}

export const billingRenewalMonitor = inngest.createFunction(
  { id: 'billing-renewal-monitor', retries: 2, concurrency: 1 },
  { cron: '0 7 * * *' },
  async ({ step }) => {
    const candidates = await step.run('load-renewal-candidates', () =>
      loadRenewalCandidates(),
    );
    const now = new Date();
    const result: RenewalMonitorResult = {
      scanned: candidates.length,
      remindersDue: 0,
      gracesStarted: 0,
      downgrades: 0,
    };
    for (const candidate of candidates) {
      const outcome = await step.run(`renewal-${candidate.id}`, () =>
        processRenewalForAccount(candidate, now),
      );
      result.remindersDue += outcome.remindersDue;
      if (outcome.graceStarted) result.gracesStarted += 1;
      if (outcome.downgraded) result.downgrades += 1;
    }
    return result;
  },
);
