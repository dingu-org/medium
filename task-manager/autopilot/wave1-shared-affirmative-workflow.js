export const meta = {
  name: 'medium-shared-affirmative',
  description: 'Make the reminder parser and the handoff offer agree on what "yes" means, and write the escalation decisions log',
  phases: [
    { title: 'Build', detail: 'shared affirmative parser, plus the decisions log in parallel' },
    { title: 'Verify', detail: 'independent adversarial verification' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": a multi-tenant SaaS for booking appointments over WhatsApp with an AI assistant.
Repo: ${REPO}. Read AGENTS.md first. Pre-launch, no real customer onboarded.

**CRITICAL PRODUCT FACT:** this is **NOT a medical product**. It is general appointment booking and
will serve barbers, nail salons and similar businesses as well as physiotherapists. Patient-facing
copy must read correctly for a nail salon. Deterministic medical/safety detection was deliberately
deleted on 2026-08-14. Do not reintroduce it.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Vitest. Patient-facing copy is Albanian.

**Docker and the local Supabase stack are running.** \`pnpm test\`, \`pnpm test:integration\`,
\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work. Do NOT start dev servers, deploy, or touch
any hosted database.

**Test isolation warning:** \`tests/setup/global.ts\` runs \`DELETE FROM auth.users\` at global
setup, so two overlapping \`pnpm test:integration\` runs destroy each other's fixtures. If you see FK
violations in suites you did not touch, re-run alone before believing them.

Branch: \`prod-readiness\`. Commit when green. Do NOT push, merge, or touch \`main\`. Conventional
commits ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Baseline, all passing: unit 68 files / 645 tests, integration 65 files / 642 tests.
Use \`tests/support/clock.ts\` for anything needing a stable clock. Never introduce a hard-coded
absolute date in a test.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string', minLength: 150 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: { type: 'string', minLength: 40 },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Build')

const sharedParser = () =>
  agent(
    `${CONTEXT}

TASK — Make the two subsystems agree on what "yes" means.

**The defect, measured by a verifier.** Two subsystems both claim a one-word reply and they disagree
about what counts as an affirmative:

- \`lib/reminders/parse-response.ts:21\` — confirm set is
  \`['konfirmo','konfirmoj','dakord','po','ok','okay']\`, and it accepts \`po\` **plus one more
  word** (\`MAX_PROGRESSIVE_PARTICLE_WORDS = 2\`, line ~174), with deliberate handling because
  Albanian \`po\` is also the progressive particle ("Po pyesja…" = "I was asking…").
- \`lib/conversation/handoff-offer.ts:85\` — \`isHandoffAcceptance\` demands **exact equality** with
  the acceptance word.

Commit \`c1fc1d8\` added a most-recent-question-wins precedence rule, but it only weighs messages the
handoff offer *could* claim. So anything the offer cannot claim never reaches the comparison at all.
Measured: with the offer as the newer question by 85 minutes, \`"po faleminderit"\` ("yes, thank
you") is taken by the reminder, the appointment is confirmed, nothing escalates, and the patient's
question is silently dropped — the exact bug \`c1fc1d8\` set out to fix, just narrower.

**The owner's decision (2026-08-14): remove the asymmetry.** Both subsystems must use ONE shared
definition of an affirmative, so the timestamp rule decides who gets the message rather than a
spelling technicality.

Implement:

1. Extract the affirmative detection from \`lib/reminders/parse-response.ts\` into a shared module.
   Keep every hard-won behaviour intact — the diacritic/apostrophe folding, the ambiguous-keyword
   handling, and especially the progressive-particle guard. Those comments record real production
   bugs; read them before moving anything, and carry the comments across.
2. Have \`isHandoffAcceptance\` use the same shared function, so the offer accepts exactly the forms
   the reminder does — including \`dakord\`, \`ok\`, \`okay\`, and \`po\` + one word.
3. The precedence rule in \`resolveInboundClaim\` then does the real work: when both subsystems
   could claim the message, the most recently asked question wins.

**Think about, and state your reasoning on, this risk:** broadening the offer's acceptance means a
casual \`"ok"\` could now accept an outstanding offer. The next-message-only rule bounds this
heavily — the offer only lives for exactly one message — but say explicitly whether you think the
bound is sufficient, and if not, what you would do instead. Do not silently widen the blast radius.

**Do not** change the offer copy's instruction to reply with the acceptance word. Telling the
patient one clear word is good UX; accepting their natural variations as well is the fix.

VERIFY — tests that must exist and must fail against the pre-fix code (prove this by ablation:
revert the behaviour, watch them fail, restore):
- \`"po faleminderit"\` with the offer as the newer question → **escalates**, appointment NOT confirmed
- \`"po faleminderit"\` with the reminder as the newer question → confirms, no escalation
- \`"dakord"\` / \`"ok"\` accept an outstanding offer
- \`"Po pyesja për oraret"\` (progressive particle, "I was asking about the hours") → NOT an
  affirmative for either subsystem; it must reach the model as an ordinary question
- every existing reminder-confirmation test still passes unchanged

Then \`pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration\` green. Paste real summary
lines. Commit.`,
    { label: 'fix:shared-affirmative', phase: 'Build', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

const decisionsLog = () =>
  agent(
    `${CONTEXT}

TASK — Write the missing decisions-log entries in \`task-manager/progress.md\`.

You are writing documentation only. **Do not modify any code, test, or config file.** Another agent
is working in \`lib/\` in parallel — touch only \`task-manager/progress.md\`.

Three significant behavioural decisions shipped on 2026-08-14 and NONE is recorded in the decisions
log. That log is what stops a future reader unpicking a deliberate choice as if it were a bug, and
two of these look exactly like regressions if you meet them cold.

Read the log's existing entries first and match their voice precisely: newest first, dated, dense,
explaining *why* and what was considered and rejected, naming files and symbols. The existing
2026-08-05 entry on reasoning/maxOutputTokens is the standard to hit.

Reconstruct the facts from the commits and the code — do not invent detail. The relevant commits:
\`94cf336\`, \`4dcb904\`, \`e585b7a\`, \`5777b0a\`, \`c1fc1d8\`, \`6e45eab\`, \`73e4ee7\`, \`794d61b\`.

**Entry 1 — deterministic escalation detection deleted.** The five-category detector in
\`lib/conversation/safety.ts\` (human_requested, urgent_health_concern, legal_or_billing,
insurance_question, high_frustration) and the \`aiEscalationKeyword\` setting were deleted outright,
including the medical-distress patterns. **The reason is the single most important thing in this
entry:** the owner established that Medium is a general appointment-booking product serving barbers,
nail salons and similar businesses, not a medical product — *"this app is not to be designed to
handle emergencies"*. Emergency detection inside a barber's booking assistant was a half-built
medical feature the product does not want. Record that anyone reading this diff as a safety
regression and "restoring" it would be reversing a deliberate product decision. Note the executable
tripwire test that now asserts HELP / NDIHMË / "Kam dhimbje në gjoks" / "Dua të flas me një person"
all reach the model. Note what was PRESERVED and why: \`escalateToHuman\`, the \`escalate_to_human\`
tool, and \`runFailedTurnHandoff\` — a failed model turn still escalates automatically, which is the
remaining safety net.

**Entry 2 — escalation is now an AI-decided offer the patient must accept.** The AI decides it
cannot or should not answer; one static vertical-agnostic message offers to pass the question on;
the patient accepts with a word; **only the immediately-next message can accept**. On acceptance the
professional is notified and the AI goes silent, unchanged. Record the design rationale, and the
deliberate omission of emergency guidance from the message.

**Entry 3 — the "PO" collision and the most-recent-question-wins rule.** This is the subtle one.
\`lib/reminders/parse-response.ts\` treats \`po\` as appointment confirmation and the handoff offer
also uses it; the reminder handler runs before the engine and returns early, so a bare "PO" with
both outstanding confirmed the appointment and silently dropped the escalation. The rule chosen:
whichever question was asked most recently wins, because both orderings genuinely occur. Record the
tie-break (strict \`>\`, so an exact tie goes to the reminder — reachable because Postgres keeps
microseconds and JS Date truncates to milliseconds), that when the reminder wins the offer lapses,
and the transactionality fix (escalate before disarming the anchor, so a crash leaves a retry that
still escalates).

Also record two **unintended** consequences a verifier found, plainly rather than defensively: the
precedence gate runs before the takeover check, so a professional's manual takeover now suppresses a
reminder confirmation it previously produced; and the collision tests mirror the Inngest body rather
than executing it, so they would not catch the real handler being wired in the wrong order.

Finally, update the phase status table and the "In flight" / "Recent sessions" sections to reflect
where Wave 1 actually got to. Do not overstate: several items are verified locally but have never
run in CI, and the Embedded Signup v4 migration is unproven until a live phone test.

VERIFY: \`pnpm lint\` stays green (markdown is not linted, but confirm you broke nothing), and the
file reads consistently with its existing entries. Commit with a docs(task-manager) message.`,
    { label: 'docs:decisions-log', phase: 'Build', schema: RESULT_SCHEMA, model: 'fable', effort: 'max' },
  )

const [parser, docs] = await parallel([sharedParser, decisionsLog])

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Two pieces of work just landed on \`prod-readiness\`: a shared
affirmative parser, and the decisions log. Check, do not trust.

Claims:
${JSON.stringify({ parser, docs }, null, 1)}

1. \`git log --oneline\`, \`git status\`. What landed? Any uncommitted code?
2. Run the gate, paste real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`. Baseline was unit 645, integration 642.
3. **Ablate the fix.** Revert \`isHandoffAcceptance\` to exact-equality-only and re-run. The
   \`"po faleminderit"\` tests MUST fail. If they pass against the pre-fix code, the tests are
   decoration — say so bluntly.
4. **Probe the risk the implementer was asked to reason about.** Broadening acceptance means a
   casual \`"ok"\` can now accept an offer. Construct the adversarial case: an offer outstanding,
   the patient replies \`"ok"\` meaning something else entirely. What happens? Is the
   next-message-only bound genuinely sufficient, or did this trade one silent failure for another?
   Measure it; do not reason about it abstractly.
5. **Protect the progressive particle.** \`"Po pyesja për oraret"\` must reach the model as an
   ordinary question and must NOT be an affirmative for either subsystem. Verify directly. This is
   a real production bug the codebase already fixed once — re-breaking it would be a regression on
   a regression.
6. **Check the shared extraction did not quietly drop behaviour.** Diff the old parse-response logic
   against the shared module. Every guard and every explanatory comment must have survived. A
   comment lost here is a bug re-learned later.
7. **Read the decisions log entries.** Are they accurate against the actual commits, or plausible
   fiction? Spot-check at least three specific claims (a file, a symbol, a behaviour) against the
   code. Confirm the two unintended consequences are recorded honestly rather than softened.
8. Fix anything small and obviously wrong; report anything larger.

Set \`done\` true only if the gate is green, the ablation proved the tests have teeth, the
progressive particle still reaches the model, and the log is factually accurate. Paste real output.`,
  { label: 'verify:affirmative', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { parser, docs, verification }
