/**
 * Meta (WhatsApp) per-message cost rate card + estimation (Phase 16 C4).
 *
 * Meta moved from per-conversation to per-message pricing in 2025: a delivered
 * outbound message is billed by its `pricing.category` (utility / marketing /
 * service / authentication), and `pricing.billable` is Meta's authoritative
 * charge flag. C3 persists that truth per message in `wa_message_statuses`; C4
 * turns it into real cost via the rate card below.
 *
 * Single source of truth, mirroring `plans.ts`: a frozen BASE constant, a zod
 * override schema, a parser that throws loudly on garbage, and a module-level
 * resolved export driven by the `META_RATE_CARD_OVERRIDES` env var (the escape
 * hatch to bump a rate without a deploy). The parser lives ONLY in this file.
 *
 * Currency discipline: every rate here is micro-EUR (€1 = 1_000_000 µEUR).
 * Meta cost is euro-denominated and MUST NOT be summed with or converted to the
 * micro-USD AI cost — they live in separate columns end to end.
 */
import { z } from 'zod';

export const META_PRICING_CATEGORIES = [
  'utility',
  'marketing',
  'service',
  'authentication',
] as const;
export type MetaPricingCategory = (typeof META_PRICING_CATEGORIES)[number];

/** Rate-card documentation constants (surfaced nowhere PT-facing). */
export const META_RATE_CARD_REGION =
  'Albania / Rest-of-Africa & other markets tier';
export const META_RATE_CARD_CURRENCY = 'EUR' as const;
/** Cost unit: micro-EUR per billable message (€1 = 1_000_000). */
export const META_RATE_CARD_UNIT = 'micro-EUR per billable message' as const;
/**
 * ⚠ CONFIRM — retrieval date + authoritative source are placeholders. The
 * pre-launch "Meta AI-provider/pricing policy re-check" task fills these in
 * together with the marketing/authentication rates below.
 */
export const META_RATE_CARD_SOURCE =
  'Meta WhatsApp Business per-message pricing — ⚠ CONFIRM source URL + retrieval date pre-launch';

/**
 * Base per-category rate card, in micro-EUR per BILLABLE message.
 *
 * - `utility`: €0.021 (21_000 µEUR) — task-confirmed for Medium's markets.
 * - `service`: €0 — free-form / service conversations are free since
 *   2025-07-01 (task-confirmed).
 * - `marketing`: ⚠ CONFIRM — ships as €0 PLACEHOLDER. Do NOT treat as real.
 * - `authentication`: ⚠ CONFIRM — ships as €0 PLACEHOLDER. Do NOT treat as real.
 *
 * Medium's own MVP outbound is utility reminders + free service replies, so the
 * two ⚠ CONFIRM zeros only undercount marketing/authentication traffic Medium
 * does not send at MVP. The pre-launch policy re-check replaces them with the
 * real rates (or an env override lands sooner via META_RATE_CARD_OVERRIDES).
 */
export const BASE_META_RATE_CARD_MICRO_EUR: Readonly<
  Record<MetaPricingCategory, number>
> = Object.freeze({
  utility: 21_000,
  marketing: 0, // ⚠ CONFIRM placeholder — not a real Meta price.
  service: 0,
  authentication: 0, // ⚠ CONFIRM placeholder — not a real Meta price.
});

/**
 * Price for a billable message whose category is missing or unrecognised. Set
 * to the utility rate (not €0) so an unknown BILLABLE message is never silently
 * free — callers log the offending category and someone reconciles the rate
 * card. Deliberately conservative: over-count rather than under-count real cost.
 */
export const META_RATE_CARD_UNKNOWN_CATEGORY_MICRO_EUR = 21_000;

/** How many trailing UTC days the rollup re-aggregates each run (flips late-arriving estimates → actual). */
export const META_ROLLUP_LOOKBACK_DAYS = 3;

const rateCardOverrideSchema = z
  .object({
    utility: z.number().int().nonnegative(),
    marketing: z.number().int().nonnegative(),
    service: z.number().int().nonnegative(),
    authentication: z.number().int().nonnegative(),
  })
  .partial();

export type MetaRateCardOverrides = z.infer<typeof rateCardOverrideSchema>;

/**
 * Parse `META_RATE_CARD_OVERRIDES`. Empty/undefined means no overrides; anything
 * else must be valid JSON of `{ category: microEurInt }` pairs. Throws at module
 * init on garbage — a mistyped override must fail loudly, not silently run with
 * a wrong price.
 */
export function parseMetaRateCardOverrides(
  raw: string | undefined,
): MetaRateCardOverrides {
  if (!raw || !raw.trim()) return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `META_RATE_CARD_OVERRIDES is not valid JSON: ${(error as Error).message}`,
    );
  }
  return rateCardOverrideSchema.parse(json);
}

/** Build the effective rate card: base rates overlaid with env overrides. */
export function resolveMetaRateCard(
  raw: string | undefined,
): Record<MetaPricingCategory, number> {
  const overrides = parseMetaRateCardOverrides(raw);
  return {
    utility: overrides.utility ?? BASE_META_RATE_CARD_MICRO_EUR.utility,
    marketing: overrides.marketing ?? BASE_META_RATE_CARD_MICRO_EUR.marketing,
    service: overrides.service ?? BASE_META_RATE_CARD_MICRO_EUR.service,
    authentication:
      overrides.authentication ??
      BASE_META_RATE_CARD_MICRO_EUR.authentication,
  };
}

/** The live rate card for this process (base ± env overrides). */
export const META_RATE_CARD_MICRO_EUR: Record<MetaPricingCategory, number> =
  resolveMetaRateCard(process.env.META_RATE_CARD_OVERRIDES);

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? '').trim().toLowerCase();
}

function isKnownCategory(normalized: string): normalized is MetaPricingCategory {
  return (META_PRICING_CATEGORIES as readonly string[]).includes(normalized);
}

/**
 * Rate (micro-EUR per billable message) for a raw Meta pricing category. Case-
 * and whitespace-insensitive. Unknown/blank categories fall back to the utility
 * rate (never €0) — the caller decides whether to log the unknown category.
 */
export function metaRateForCategory(
  category: string | null | undefined,
): number {
  const normalized = normalizeCategory(category);
  return isKnownCategory(normalized)
    ? META_RATE_CARD_MICRO_EUR[normalized]
    : META_RATE_CARD_UNKNOWN_CATEGORY_MICRO_EUR;
}

/**
 * Fold a map of `category → billable-message count` into total Meta cost. Keys
 * are normalized (lower/trim); non-positive/non-finite counts are ignored.
 * Returns the micro-EUR total, the total billable-message count, and the sorted
 * list of unrecognised categories that were priced at the unknown fallback
 * (empty when every category was recognised) so the caller can log them.
 */
export function metaCostFromBillableCounts(
  billableByCategory: Record<string, number> | Map<string, number>,
): { microEur: number; billableMessages: number; unknownCategories: string[] } {
  const entries =
    billableByCategory instanceof Map
      ? Array.from(billableByCategory.entries())
      : Object.entries(billableByCategory);

  let microEur = 0;
  let billableMessages = 0;
  const unknownCategories = new Set<string>();

  for (const [rawCategory, rawCount] of entries) {
    const count = Number(rawCount);
    if (!Number.isFinite(count) || count <= 0) continue;
    const n = Math.round(count);
    const normalized = normalizeCategory(rawCategory);
    if (!isKnownCategory(normalized)) unknownCategories.add(normalized);
    microEur += metaRateForCategory(rawCategory) * n;
    billableMessages += n;
  }

  return {
    microEur,
    billableMessages,
    unknownCategories: Array.from(unknownCategories).sort(),
  };
}

// ---------------------------------------------------------------------------
// FALLBACK ONLY — legacy per-conversation estimate.
//
// Used exclusively when a PT-day has ZERO `wa_message_statuses` rows (no Meta
// delivery truth yet), so the admin dashboard still shows *something* instead
// of €0. Any day with at least one status row is priced from the rate card
// above and marked `meta_cost_source = 'actual'`; this estimate marks the row
// `'estimated'`. Retained deliberately — do not delete.
// ---------------------------------------------------------------------------

/** €0.06 expressed in micro-EUR — the per-conversation fallback rate. */
export const DEFAULT_META_CONVERSATION_COST_MICRO_EUR = 60_000;

/**
 * Estimate the Meta conversation cost (in micro-EUR) for `count` billable
 * conversations. Non-finite or negative counts clamp to 0; the count is rounded
 * to a whole number of conversations before multiplying by `rate`. FALLBACK
 * ONLY — see the block comment above.
 */
export function estimateMetaConversationCostMicroEur(
  count: number,
  rate: number = DEFAULT_META_CONVERSATION_COST_MICRO_EUR,
): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.round(count)) * rate;
}
