/**
 * Pure entitlement resolution (Phase 16 C1). No DB access — callers pass the
 * PT's billing fields; these functions decide what the PT is entitled to
 * right now. Nothing is gated in C1: these are delivered + unit-tested here
 * and wired into metering/gating in C2/C3.
 */
import {
  EXPIRY_GRACE_DAYS,
  PLANS,
  RETENTION_CLAMP_GRACE_DAYS,
  type PlanId,
} from './plans';

const DAY_MS = 86_400_000;

export type BillingPt = {
  plan: PlanId;
  planLifetime: boolean;
  planExpiresAt: Date | null;
  planDowngradedAt?: Date | null;
  retentionDays?: number;
  aiName?: string | null;
  aiGreeting?: string | null;
};

/**
 * The plan whose entitlements apply at `now`:
 * - `plan_lifetime` → solo, unconditionally (pilot PTs).
 * - stored solo → solo while `now <= plan_expires_at + EXPIRY_GRACE_DAYS`.
 * - a lapsed (past-grace) or expiry-less non-lifetime solo resolves to free —
 *   entitlements must not honor an expired plan while waiting for the C6
 *   renewal cron to write the downgrade back to the row.
 * - otherwise the stored plan (free).
 */
export function resolveEffectivePlan(pt: BillingPt, now: Date): PlanId {
  if (pt.planLifetime) return 'solo';
  if (pt.plan === 'solo') {
    if (
      pt.planExpiresAt &&
      now.getTime() <= pt.planExpiresAt.getTime() + EXPIRY_GRACE_DAYS * DAY_MS
    ) {
      return 'solo';
    }
    return 'free';
  }
  return pt.plan;
}

/**
 * The retention window that applies at `now`. Downgrade deletes nothing
 * immediately: the PT's stored setting stands for RETENTION_CLAMP_GRACE_DAYS
 * after `plan_downgraded_at`, then clamps to the effective plan's max.
 */
export function effectiveRetentionDays(pt: BillingPt, now: Date): number {
  const stored = pt.retentionDays ?? 90;
  if (
    pt.planDowngradedAt &&
    now.getTime() >=
      pt.planDowngradedAt.getTime() + RETENTION_CLAMP_GRACE_DAYS * DAY_MS
  ) {
    const plan = PLANS[resolveEffectivePlan(pt, now)];
    return Math.min(stored, plan.retentionMaxDays);
  }
  return stored;
}

/**
 * The assistant identity that applies: plans without custom identity get
 * nulls, which the prompt layer resolves to its default assistant persona.
 */
export function effectiveAssistantIdentity(
  pt: BillingPt,
  now: Date = new Date(),
): { aiName: string | null; aiGreeting: string | null } {
  if (!PLANS[resolveEffectivePlan(pt, now)].customAssistantIdentity) {
    return { aiName: null, aiGreeting: null };
  }
  return { aiName: pt.aiName ?? null, aiGreeting: pt.aiGreeting ?? null };
}
