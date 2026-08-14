export const meta = {
  name: 'medium-wave1-escalation-fixes',
  description: 'Resolve the PO collision by most-recent-question-wins, make the offer anchor transactional, and fix the prompt price contradiction',
  phases: [
    { title: 'Fix', detail: 'precedence + transactionality, and the prompt contradiction in parallel' },
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
deleted on 2026-08-14 — see the decisions log in task-manager/progress.md. Do not reintroduce it.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Vitest. Patient-facing copy is Albanian.

**Docker and the local Supabase stack are running.** \`pnpm test\`, \`pnpm test:integration\`,
\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work. Do NOT start dev servers, deploy, or touch
any hosted database.

**Test isolation warning:** \`tests/setup/global.ts\` runs \`DELETE FROM auth.users\` at global
setup, so two overlapping \`pnpm test:integration\` runs destroy each other's fixtures and produce
confusing FK failures in whichever suites are mid-flight. Another agent may be running in parallel.
If you see FK violations in suites you did not touch, re-run alone before believing them.

Branch: \`prod-readiness\`. Commit when green. Do NOT push, merge, or touch \`main\`. Conventional
commits ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Current baseline, all passing: unit 68 files / 643 tests, integration 65 files / 635 tests.
Use \`tests/support/clock.ts\` for anything needing a stable clock. Never introduce a hard-coded
absolute date in a test — the owner explicitly required derived dates.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean', description: 'True ONLY if the verification command actually passed.' },
    summary: { type: 'string', minLength: 150 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: { type: 'string', minLength: 40, description: 'Literal command output. Paste it.' },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Fix')

const precedenceAndAnchor = () =>
  agent(
    `${CONTEXT}

TWO FIXES in the escalation path, one commit each.

═══ FIX 1: the "PO" collision — most-recent-question-wins ═══

**The defect, proved end to end by a verifier.** Two subsystems both claim a one-word reply and
neither knows about the other:

- \`lib/reminders/parse-response.ts:21\` treats \`po\` as appointment confirmation:
  \`confirm: ['konfirmo','konfirmoj','dakord','po','ok','okay']\`
- The new handoff offer tells the patient to reply \`PO\` to be put through.

In \`lib/inngest/functions/handle-inbound-message.ts\` the reminder handler runs at ~line 406,
**before** the engine, and returns at ~line 412 when it produces an outbound. So with an unanswered
reminder AND an outstanding handoff offer, a bare "PO" confirms the appointment, the engine never
runs, the escalation never happens, and the anchor stays armed. The patient receives a confirmation
about something they did not ask about and believes their question was passed on.

**The owner's decision (2026-08-14): whichever question was asked most recently wins.** "PO" answers
the last thing the patient was actually asked. Both orderings genuinely occur — a reminder is
scheduled and can land after an offer, and an offer can be made after a reminder — so a fixed winner
would be wrong roughly half the time.

Implement:

1. Establish both timestamps. The offer's is the \`created_at\` of the message referenced by
   \`conversations.handoff_offer_message_id\`. The reminder's is when the reminder the patient would
   be answering was actually sent — read \`lib/reminders/response-handler.ts\` to find how it
   locates the reminder it is answering, and use that same row's sent timestamp. Do not invent a new
   notion of "the current reminder"; reuse whatever the handler already resolves.
2. Decide precedence **before** the reminder handler can claim the message, i.e. ahead of the
   \`handle-reminder-response\` step. If the offer is newer, skip reminder handling for this turn
   and let the engine's acceptance path run. Otherwise leave today's behaviour exactly as it is.
3. **When the reminder wins, the offer lapses** — consistent with the owner's rule that only the
   immediately-next message can accept. The patient answered the reminder, not the offer. Clear the
   anchor so it cannot fire later against an unrelated message. Note in your follow-ups that the
   patient's original question is then not passed on, and that they can re-ask; if you see a clean
   way to make that non-silent without inventing product behaviour, describe it rather than build it.

Tests required (integration, in the same style as the existing acceptance tests at
\`lib/conversation/__tests__/engine.integration.test.ts:931-1106\`):
- offer newer than the reminder + "PO" → escalates, \`escalationState\` escalated, appointment NOT confirmed
- reminder newer than the offer + "PO" → appointment confirmed, no escalation, anchor cleared
- bare "po" with no offer outstanding → confirms the reminder exactly as today (regression guard)
- bare "po" with no offer and no reminder → still books a proposed slot normally (regression guard)

═══ FIX 2: the anchor is cleared before the escalation, non-transactionally ═══

\`lib/conversation/engine.ts\` around lines 730-736 calls \`resolveHandoffOffer\` — which clears
\`handoff_offer_message_id\` unconditionally — and only then calls \`acceptHandoffOffer\` →
\`escalateToHuman\`. A crash between the two loses the offer permanently: the retry finds no anchor
and falls through to a normal turn, so the patient's accepted handoff silently never happens.

The stated invariant was "escalation first, reply second, so a crash cannot leave a promise made and
unkept". That holds for the reply but not for the anchor clear. Make the clear and the escalation
atomic — one transaction, or reorder so the escalation is durable before the anchor is cleared.
Whichever you choose, the property to guarantee and to test is: **a crash at any point between
reading the anchor and completing the escalation must leave the system in a state where a retry
still escalates.**

Add a test that proves it — the codebase already has precedent for forcing a mid-operation failure
(look at how the "sent but not saved" and "keeps a failed publication durable" tests do it).

VERIFY both fixes: \`pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration\` green, and
paste the real summary lines. Commit each fix separately.`,
    { label: 'fix:precedence-anchor', phase: 'Fix', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

const promptFix = () =>
  agent(
    `${CONTEXT}

FIX — the assistant's prompt contradicts itself about prices.

\`lib/ai/prompts/scheduling-assistant.ts\` around lines 43-44 still says the assistant must never
"discuss legal or billing matters", while the new scope bullet around lines 49-51 says it answers
about "services, prices, and availability". A verifier flagged that for a nail salon
**"sa kushton?" ("how much does it cost?") is the single most common question there is**, so the
model may refuse exactly what it is scoped to answer.

The intent is recoverable from the codebase's own history. The now-deleted \`lib/conversation/safety.ts\`
carried this comment about its billing patterns:

> "Scoped to genuine disputes only. Bare price words (bill/charge/faturë/pagesë) used to land here
> and switch the assistant off, even though the prompt carries each service's price and is told to
> quote it — a plain 'how much do you charge?' must reach the model."

So the settled intent is: **quoting configured service prices is in scope; billing disputes,
refunds, and legal matters are not** and should go through the handoff offer.

Also at lines 49-52 there are leftover clinic-shaped instructions — escalating on "urgent symptoms",
never claiming knowledge about "insurance coverage". Those read wrong for a barber or a nail salon
and are residue from when this was framed as a physiotherapy product. Rewrite the scope section so
it is vertical-neutral: the assistant handles booking, rescheduling, cancelling, and questions about
the business's configured services, prices and availability; anything else gets the handoff offer,
which the model decides for itself rather than matching a list of topics.

Do **not** reintroduce any medical or emergency special-casing. That was deliberately deleted.

**Own only \`lib/ai/prompts/\` and its tests.** Another agent is working in
\`lib/conversation/\`, \`lib/inngest/\` and \`lib/reminders/\` in parallel — do not edit those.

VERIFY: a test asserting the prompt no longer contains contradictory guidance, and that a
price question is described as in scope. If \`lib/ai/__tests__/prompt.test.ts\` or
\`prompt-bundle.test.ts\` snapshot the prompt, update them deliberately rather than blindly.
\`pnpm typecheck && pnpm lint && pnpm test\` green. Commit.`,
    { label: 'fix:prompt-scope', phase: 'Fix', schema: RESULT_SCHEMA, model: 'opus', effort: 'high' },
  )

const [fixes, prompt] = await parallel([precedenceAndAnchor, promptFix])

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Three fixes just landed on \`prod-readiness\`. Check, do not trust.

Claims:
${JSON.stringify({ fixes, prompt }, null, 1)}

1. \`git log --oneline\`, \`git status\`. What landed? Is the tree clean of uncommitted code?
2. Run the gate and paste real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`. Baseline was unit 68/643, integration 65/635; counts
   will have grown, but everything must pass.
3. **Attack the precedence rule — this is the point of the run.** Do not accept that tests exist;
   read them and confirm they assert the right thing, then probe the cases nobody wrote:
   - offer newer than reminder + "PO" → escalates AND the appointment is NOT confirmed
   - reminder newer than offer + "PO" → appointment confirmed, no escalation, anchor cleared
   - bare "po" with a reminder and no offer → confirms, exactly as before this change
   - bare "po" with neither → books a proposed slot normally
   - what happens when the offer and the reminder share a timestamp to the second? Is the tie
     broken deterministically, or is it a coin flip? A coin flip is a defect — report it.
   - "po faleminderit" and other multi-word forms: the reminder parser has progressive-particle
     handling (\`parse-response.ts:174\`). Confirm the new precedence path did not bypass it.
4. **Attack the transactionality fix.** Find the test that forces a mid-operation crash and confirm
   it actually exercises the window between reading the anchor and completing the escalation. If it
   only tests the happy path, say so — that is the whole point of the fix.
5. **Check the prompt fix is real**: the contradiction is gone, price questions are in scope, and no
   medical/emergency or insurance special-casing was reintroduced. Grep for \`urgent\`, \`symptom\`,
   \`insurance\`, \`sigurim\` in \`lib/ai/prompts/\`.
6. Fix anything small and obviously wrong; report anything larger without fixing it.

Set \`done\` true only if the gate is green AND the precedence rule is proven by tests in both
orderings AND the crash window is genuinely covered. Paste real command output; if you cannot run
something, say so rather than inferring.`,
  { label: 'verify:fixes', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { fixes, prompt, verification }
