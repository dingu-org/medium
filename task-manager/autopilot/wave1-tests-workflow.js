export const meta = {
  name: 'medium-wave1-test-foundation',
  description: 'Wave 1 Track A + item 8: repair the test suite, make it DB-independent, add CI, and unit-test the POK 404 branch',
  phases: [
    { title: 'Implement', detail: 'test repair chain, plus the POK unit test in parallel' },
    { title: 'Verify', detail: 'independent full-suite verification' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": multi-tenant SaaS letting solo physical therapists in Albania run patient bookings
over WhatsApp with an AI assistant, overseen from a mobile-first PWA. Repo: ${REPO}.
Read AGENTS.md first. Pre-launch, no real PT onboarded.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Serwist + Web Push, POK payments, Vercel, Tailwind 4 + shadcn/ui,
Vitest. UI copy is Albanian-only.

**Docker and the local Supabase stack are running.** \`pnpm test\` (unit), \`pnpm test:integration\`,
\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work. Do NOT start dev servers, deploy, or touch
any hosted database.

You are on branch \`prod-readiness\`. Commit your own work when it is green. Do NOT push, do NOT
merge, do NOT touch \`main\`. Conventional-commit style, and end the message with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

The full plan and its evidence are in task-manager/audits/2026-08-13-verification.md. The
orchestrator's directly-verified findings are in
task-manager/audits/2026-08-13-verified-by-orchestrator.md — trust those over anything else.

Baseline established by actually running the suite:
- \`pnpm test:integration\` on a clean local DB: 1 failing file / 8 failing tests, all in
  \`app/(dashboard)/chat/__tests__/actions.integration.test.ts\` under \`sendUpcomingReminderTemplate\`.
- Cause is a stale fixture (appointment hardcoded at 2026-08-01, now in the past), so the action
  correctly returns "Nuk ka takim të ardhshëm". It is a TEST bug, not an implementation bug. Do not
  "fix" the implementation.
- 27 test files hardcode absolute dates; exactly 1 freezes the clock.
- No CI exists. The Husky pre-commit hook runs lint + typecheck only.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean', description: 'True ONLY if the verification command actually passed. Never true on a hope.' },
    summary: { type: 'string', minLength: 100 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: {
      type: 'string',
      minLength: 40,
      description: 'The literal tail of the command output proving the result — pass or fail. Paste it, do not paraphrase.',
    },
    follow_ups: {
      type: 'array',
      description: 'Anything you found but deliberately did not fix, and why.',
      items: { type: 'string' },
    },
  },
}

phase('Implement')

const testChain = async () => {
  const step1 = await agent(
    `${CONTEXT}

TASK 1 of 3 — Repair the failing tests and stop the suite rotting with the wall clock.

**The operator's explicit instruction:** no test may hold a hard-coded absolute date. Dates must be
derived, not literal.

**How to satisfy that without introducing flakiness.** Do NOT simply replace literals with bare
\`new Date()\` offsets. Several assertions compare against \`formatAppointmentTime\` output, which is
both clock- and timezone-sensitive, so a run at 23:59 or across a DST boundary would produce a
different string and the test would flake. Instead, for every test whose behaviour depends on "now":

1. Freeze the clock at a fixed instant with \`vi.useFakeTimers()\` + \`vi.setSystemTime(...)\`.
   Choose the instant deliberately — avoid midnight, avoid a DST transition, and pick a weekday if
   availability logic cares about the day of week.
2. Derive every fixture RELATIVE to that frozen now — e.g. an appointment 24h out becomes
   \`new Date(Date.now() + 24 * 60 * 60 * 1000)\`, not a literal.
3. Restore real timers in teardown so no leakage between files.

The result: zero absolute date literals, and a suite that gives identical results on any day.
That satisfies the instruction (dates are computed, never hard-coded) while keeping determinism.

Watch for: fake timers can break code that awaits real I/O or uses timer-based polling. Vitest's
\`vi.useFakeTimers({ shouldAdvanceTime: true })\` or an explicit \`toFake\` list is usually the answer
when a frozen clock deadlocks a DB call — if a file fights the fake clock, prefer per-test freezing
over file-wide, and say so in your summary rather than silently leaving a literal behind.

Scope:
(a) Fix the 8 failures in \`app/(dashboard)/chat/__tests__/actions.integration.test.ts\` first and
    confirm they pass before touching anything else.
(b) Then sweep the other 26 files that hardcode \`new Date('20XX-…')\`. Find them with:
    \`grep -rlE "new Date\\('20[0-9]{2}-" --include="*.test.ts" --include="*.test.tsx" . | grep -v node_modules\`
    2026-09-01 and 2026-10-24/25 are the next literals due to detonate.
(c) Leave purely-formatting fixtures alone — a test that only checks "this instant renders as this
    string" is legitimately clock-independent. Record which files you judged that way, by name, so
    the next person can tell a deliberate decision from an oversight.

VERIFY: \`pnpm test:integration\` must return 64/64 files and 608/608 tests, and \`pnpm test\` must
stay green. Paste the real summary lines. Then commit.`,
    { label: 'w1:freeze-clock', phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const step2 = await agent(
    `${CONTEXT}

TASK 2 of 3 — Make the integration suite independent of leftover local database state.

Previous task in this chain reported: ${JSON.stringify(step1 && step1.summary)}

**The evidence.** Two consecutive \`pnpm test:integration\` runs on the same commit gave different
results: first run (DB dirty from an earlier \`pnpm seed:qa\`) 3 files / 23 tests failing; second run
1 file / 8 tests failing. So 15 failures are pure ambient-state noise. A developer cannot tell "I
broke something" from "my database was dirty", and this suite cannot become a CI gate until it is
deterministic.

Do this:
1. Reproduce it. Run \`pnpm seed:qa\`, then \`pnpm test:integration\`, and capture which files fail
   that do not fail against a clean database. Two files beyond the chat actions one are expected —
   identify them precisely rather than guessing.
2. Fix their setup so each test asserts on rows IT created, rather than on table-wide counts or on
   "the only row in the table". Scope queries by the ids the test inserted, or truncate the tables
   it owns in \`beforeEach\`. Prefer scoping over truncation where both work — truncation between
   tests is slow and can fight foreign keys.
3. Re-run the dirty/clean pair twice each and confirm identical results all four times.

Note: integration runs wipe \`auth.users\`, so a reseed is needed before any signed-in browser QA.
Mention that in your summary if you leave the DB in a seeded state.

VERIFY: \`pnpm seed:qa && pnpm test:integration\` gives the same green as a clean run, twice in a
row. Paste both summary lines. Then commit.`,
    { label: 'w1:db-isolation', phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const step3 = await agent(
    `${CONTEXT}

TASK 3 of 3 — Add the CI gate. This repo has no \`.github/\` at all, which is the root cause of the
8 failures surviving twelve days unnoticed.

Previous steps reported:
- clock: ${JSON.stringify(step1 && step1.summary)}
- isolation: ${JSON.stringify(step2 && step2.summary)}

Only proceed if both are green — if either failed, fix the CI config to match reality but say so
loudly in your summary rather than papering over a red suite.

Build \`.github/workflows/ci.yml\`, triggered on push and pull_request to \`main\` and \`preview\`:

1. Checkout, pnpm, Node (match the version in package.json / .nvmrc if present, else Node 24 LTS).
2. Install the Supabase CLI via \`supabase/setup-cli\` and run \`supabase start\`. **The full local
   stack is required — NOT a bare postgres service container.** \`tests/rls/isolation.integration.test.ts\`
   drives requests as anon/authenticated through PostgREST and needs GoTrue's \`auth.users\` table.
   A plain postgres container will fail these tests in a way that looks like a code bug.
3. \`cp .env.example .env\` — its values are the standard local Supabase demo keys and already match
   \`supabase start\`'s defaults, so **no repository secrets are required**. Confirm this by reading
   \`.env.example\` rather than assuming it.
4. Run \`pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration\`.
   \`tests/setup/global.ts\` applies \`drizzle/migrations\` itself, so no separate migration step.
5. Cache pnpm's store and, if practical, the Supabase Docker images — the image pull dominates a
   cold run.

**Prove the gate actually catches things.** A CI workflow that runs but never fails is theatre.
Temporarily revert migration 0024's revoke of INSERT/UPDATE/DELETE from anon+authenticated, confirm
\`tests/rls/coverage.integration.test.ts\` goes red locally, then restore it. Report that you did
this and what the failure looked like. You cannot run GitHub Actions from here, so local proof of
the failing assertion is the substitute — be honest that CI itself is unexercised until it runs on a
real push.

Also note in your summary that the workflow must be made a required status check in the repo
settings, which only the operator can do.

VERIFY: the workflow file is valid YAML (\`python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"\`),
every command in it passes locally in the same order, and the revert experiment above went red then
green. Then commit.`,
    { label: 'w1:ci-gate', phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  return { step1, step2, step3 }
}

const pokTest = () =>
  agent(
    `${CONTEXT}

TASK — Unit-test POK \`getOrder\`'s 404-vs-expired classification.

\`lib/billing/__tests__/pok-client.test.ts\` has 5 tests (token caching, expiry, 401-retry, timeout,
create-order body). None call \`getOrder\`, so the money-correctness branch in \`lib/billing/pok/client.ts\`
around lines 230-238 — \`if (res.status === 404) throw new PokNotFoundError(...)\` ahead of the generic
\`!res.ok\` path — has no unit coverage. It is exercised only by Docker-gated integration tests, which
in practice almost never run.

Add 2-3 tests using the file's existing \`jsonResponse(status, body)\` fetch-mock helper:
- 404 rejects with \`PokNotFoundError\` carrying status 404
- a non-404 non-ok status (e.g. 500) rejects with a plain \`PokError\`, NOT \`PokNotFoundError\`
- 200 returns the parsed order

Read the existing tests first and match their style, naming and mocking exactly — do not introduce a
new mocking approach into a file with an established one.

**Prove the tests are real.** Temporarily delete the 404 branch in \`client.ts\` and confirm the
\`PokNotFoundError\` case fails while the others stay green. Restore it. Report what you saw. A test
that passes against a deleted implementation is worthless, and this is the cheap way to know.

This touches only \`lib/billing/\` and is independent of the test-suite work happening in parallel —
do not edit any file outside \`lib/billing/\`.

VERIFY: \`pnpm vitest run --project unit lib/billing/__tests__/pok-client.test.ts\` passes, and the
deletion experiment failed as expected. Then commit.`,
    { label: 'w1:pok-unit-test', phase: 'Implement', schema: RESULT_SCHEMA, model: 'opus', effort: 'high' },
  )

const [chain, pok] = await parallel([testChain, pokTest])

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Four implementation tasks just ran on branch \`prod-readiness\`.
They each claim success. Your job is to check, not to trust — implementers routinely report green
on a suite they did not actually run to completion, or commit a change that passes in isolation and
breaks a neighbour.

What they claim:
${JSON.stringify({ chain, pok }, null, 1)}

Do this:
1. \`git log --oneline\` and \`git status\` — what actually landed? Is the tree clean?
2. Run the full gate yourself, in order, and capture real output:
   \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`, \`pnpm test:integration\`, \`pnpm build\`.
3. **Check the operator's instruction was honoured**: no test may hold a hard-coded absolute date.
   Run \`grep -rnE "new Date\\('20[0-9]{2}-" --include="*.test.ts" --include="*.test.tsx" . | grep -v node_modules\`
   and report every remaining hit. Some may be legitimate (a purely-formatting fixture) — the
   implementer was told to name those deliberately. Cross-check the survivors against what they said
   they judged clock-independent. An unexplained survivor is a failure of the task.
4. **Check the suite really is DB-independent**: run \`pnpm seed:qa\` then \`pnpm test:integration\`
   and confirm it matches a clean run.
5. **Check the CI workflow is honest**: read \`.github/workflows/ci.yml\` and confirm every command
   in it actually passes locally, that it uses the full Supabase stack rather than a bare postgres
   container, and that it requires no secrets that do not exist.
6. If anything is red or any claim does not hold, FIX it if the fix is small and obvious, and say
   what you fixed. If it is not small, leave it and report precisely.

Set \`done\` true only if the whole gate is green and the operator's dynamic-date instruction is
genuinely satisfied. Paste real command output in \`verification_output\` — the actual summary lines,
not a paraphrase. If you cannot run something, say so; do not infer a result.`,
  { label: 'w1:verify', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { chain, pok, verification }
