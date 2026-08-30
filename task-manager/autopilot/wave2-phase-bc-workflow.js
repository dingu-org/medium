export const meta = {
  name: 'medium-phase-b1-and-c',
  description: 'Finish B1 tests, verify Phase B, then Phase C: the AI reads replies and the copy collapses',
  phases: [
    { title: 'B1', detail: 'finish the cap tests the interrupted agent never wrote' },
    { title: 'VerifyB', detail: 'independent verification of the escalation split' },
    { title: 'C', detail: 'delete the anchor machinery, give escalation fixed copy' },
    { title: 'VerifyC', detail: 'independent verification of the whole change' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": multi-tenant SaaS for booking appointments over WhatsApp with an AI assistant.
Repo: ${REPO}. Read AGENTS.md first. Pre-launch, no real customer onboarded.

**PRODUCT FACT:** NOT a medical product. General appointment booking serving barbers, nail salons
and physios. Customer-facing Albanian copy must read correctly for a nail salon.

**SCHEMA VOCABULARY (renamed 2026-08-23, migration 0031):** the tenant table is \`accounts\`
(\`account_id\`), the people it books are \`customers\` (\`customer_id\`), \`practice_name\` became
\`name\`, and \`message_role\` values are \`customer | ai | account\`. Older docs and comments may
still say \`pts\`/\`patients\` — the code is authoritative.

**BRANCH: \`reminders/phase-0-flag\`.** This is the live branch, cut from current \`main\`. Do NOT
use \`prod-readiness\` — it is 23 commits stale. Commit when green; do NOT push, merge, or touch
\`main\`. Conventional commits ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Docker and the local Supabase stack ARE running: \`pnpm test\`, \`pnpm test:integration\`,
\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work. Do NOT start dev servers, deploy, or touch
any hosted database.

**Test isolation:** \`tests/setup/global.ts\` runs \`DELETE FROM auth.users\` at global setup, so two
overlapping \`pnpm test:integration\` runs destroy each other's fixtures. Agents here run
SEQUENTIALLY, so a full run is safe — but prefer targeted runs
(\`pnpm vitest run --project integration <path>\`) while iterating.

Never introduce a hard-coded absolute date in a test — use \`tests/support/clock.ts\`.
Exclude \`.claude/\` from repo-wide greps: a duplicate git worktree lives there.

The approved plan is at \`/Users/kd/.claude/plans/okay-then-it-s-decided-dreamy-pancake.md\`. Read it.

## Where the work stands

Phase 0 and Phase A are DONE and committed: a \`remindersEnabled()\` flag (\`lib/reminders/flag.ts\`,
default OFF, forced ON for tests via \`vitest.config.ts\`) now gates all eight reminder boundaries.
Phase B2 is done (\`5815d27\`): every non-text inbound pushes \`conversation.needs_reply\`.
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

phase('B1')
const b1 = await agent(
  `${CONTEXT}

TASK — Finish B1. The agent that started it was killed mid-run; its SOURCE changes are complete and
sitting UNCOMMITTED in the working tree, but it never wrote the tests, so \`pnpm typecheck\` is
currently RED.

**Read the uncommitted diff first** (\`git diff lib/billing/cap-handoff.ts\` and
\`git diff lib/inngest/functions/handle-inbound-message.ts\`). Do not redo it — audit it, keep it,
and finish the job. What it did:

- \`handOffCappedConversation\` → renamed \`notifyCappedConversation\`, and the hand-rolled
  \`UPDATE conversations SET ai_active=false, escalation_state='requested'\` is DELETED. It now only
  dispatches the \`conversation.needs_reply\` push and returns \`DispatchResult\` rather than
  \`{flagged, push}\`.
- The call site step is renamed \`notify-capped-conversation\`, with rewritten comments.

**Why**, so you can judge the tests: the cap is a *transient* condition — it clears at month
rollover or the moment the account upgrades — and it was writing *permanent* conversation state that
only a human could undo. Notifying the professional and stopping the AI are now independent. With
nothing written, resuming needs no code at all: once the cap clears, the next inbound finds
\`ai_active\` still true and takes an ordinary AI turn.

Current typecheck errors name exactly the work outstanding:
\`\`\`
lib/billing/__tests__/cap-handoff.integration.test.ts(23,3): no exported member 'handOffCappedConversation'
lib/inngest/functions/__tests__/handle-inbound-message.integration.test.ts(38,10): same
\`\`\`

Do this:

1. **\`lib/billing/__tests__/cap-handoff.integration.test.ts\`** — rewrite the
   \`'cap handoff — telling the professional'\` describe (~lines 184-252):
   - \`'hands the thread to the professional…'\` becomes **'pushes without taking the thread from
     the assistant'**: assert the push was dispatched AND that \`aiActive\` is still \`true\` and
     \`escalationState\` is still \`'idle'\`. That pair of assertions is the entire point of B1 —
     make them explicit, not incidental.
   - Delete \`'leaves the professional owning the thread for the rest of a capped day'\` — that
     behaviour is deliberately gone.
   - Replace \`'is a no-op flag once the thread is already human-owned, and still pushes'\` with a
     plain still-pushes case (there is no flag to be a no-op about any more).
2. **\`lib/inngest/functions/__tests__/handle-inbound-message.integration.test.ts\`** — rewrite
   \`'flags manual handling for the messages that follow a cap handoff'\` (~line 261). Follow-up
   messages in a capped day now hit the cap gate again rather than the manual-handling branch:
   assert the push fires on the 2nd message, that \`prepareCapHandoff\` skips (the customer is not
   told twice), and that the AI is still active.
3. **New integration test — the one that proves the whole point:**
   \`'answers by itself again once the cap clears'\`. Cap a conversation, then make the metering
   instant fall in the next month (use \`tests/support/clock.ts\`; do NOT hard-code a date), and
   assert the next inbound takes an ordinary AI turn with **no** human intervention.

**Prove the tests have teeth.** Restore the deleted \`UPDATE\` (write \`ai_active=false\` again),
re-run, and confirm the new assertions FAIL. Then remove it and confirm green. Report both outputs —
a test that passes either way is decoration.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test\`, then targeted integration on both files, then
full \`pnpm test:integration\`. Commit the source changes AND the tests together as one commit.`,
  { label: 'b1:cap-tests', phase: 'B1', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

phase('VerifyB')
const verifyB = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier for Phase B — the escalation split. Check, do not trust.

B1 claims: ${JSON.stringify(b1 && b1.summary)}

The intended behaviour:

| Trigger | Notify professional | Stop the AI |
|---|---|---|
| Customer accepts a handoff | yes | yes |
| Model calls \`escalate_to_human\` | yes | yes |
| Model failure | yes | yes |
| Voice note or photo | yes | **no** |
| Conversation cap | yes | **no — resumes itself** |

1. \`git log --oneline\`, \`git status\`. What landed? Any uncommitted code?
2. Run the full gate, paste real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`.
3. **Verify the cap truly leaves no residue.** Grep the whole repo for any remaining write of
   \`aiActive: false\` or \`escalationState: 'requested'\` and classify EVERY hit as a genuine
   handoff or a transient condition. A transient one still writing permanent state is a B1 failure.
4. **Verify resume-by-itself.** Confirm by test, not by reading, that a capped conversation answers
   again once the cap clears with no human action.
5. **Verify non-text still never stops the AI** and now always pushes — including the day-throttled
   path that used to be silent on both sides.
6. **Check the genuine handoffs still DO stop the AI.** The risk in splitting these is over-shooting:
   confirm accepted-handoff, model escalation and model failure all still set \`ai_active = false\`.
7. Fix anything small and obviously wrong; report anything larger.

Set \`done\` true only if the gate is green and points 3-6 all hold. Paste real output.`,
  { label: 'verify:phase-b', phase: 'VerifyB', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

phase('C')
const c = await agent(
  `${CONTEXT}

Phase B verification: ${JSON.stringify(verifyB && verifyB.summary)}

TASK — Phase C. C1 and C2 ship TOGETHER in one working session (C2 removes deterministic
acceptance; C1 provides the model path that replaces it — shipping C2 alone would leave offer
acceptance with free-form model copy). Commit them as two commits if you like, but both must be
green before you stop.

**Why this exists.** \`lib/language/reply-intent.ts\` decides what a customer meant by matching
Albanian keywords. It has been fixed twice and is still wrong: \`"ok, jo"\`, \`"ok, jo faleminderit"\`,
\`"ok nuk dua"\`, \`"Ok, e kuptova"\`, \`"ok, me vone"\` and \`"Ok, po pyesja"\` — six ordinary ways of
saying *no* — all parse as **confirm**, because the parser inspects only the first token and \`jo\`
("no") is an ambiguous particle rather than a command, so it never overrides a leading \`ok\`. Typos
and phrasing are not enumerable. The owner's decision: stop trying, and let the model read it.

### C1 — \`escalate_to_human\` gets a StopCondition and fixed copy

Create \`lib/conversation/customer-copy.ts\` holding three strings plus \`businessLabel\` and
\`DEFAULT_BUSINESS_LABEL_SQ\` (moved out of \`handoff-offer.ts\`). Customer copy is inlined at point
of use in this codebase, never in \`lib/i18n/\` — that directory is professional-facing only.

1. **Offer** (no acceptance word any more):
   \`Mund të ndihmoj vetëm me takimet. Dëshironi t'ia kaloj këtë pyetje \${business}?\`
2. **Escalation** — ONE sentence for model escalation, accepted offer, model failure AND the cap:
   \`Këtë bisedë ia kalova \${business} — do t'ju përgjigjen personalisht sa më shpejt.\`
   The customer must NEVER learn it was a billing cap or a crash.
3. **Non-text**:
   \`Mund të lexoj vetëm mesazhe me tekst, ndaj këtë ia kalova \${business} — do t'ju përgjigjen së shpejti. Për takimet mund të më shkruani këtu me tekst.\`

In \`lib/conversation/engine.ts\`: add \`escalatedToHuman(step)\` and \`stopOnEscalation\`, mirroring
the existing \`offeredHandoff\` and \`stopOnHandoffOffer\`; add to \`stopWhen\`. Add a
\`'escalation'\` outcome to \`ModelTurnResult\`, resolved AFTER \`appointment_mutation\` and BEFORE
\`handoff_offer\` so a committed booking is still announced. Collapse \`FailedTurnCopy\` and
\`failedTurnHandoffResponse\` into the single escalation sentence, and delete \`bookedSinceInbound\`.

\`lib/billing/cap-handoff.ts\` uses the shared sentence — thread the business name through
\`prepareCapHandoff\` (the inbound job context already carries it).

Extend \`escalate_to_human\`'s description in \`lib/ai/tools.ts\`: "…or when the customer agrees to
your offer to pass a question on. The system sends the customer a fixed confirmation; do not write
one."

### C2 — delete the anchor machinery

Delete \`isHandoffAcceptance\`, \`HANDOFF_ACCEPTANCE_WORD\`, \`handoffAcceptedMessage\`,
\`armHandoffOffer\`, \`outstandingHandoffOffer\`, \`handoffOfferOutcome\`, \`clearHandoffOffer\`.
Once the copy moves out, \`lib/conversation/handoff-offer.ts\` can be deleted entirely.

Remove \`handoffOfferMessageId\` from \`PersistedContext\`/\`loadContext\`, the offer-outcome block in
\`runTurnCoreUnlocked\`, \`acceptHandoffOffer\`, and the arming inside \`persistHandoffOffer\` (which
collapses to a plain \`persistReply\`). Drop the arming in \`lib/conversation/non-text.ts\`. Delete
\`resolveInboundClaim\`, the \`InboundClaim\` type and the \`resolve-turn-precedence\` step from
\`handle-inbound-message.ts\`; delete \`pendingReminderSentAt\` from the reminder response handler;
delete \`isAffirmative\` from \`lib/language/reply-intent.ts\`.

**KEEP \`parseReplyIntent\`** — still imported by the reminder response handler, which is dormant
behind the flag but must keep compiling and passing its tests.

**Do NOT touch the DB column** \`conversations.handoff_offer_message_id\` or write a migration. That
is C3, a deliberately separate later deploy: dropping a column while running code still selects it
is the one ordering that breaks. Leaving the column declared in the schema is safe.

**State the history assumption in a comment where acceptance now happens.** Acceptance depends on
the offer being visible in the flat 20-message history (\`HISTORY_LIMIT\`). The offer is normally the
message immediately before the reply, so this holds; an offer answered 20+ messages later is simply
re-offered — no worse than today, where only the immediately-next message could accept.

### Tests

- \`lib/conversation/__tests__/engine.test.ts\`: \`'keeps looping after escalate_to_human'\` INVERTS
  to \`'stops the loop'\`. Two more tests (\`'requests a handoff when a mutation is followed by an
  empty response'\` and the step-limit one) build \`handoff_required\` *out of* \`escalate_to_human\`
  and will now stop at step 1 — rebuild them against a FAILED \`book_appointment\` instead. Add
  \`'keeps looping when the escalation call came back as an error'\` and \`'prefers a committed
  booking over an escalation in the same step'\`.
- Delete the \`'most-recent-question-wins on an affirmative'\` describe in the inbound integration
  test (~9 tests) — that arbitration no longer exists.
- Delete the \`isHandoffAcceptance\` describe and the \`isAffirmative\` cases.
- Add: \`'escalates with the fixed sentence when the model reads the acceptance from history'\` —
  turn 1 offers, turn 2 the scripted model calls \`escalate_to_human\`; assert the fixed sentence,
  \`ai_active = false\`, and real token metadata (a billed round happened).

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build\`.
Integration will drop ~12-15 tests and gain the new ones — record the new baseline in your summary.`,
  { label: 'c:ai-decides', phase: 'C', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

phase('VerifyC')
const verifyC = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier for Phase C. Check, do not trust.

C claims: ${JSON.stringify(c && c.summary)}

1. \`git log --oneline\`, \`git status\`. Any uncommitted code?
2. Full gate, real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`, \`pnpm test:integration\`,
   \`pnpm build\`.
3. **Verify the deletions are complete, not partial.** Grep for \`isHandoffAcceptance\`,
   \`HANDOFF_ACCEPTANCE_WORD\`, \`armHandoffOffer\`, \`outstandingHandoffOffer\`,
   \`handoffOfferOutcome\`, \`clearHandoffOffer\`, \`resolveInboundClaim\`, \`isAffirmative\`,
   \`pendingReminderSentAt\`. Any surviving live reference is a half-deleted feature.
4. **Verify \`parseReplyIntent\` SURVIVED** and the dormant reminder handler still compiles and its
   tests still pass. Deleting it would break the parked feature we deliberately preserved.
5. **Verify the DB column was NOT dropped** and no migration was written — that is C3, a separate
   deploy. If a migration exists, report it as a plan violation.
6. **Verify the model path actually works.** Read the new test that scripts a model reading an
   acceptance from history and confirm it asserts the fixed sentence AND \`ai_active = false\`. Then
   ablate: remove \`stopOnEscalation\` and confirm the test fails. A test that passes without the
   StopCondition is not testing it.
7. **Verify the copy really did collapse.** Count the distinct fixed customer-facing Albanian
   strings that remain reachable. It should be three (offer, escalation, non-text). Report any
   fourth you find — especially a surviving \`failedTurnHandoffResponse\` variant.
8. **Check the cap now sends the shared escalation sentence**, not its old bespoke holding message.
9. Fix anything small and obviously wrong; report anything larger.

Set \`done\` true only if the gate is green, the deletions are complete, \`parseReplyIntent\`
survived, no migration was written, and the ablation in point 6 proved the StopCondition has teeth.`,
  { label: 'verify:phase-c', phase: 'VerifyC', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { b1, verifyB, c, verifyC }
