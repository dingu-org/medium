/**
 * The kill switch for appointment reminders.
 *
 * **Reminders are off by default, deliberately, in every environment.** They
 * are not broken and they are not deleted — the feature is parked until it gets
 * the design work it never had. Two questions have to be answered before it can
 * run again:
 *
 * 1. **Templates.** WhatsApp reminders go out as approved Meta templates. Does
 *    every business get its own template, or do they share one? Who creates,
 *    submits and re-submits them, and what happens while approval is pending
 *    across many numbers?
 * 2. **Turn precedence.** While reminders run they hold first claim on every
 *    inbound message, so a bare "PO" is read as a reminder confirmation before
 *    the assistant ever sees it. That collision is what forced this switch; the
 *    replacement design has to say who reads a message first.
 *
 * Until both are answered the code and its tests stay in the repository as
 * documentation of how the feature behaved, and this flag stops it running.
 * `remindersPerMonth` also stays in `lib/billing/plans.ts` as dormant config —
 * reminders are a billed feature and the plan shapes outlive this pause.
 *
 * **Before re-enabling**, re-read the two questions above, and check that the
 * gated boundaries (scheduling, inbound reply handling, the manual template
 * send, the billing monitor, and the UI surfaces) are still the complete set.
 *
 * ---
 *
 * Read lazily on every call rather than captured in a module-level constant,
 * following `resolveAppEnv(env = process.env)` in `lib/env/app-env.ts`:
 *
 * - re-enabling is an environment change, not a deploy;
 * - tests flip it with `vi.stubEnv` without module-cache games.
 *
 * Every consumer is server-side, so there is deliberately no `NEXT_PUBLIC_`
 * twin — a server component reads this and passes a boolean prop down.
 */

type EnvRecord = Readonly<Record<string, string | undefined>>;

/**
 * True only for the exact string `'true'`. Anything else — unset, `'1'`,
 * `'TRUE'`, `'yes'`, a typo — leaves reminders off, so a misconfigured value
 * fails closed rather than quietly starting a parked feature.
 */
export function remindersEnabled(env: EnvRecord = process.env): boolean {
  return env.REMINDERS_ENABLED === 'true';
}
