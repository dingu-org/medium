/**
 * Single source of truth for plan limits, prices, and per-plan model config
 * (Phase 16). Every limit/price/model the billing system consults lives here —
 * never scattered across features. `BILLING_PLAN_OVERRIDES` (JSON env var) is
 * the escape hatch for emergency tuning without a deploy; its parser lives
 * only in this file.
 *
 * Prices are stored in whole ALL (Lekë). Minor-unit conversion happens in the
 * POK payments chunk (C5) after a sandbox spike confirms the factor.
 */
import { z } from 'zod';
import { APP_ENVS, type AppEnv } from '@/lib/env/app-env';

export const PLAN_IDS = ['free', 'solo'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type ReasoningEffort = 'low' | 'medium' | 'high';

export type PlanModelConfig = {
  primary: string;
  fallbacks: string[];
  reasoningEffort: ReasoningEffort;
};

/**
 * A plan's model config, declared once per environment.
 *
 * Every environment resolves through this same map — there is no separate
 * env-var path that produces a differently shaped request. Only the *values*
 * differ: production runs a paid model with a paid fallback, development and
 * preview run a free model with none. This is the seam the config moves to the
 * database behind; keep the shape identical for all three so that move is a
 * data migration rather than a rewrite.
 */
export type PlanModelByEnv = Record<AppEnv, PlanModelConfig>;

/** Whole ALL (Lekë), VAT-inclusive. */
export type PlanPrice = {
  currency: 'ALL';
  monthly: number;
  yearly: number;
};

export type PlanConfig = {
  /** Conversations = active patient-days per calendar month (PT timezone). */
  conversationsPerMonth: number;
  /** Reminders counted only on Meta delivery confirmation. */
  remindersPerMonth: number;
  /** null = unlimited. */
  maxActiveServices: number | null;
  /** Retention setting is clamped to this after the post-downgrade grace. */
  retentionMaxDays: number;
  /** false = assistant identity (name/greeting) falls back to the default. */
  customAssistantIdentity: boolean;
  /** null = not purchasable (free). */
  price: PlanPrice | null;
  model: PlanModelByEnv;
};

/**
 * Development and preview. A free model, and deliberately **no fallback** — a
 * paid fallback here would silently bill real money the moment the free
 * endpoint rate-limits, which is exactly the failure the environment split
 * exists to prevent.
 */
const FREE_MODEL: PlanModelConfig = {
  primary: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  fallbacks: [],
  reasoningEffort: 'high',
};

/** Production. Paid primary + paid fallback; the only environment that sees patient data. */
const PRODUCTION_MODEL: PlanModelConfig = {
  primary: 'anthropic/claude-haiku-4.5',
  fallbacks: ['openai/gpt-5-mini'],
  reasoningEffort: 'high',
};

// One model table for all plans today — the per-plan seam is the deliverable,
// not a per-plan model split. Give a plan its own record to diverge.
const SHARED_MODEL: PlanModelByEnv = {
  development: FREE_MODEL,
  preview: FREE_MODEL,
  production: PRODUCTION_MODEL,
};

const BASE_PLANS: Record<PlanId, PlanConfig> = {
  free: {
    conversationsPerMonth: 30,
    remindersPerMonth: 10,
    maxActiveServices: 1,
    retentionMaxDays: 30,
    customAssistantIdentity: false,
    price: null,
    model: SHARED_MODEL,
  },
  solo: {
    conversationsPerMonth: 400,
    remindersPerMonth: 250,
    maxActiveServices: null,
    retentionMaxDays: 365,
    customAssistantIdentity: true,
    price: { currency: 'ALL', monthly: 2500, yearly: 25000 },
    model: SHARED_MODEL,
  },
};

/** Warn (push/bell) once usage crosses this fraction of the monthly cap. */
export const USAGE_WARN_RATIO = 0.8;
/** Days past `plan_expires_at` during which Solo entitlements still apply. */
export const EXPIRY_GRACE_DAYS = 3;
/** Days after `plan_downgraded_at` before retention clamps to the plan max. */
export const RETENTION_CLAMP_GRACE_DAYS = 30;
/** Days before expiry to send renewal reminders (0 = on the expiry day). */
export const RENEWAL_REMINDER_DAYS_BEFORE = [5, 0] as const;

const modelOverrideSchema = z
  .object({
    primary: z.string().min(1),
    fallbacks: z.array(z.string().min(1)),
    reasoningEffort: z.enum(['low', 'medium', 'high']),
  })
  .partial();

// Env-keyed like the config it overrides, so an override can target one
// environment without reshaping the others.
const modelByEnvOverrideSchema = z
  .object(
    Object.fromEntries(APP_ENVS.map((env) => [env, modelOverrideSchema])) as Record<
      AppEnv,
      typeof modelOverrideSchema
    >,
  )
  .partial();

const priceOverrideSchema = z
  .object({
    currency: z.literal('ALL'),
    monthly: z.number().int().nonnegative(),
    yearly: z.number().int().nonnegative(),
  })
  .partial();

const planOverrideSchema = z
  .object({
    conversationsPerMonth: z.number().int().nonnegative(),
    remindersPerMonth: z.number().int().nonnegative(),
    maxActiveServices: z.number().int().positive().nullable(),
    retentionMaxDays: z.number().int().positive(),
    customAssistantIdentity: z.boolean(),
    price: priceOverrideSchema.nullable(),
    model: modelByEnvOverrideSchema,
  })
  .partial();

const overridesSchema = z
  .object({ free: planOverrideSchema, solo: planOverrideSchema })
  .partial();

export type BillingPlanOverrides = z.infer<typeof overridesSchema>;

/**
 * Parse the `BILLING_PLAN_OVERRIDES` env value. Empty/undefined means no
 * overrides; anything else must be valid JSON matching the (deep-partial)
 * plan shape. Throws at module init on garbage — a mistyped override must
 * fail loudly, not silently run with default limits.
 */
export function parseBillingPlanOverrides(
  raw: string | undefined,
): BillingPlanOverrides {
  if (!raw || !raw.trim()) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `BILLING_PLAN_OVERRIDES is not valid JSON: ${(error as Error).message}`,
    );
  }
  return overridesSchema.parse(json);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// Plain objects merge recursively; arrays, scalars, and null replace.
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      merged[key] = deepMerge(merged[key], value);
    }
    return merged as T;
  }
  return override as T;
}

/** Build the effective plan table: base config deep-merged with env overrides. */
export function resolvePlans(
  raw: string | undefined,
): Record<PlanId, PlanConfig> {
  const overrides = parseBillingPlanOverrides(raw);
  return {
    free: deepMerge(BASE_PLANS.free, overrides.free),
    solo: deepMerge(BASE_PLANS.solo, overrides.solo),
  };
}

export const PLANS: Record<PlanId, PlanConfig> = resolvePlans(
  process.env.BILLING_PLAN_OVERRIDES,
);

export function getPlan(id: PlanId): PlanConfig {
  return PLANS[id];
}
