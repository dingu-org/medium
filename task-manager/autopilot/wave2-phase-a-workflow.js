export const meta = {
  name: 'medium-reminders-off-phase-a',
  description: 'Phase 0 + A: add the remindersEnabled flag and gate all eight reminder boundaries',
  phases: [
    { title: 'Flag', detail: 'the switch, plus the vitest env that keeps existing tests green' },
    { title: 'Gate', detail: 'five independent boundary gates in parallel' },
    { title: 'Verify', detail: 'independent verification of the whole phase' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": multi-tenant SaaS for booking appointments over WhatsApp with an AI assistant.
Repo: ${REPO}. Read AGENTS.md first. Pre-launch, no real customer onboarded.

**PRODUCT FACT:** this is NOT a medical product. It is general appointment booking serving barbers,
nail salons and physios. Customer-facing Albanian copy must read correctly for a nail salon.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Vitest. Docker and the local Supabase stack ARE running, so
\`pnpm test\`, \`pnpm test:integration\`, \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work.
Do NOT start dev servers, deploy, or touch any hosted database.

**Test isolation warning:** \`tests/setup/global.ts\` runs \`DELETE FROM auth.users\` at global
setup, so two overlapping \`pnpm test:integration\` runs destroy each other's fixtures. Other agents
run in parallel. If you see FK violations in suites you did not touch, re-run alone before believing
them. Prefer targeted runs (\`pnpm vitest run --project integration <path>\`) while iterating.

Branch: \`prod-readiness\`. Commit your own work when green. Do NOT push, merge, or touch \`main\`.
Conventional commits ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Baseline, all passing: unit 68 files / 682 tests, integration 65 files / 653 tests.
Never introduce a hard-coded absolute date in a test — use \`tests/support/clock.ts\`.
Exclude \`.claude/\` from any repo-wide grep: a duplicate git worktree lives there.

## Why this work exists

Reminders are being declared a separate, undeveloped feature. They need their own analysis (per-
business vs shared Meta templates, managing templates across many numbers). Until then they keep
dragging the message pipeline around — they hold first claim on every inbound message.

The owner chose to **turn them off, not delete them**: ~58 non-test files reference reminders, and
they are a *billed* feature (\`remindersPerMonth\`: 10 Free, 250 Solo) woven into billing, GDPR
export/erasure and the read models. The code and its ~35 test files stay as documentation; the
feature stops running.

Full approved plan: \`/Users/kd/.claude/plans/okay-then-it-s-decided-dreamy-pancake.md\`. Read it.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean', description: 'True ONLY if the verification command actually passed.' },
    summary: { type: 'string', minLength: 120 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: { type: 'string', minLength: 40, description: 'Literal command output. Paste it.' },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Flag')
const flag = await agent(
  `${CONTEXT}

TASK — Phase 0: the switch. Everything else depends on this, so it lands alone and first.

**Create \`lib/reminders/flag.ts\`**, following the existing \`resolveAppEnv(env = process.env)\`
pattern in \`lib/env/app-env.ts\`:

\`\`\`ts
export function remindersEnabled(env = process.env): boolean {
  return env.REMINDERS_ENABLED === 'true';   // default OFF everywhere
}
\`\`\`

A lazy per-call read, deliberately not a module-init constant like \`PLANS\` — so tests can flip it
without module-cache games, and re-enabling later is an env change rather than a deploy. All
consumers are server-side; no \`NEXT_PUBLIC_\` variant. Write a doc comment explaining *why* the
feature is off (reminders need their own template/multi-tenancy analysis first) and what must be
revisited before re-enabling, so someone finding this in six months understands it is deliberate.

**Add \`REMINDERS_ENABLED\` to \`lib/env/env-vars.ts\`** — \`requiredIn: NONE\`, \`mustDiffer: false\`,
\`secret: false\`, with a description — so \`pnpm check:env\` documents it.

**Keep the ~35 existing reminder test files green with ZERO edits.** In \`vitest.config.ts\`, set
the root-level \`test.env\` to \`{ ...env, REMINDERS_ENABLED: 'true' }\`. Both projects inherit it,
the same way they already inherit \`DATABASE_URL\`. Every existing suite then runs with the feature
ON exactly as today, preserving them as living documentation of a dormant feature. Read the config
first and match how \`env\` is currently assembled — do not guess.

**Write \`lib/reminders/__tests__/flag.test.ts\`**: unset → false; \`'true'\` → true; \`'false'\`,
\`'1'\`, \`'TRUE'\`, garbage → false (be explicit that only the exact string \`'true'\` enables it).
Use \`vi.stubEnv\` + \`vi.unstubAllEnvs()\` in \`afterEach\`, and confirm in the test itself that
\`stubEnv\` actually overrides the config-provided value — that mechanism is what every later
flag-off test depends on, so prove it here rather than assuming it.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test\` — unit count rises by the new flag tests and
NOTHING else moves. If any existing test changes result, the vitest env wiring is wrong; fix it
before committing. Paste the real summary lines. Then commit.`,
  { label: 'p0:flag', phase: 'Flag', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

phase('Gate')

const gates = [
  {
    key: 'a1-scheduling',
    title: 'A1 — stop scheduling and sending reminders',
    body: `Own ONLY \`lib/inngest/functions/send-reminder.ts\` and its tests.

Two run-time gates that read \`remindersEnabled()\` when they execute:

1. Top of the Inngest handler body, before \`computeReminderSchedule\`: if disabled,
   \`return { skipped: 'reminders_disabled' }\`. No \`reminder_jobs\` row is created, so new bookings
   show no badge at all (\`reminderBadge(null)\` returns null).
2. First check inside \`loadReminderAttempt\`, BEFORE the \`stale_run\` read: if disabled, return
   \`{ kind: 'skipped', reason: 'reminders_disabled' }\`. This drains runs that were already asleep
   when the flag flipped — they wake, park their row as \`skipped/reminders_disabled\`, and exit
   through the existing skip branch. \`reminder.skipped\` is not in \`NOTIFICATION_TYPES\`, so this
   produces no professional-facing noise.

**Do NOT unregister the function** in \`lib/inngest/functions.ts\`. Runs sleeping in
\`step.sleepUntil\` (up to 24h, plus ~18h of template-retry sleeps) would die as "function not
found" with their \`reminder_jobs\` rows frozen at \`scheduled\` forever. The in-function gates are
strictly better and this was an explicit plan decision — do not revisit it.

Add two unit cases to \`lib/inngest/functions/__tests__/send-reminder.test.ts\` with the flag
stubbed false: \`loadReminderAttempt\` skips before touching the DB, and the handler returns the
skip without creating a row. Existing tests stay untouched (flag ON via vitest config).`,
  },
  {
    key: 'a2-inbound',
    title: 'A2 — stop interpreting reminder replies',
    body: `Own ONLY \`lib/inngest/functions/handle-inbound-message.ts\` and its test file.

At line ~480:

\`\`\`ts
const deterministicReminders =
  !(context.assistantPaused || nonText) && remindersEnabled();
\`\`\`

That single edit is sufficient. With it false: \`claim\` short-circuits to \`'reminder'\` without
running the \`resolve-turn-precedence\` step, \`handleReminderResponse\` is never called, and the
message falls through to the normal AI turn.

\`runReminderTurn\` (\`lib/conversation/engine.ts:904\`) needs **no** gate — its only caller is
\`runReminderFallbackTurn\`, reachable only via \`reminder.kind === 'fallback'\`, which only
\`handleReminderResponse\` produces. Record that reasoning in a comment rather than adding a dead
belt-and-braces check.

Note for your own understanding (do not change it): an outstanding handoff offer still works while
reminders are off, because the engine's own anchor check at \`engine.ts:754\` is independent of
\`resolveInboundClaim\`. That whole mechanism is removed in a later phase, not this one.

Add an integration case to \`lib/inngest/functions/__tests__/handle-inbound-message.integration.test.ts\`:
flag stubbed false, a seeded \`sent\` reminder job, inbound "Ok" → the stubbed \`runTurn\` IS called,
the appointment stays \`pending\`, and no deterministic confirmation reply is persisted.`,
  },
  {
    key: 'a3-manual',
    title: 'A3 — gate the manual template send',
    body: `Own ONLY \`app/(dashboard)/chat/\` (actions, page, chat-thread) and \`components/chat/composer.tsx\`.

- Server-side gate is the real gate: first line of \`sendUpcomingReminderTemplateImpl\` in
  \`app/(dashboard)/chat/actions.ts\` — if disabled, return a refusal with Albanian copy
  (e.g. \`'Kujtesat janë të çaktivizuara.'\`). Match the shape the existing refusals in that
  function return.
- Thread \`remindersEnabled()\` from the chat server page down as a prop, and in
  \`chat-thread.tsx\` (~line 627-629) AND with it in the \`templateAvailable\` computation.
- \`components/chat/composer.tsx\` needs no change — \`templateAvailable={false}\` already hides the
  button.

**Know what you are doing here and write it in your summary.** In the \`windowClosed\` composer
state this button is the professional's ONLY way to message a customer more than 24h after their
last message — WhatsApp permits nothing but an approved template outside that window. Gating it
leaves that state with an explanation card and no action. The owner was shown this consequence and
chose it deliberately ("fully off means fully off"), treating re-engagement as its own future
feature. Do not soften or work around the decision; just make sure the resulting UI state reads
sensibly rather than looking broken.

Add an integration case to \`app/(dashboard)/chat/__tests__/actions.integration.test.ts\`: flag off
→ refused, no Graph API call, no \`reminder_jobs\` row. The ~10 existing cases stay green.`,
  },
  {
    key: 'a4-billing',
    title: 'A4 — quiet the billing usage monitor',
    body: `Own ONLY \`lib/inngest/functions/billing-usage-monitor.ts\` and its tests.

Wrap the reminder half (\`getReminderUsage\` + the predictive warning, ~lines 46-61) in
\`if (remindersEnabled())\`. The conversation half keeps running — conversations are still metered
and still capped.

Add a unit case driving \`runBillingUsageMonitor\` with the flag stubbed false and quota-exceeding
reminder fixtures: \`reminderWarnings === 0\`, while the conversation warning still fires.`,
  },
  {
    key: 'a5-ui',
    title: 'A5 — hide every reminder surface, including pricing',
    body: `Own ONLY the UI files listed below. Do NOT touch anything under \`lib/inngest/\`,
\`lib/billing/plans.ts\`, or \`app/(dashboard)/chat/\`.

Server components read \`remindersEnabled()\` directly; client components take a boolean prop.

- **Today attention** — \`lib/today/queries.ts\`: skip the unanswered-reminder query (~lines 220-254)
  when off, so \`kind: 'reminder'\` rows never reach the client.
- **Calendar dot** — \`app/(dashboard)/calendar/calendar-client.tsx\` \`statusDot\` (~lines 41-57):
  skip the two reminder-driven branches.
- **Appointment sheet** — \`components/appointments/appointment-sheet.tsx\`: do not render
  \`ReminderBadge\`.
- **Clients screen** — \`lib/clients/queries.ts\` reminder field and the \`reminderOptedOutAt\` chip
  in \`app/(dashboard)/clients/[id]/client-detail.tsx\`: hide at render.
- **Billing meter** — \`app/(dashboard)/settings/billing/page.tsx\` (~line 90): do not render the
  reminders \`UsageMeter\`.
- **Settings → WhatsApp** — \`app/(dashboard)/settings/whatsapp/page.tsx\` (~lines 51-55): hide the
  section label, \`TemplatePreview\` and the template note.
- **Pricing bullets on THREE surfaces** — \`app/onboarding/page.tsx\` (~38, 51),
  \`app/_landing/landing-page.tsx\` (~340, 377), and \`app/(legal)/help/plans/page.tsx\` (~31, 41).
  All six \`<li>\`s. Missing the landing page would leave the PUBLIC site advertising a disabled
  feature — check each path yourself rather than trusting these line numbers.

**Leave \`remindersPerMonth\` in \`lib/billing/plans.ts\` untouched** — dormant config, an explicit
owner decision, so nothing needs rewriting when reminders return. Leave \`featReminders\` in
\`lib/i18n/dict/billing.ts\` too; an unused dict key is inert.

Existing rendering tests stay green (they test the ON path). Add one unit for a flag-off render
path.`,
  },
]

const gateResults = await parallel(
  gates.map((g) => () =>
    agent(
      `${CONTEXT}

Phase 0 landed: ${JSON.stringify(flag && flag.summary)}

Import the flag with \`import { remindersEnabled } from '@/lib/reminders/flag';\` (confirm the
actual export path from the committed file rather than trusting this line).

TASK — ${g.title}

${g.body}

**File ownership matters.** Four other agents are editing this repo in parallel on disjoint files.
Stay strictly inside the files named in your task. If you believe you must touch a file outside
them, do NOT — report it in \`follow_ups\` instead.

VERIFY: \`pnpm typecheck && pnpm lint\`, then the targeted tests for your area, then \`pnpm test\`.
Paste real output. Then commit just your files.`,
      { label: `gate:${g.key}`, phase: 'Gate', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
    ),
  ),
)

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Phase 0 and five boundary gates just landed on \`prod-readiness\`.
Check, do not trust.

Claims:
${JSON.stringify({ flag, gates: gateResults }, null, 1)}

1. \`git log --oneline\`, \`git status\`. What landed? Any uncommitted code?
2. Run the full gate and paste real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`. Baseline was unit 68 files/682, integration 65/653 —
   counts should rise slightly and EVERYTHING must pass.
3. **Prove the switch actually switches.** With \`REMINDERS_ENABLED\` unset, exercise the pipeline
   and confirm: booking an appointment creates NO \`reminder_jobs\` row; an inbound "Ok" against a
   seeded sent reminder reaches the AI turn instead of the deterministic confirm; the manual send
   action refuses. Write a temporary probe if no test covers it, then delete the probe and say so.
4. **Prove the existing suite really is untouched.** The whole design rests on the vitest env
   keeping ~35 reminder test files green with zero edits. Confirm via \`git diff\` that no existing
   reminder test file was modified, and that they pass. If any were edited, that is a failure of
   the approach — report it loudly.
5. **Hunt for a missed boundary.** The plan names eight. Grep for reminder entry points the five
   agents might have missed — anything that schedules, sends, interprets, or displays reminders and
   does NOT consult the flag. Report every one you find, with file:line. A missed boundary means
   reminders half-run, which is worse than either state.
6. **Check the three pricing surfaces specifically** — onboarding, the public landing page, and the
   legal help/plans page. The landing page is public; leaving a reminder bullet there advertises a
   disabled feature. Verify all three by reading them.
7. Fix anything small and obviously wrong; report anything larger without fixing.

Set \`done\` true only if the gate is green, the switch demonstrably switches, no existing reminder
test was edited, and you found no ungated boundary. Paste real command output; if you cannot run
something, say so rather than inferring.`,
  { label: 'verify:phase-a', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { flag, gates: gateResults, verification }
