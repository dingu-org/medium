/**
 * Meta (WhatsApp) conversation cost estimation for the Phase 11 cost dashboard.
 *
 * Meta moved from per-conversation to per-message pricing in 2025 and has
 * changed the model multiple times, so this stays a single easy-to-bump
 * calculator rather than a hard-coded price table. `60_000` micro-EUR (€0.06)
 * is a conservative per-conversation placeholder — refine when the per-message
 * model is wired.
 */

/** €0.06 expressed in micro-EUR. */
export const DEFAULT_META_CONVERSATION_COST_MICRO_EUR = 60_000;

/**
 * Estimate the Meta conversation cost (in micro-EUR) for `count` billable
 * conversations. Non-finite or negative counts clamp to 0; the count is rounded
 * to a whole number of conversations before multiplying by `rate`.
 */
export function estimateMetaConversationCostMicroEur(
  count: number,
  rate: number = DEFAULT_META_CONVERSATION_COST_MICRO_EUR,
): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.round(count)) * rate;
}
