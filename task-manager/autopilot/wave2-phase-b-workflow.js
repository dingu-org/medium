export const meta = {
  name: 'medium-phase-a-cleanup-and-b',
  description: 'Close the verifier findings from Phase A, then split notify from stop-the-AI',
  phases: [
    { title: 'Cleanup', detail: 'testability, public copy, and the stripping asymmetry' },
    { title: 'Split', detail: 'non-text notifies; the cap stops taking the conversation' },
    { title: 'Verify', detail: 'independent verification' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": multi-tenant SaaS for booking appointments over WhatsApp with an AI assistant.
Repo: ${REPO}. Read AGENTS.md first. Pre-launch, no real customer onboarded.

**PRODUCT FACT:** NOT a medical product. General appointment booking serving barbers, nail salons
and physios. Customer-facing Albanian copy must read correctly for a nail salon. Note the product
vocabulary moved from "patient" to **customer** (\`accounts\` / \`customers\` since migration 0031);
Albanian copy still says \`pacient\` in places, and \`klient\` is the preferred word.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Vitest. Docker and the local Supabase stack ARE running.
Do NOT start dev servers, deploy, or touch any hosted database.

**Branch: \`reminders/phase-0-flag\`** (branched off current \`main\`). Commit when green. Do NOT
push, merge, or touch \`main\`. Note: \`prod-readiness\` is 23 commits BEHIND main and is NOT the
target — do not switch to it. Conventional commits ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

**Test isolation:** \`tests/setup/global.ts\` runs \`DELETE FROM auth.users\` at global setup, so
overlapping \`pnpm test:integration\` runs destroy each other's fixtures. Other agents run in
parallel — prefer targeted runs while iterating, and re-run alone before believing a failure in a
suite you did not touch.

Baseline after Phase A: unit ~70 files, integration ~65 files, all passing. Exclude \`.claude/\`
from repo-wide greps (duplicate worktree). Never hard-code an absolute date in a test — use
\`tests/support/clock.ts\`.

## Where this work is

Reminders have been turned off behind \`remindersEnabled()\` (\`lib/reminders/flag.ts\`, default OFF,
forced ON for tests via \`vitest.config.ts\`). Eight boundaries are gated. An independent verifier
then found the items below.

Approved plan: \`/Users/kd/.claude/plans/okay-then-it-s-decided-dreamy-pancake.md\`. Read it.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean' },
    summary: { type: 'string', minLength: 120 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: { type: 'string', minLength: 40 },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Cleanup')

const inboundChain = async () => {
  const a2 = await agent(
    `${CONTEXT}

TASK — Make the A2 gate testable, then it is the base for the rest of this chain.

**The finding.** A2's gate (\`deterministicReminders = !(assistantPaused || nonText) && remindersEnabled()\`
in \`lib/inngest/functions/handle-inbound-message.ts\`) is the only one of five gates that **no test
executes**. \`handleInboundMessage\`'s handler is an inline closure (~line 425) and never exported,
so the existing test *mirrors* the gate expression in test code instead of running the shipped line.
A mirror can drift from the code it mirrors — and wrong ordering in this exact file is where the
"PO" collision lived.

**Fix it the way A1 already did.** \`lib/inngest/functions/send-reminder.ts\` solved the identical
problem by extracting the handler body to a named export (\`sendReminderHandler\`) and having
\`inngest.createFunction\` reference it. Read that file first and follow the same shape: export
\`handleInboundMessageHandler\`, have the Inngest registration call it, and point the existing
kill-switch test at the real handler instead of a mirror.

Be careful and conservative: the body must move **character-identical apart from the extraction**.
The Phase A verifier proved A1's extraction was drift-free by diffing normalised for whitespace —
do the same for yours and paste that evidence. This file is the heart of the message pipeline; a
silent behavioural change here is the worst outcome of this whole run.

If the existing test's step-shim cannot drive the real handler without significant new scaffolding,
say so plainly and stop rather than inventing a large harness — report it and leave the mirror.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test\`, plus targeted
\`pnpm vitest run --project integration lib/inngest/functions/__tests__/handle-inbound-message.integration.test.ts\`.
Prove the new test has teeth: neuter the gate, watch it go red, restore it. Paste that. Then commit.`,
    { label: 'fix:a2-testable', phase: 'Cleanup', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const b2 = await agent(
    `${CONTEXT}

Previous step in this chain: ${JSON.stringify(a2 && a2.summary)}

TASK — Phase B2: a voice note or photo must tell the professional.

**Today's hole.** \`lib/conversation/non-text.ts\` imports nothing from \`lib/notifications/\`. A
customer sending a photo produces a customer-facing notice (once per conversation per day) and
**no professional-facing signal at all** — no push, no bell, only the passive unread badge. A
*second* media message the same day is throttled, so it is total silence on both sides.

**The owner's decision:** every non-text inbound notifies the professional, and it does **not** stop
the AI (non-text already never sets \`aiActive=false\` — keep it that way).

In the \`nonText\` branch of \`lib/inngest/functions/handle-inbound-message.ts\` (~lines 556-616),
add a \`step.run('notify-non-text', …)\` dispatching a \`conversation.needs_reply\` push on **every**
non-text inbound — crucially including the throttled \`notice.action === 'skip'\` path, which is the
silence hole. Reuse the existing call shape (\`dispatchPushForEvent\`, ~line 534). The
per-conversation device tag (\`conversation-\${id}-reply\`) collapses bursts, so repeated media does
not spam.

**No new event type.** "Mesazh i ri — X të dërgoi një mesazh" is accurate: the professional opens
the thread and sees \`[foto]\` / \`[mesazh zanor]\`. It maps to the existing \`manualReply\`
notification preference, so no Settings UI and no \`NOTIFICATION_TYPES\` change. Push yes, bell no —
this is a "reply now" nudge whose value decays in hours, and the durable record is the unread badge.
Record that reasoning in a comment.

Tests: extend the non-text integration coverage — media on a notice day dispatches a push; a second
media message the same day still pushes but sends no second customer notice.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test\` plus targeted integration. Then commit.`,
    { label: 'b2:non-text-notify', phase: 'Split', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const b1 = await agent(
    `${CONTEXT}

Previous steps in this chain:
- a2: ${JSON.stringify(a2 && a2.summary)}
- b2: ${JSON.stringify(b2 && b2.summary)}

TASK — Phase B1: the conversation cap notifies without taking the conversation.

**The defect.** \`handOffCappedConversation\` in \`lib/billing/cap-handoff.ts\` (~lines 128-157)
hand-rolls \`UPDATE conversations SET ai_active=false, escalation_state='requested'\` — a duplicate
of \`escalateConversationToHuman\` (\`lib/conversation/escalation.ts:13-51\`), which is the only
function that should ever write that transition. So a **billing** condition permanently marks a
**conversation** as escalated, and then notifies through a different channel
(\`conversation.needs_reply\`, which never reaches the bell) than a real escalation does.

The consequence the owner cares about: the cap is **transient** — it clears at month rollover or on
a plan upgrade — but the state it writes is **permanent**, undone only by the professional manually
toggling the conversation back. A billing state should never need a human rescue.

**Do:**
1. Delete the state-write block. Keep the \`conversation.needs_reply\` push.
2. Rename \`handOffCappedConversation\` to something honest — \`notifyCappedConversation\` — and
   rewrite its doc comments (~lines 101-127), which document the old model in detail and would
   otherwise become the most misleading comment in the file.
3. In \`lib/inngest/functions/handle-inbound-message.ts\`, update the at-cap branch comments
   (~lines 637-651) that explain the old flag mechanics. The code needs little else: that function
   already runs on **every** capped inbound before the daily-handoff skip, so the 2nd..Nth-message
   push survives automatically once \`aiActive\` stays true.

Resume-by-itself then falls out for free: nothing was written, so the next inbound after the cap
clears takes an ordinary AI turn with no rescue.

**Tests to rewrite** in \`lib/billing/__tests__/cap-handoff.integration.test.ts\` (the
\`'cap handoff — telling the professional'\` describe, ~lines 184-252):
- \`'hands the thread to the professional…'\` becomes \`'pushes without taking the thread from the
  assistant'\` — assert \`aiActive\` still true, \`escalationState\` still \`'idle'\`, push dispatched
- delete \`'leaves the professional owning the thread for the rest of a capped day'\`
- replace the already-human-owned no-op case with a plain still-pushes case
- in \`handle-inbound-message.integration.test.ts\`, rewrite
  \`'flags manual handling for the messages that follow a cap handoff'\`: follow-up capped messages
  now hit the cap gate again and push, AI still active
- **add** \`'the assistant answers again by itself once the cap clears'\` — this is the whole point
  of the change, so it needs a test that would fail today

Note in follow-ups (do not fix): conversations capped under the OLD code sit at
\`aiActive=false, escalationState='requested'\` and will not self-heal, and cap handoffs never armed
the \`offer-resume\` nudge because that listens only for \`.escalated\`/\`.taken_over\`.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test\` plus targeted integration on both files.
Then commit.`,
    { label: 'b1:cap-notify-only', phase: 'Split', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  return { a2, b2, b1 }
}

const copyCleanup = () =>
  agent(
    `${CONTEXT}

TASK — Close the copy and consistency findings. Own ONLY the files named here; another agent is
working in \`lib/inngest/functions/handle-inbound-message.ts\`, \`lib/conversation/non-text.ts\` and
\`lib/billing/cap-handoff.ts\` — do not touch those.

**1. A PUBLIC page teaches reply words that no longer work (most important).**
\`app/(legal)/help/ai-bookings/page.tsx:54-70\` has a section "Dritarja 24-orëshe dhe kujtesat"
telling readers the customer gets a reminder and can reply **KONFIRMO / ANULO / RICAKTO**. This page
is prerendered and readable signed-out. Those words now reach an AI that has no confirm tool, so a
customer following the published instructions gets an appointment left \`pending\` while believing
they confirmed.

Remove the reminder half. The 24-hour-window half is still a real WhatsApp constraint worth
explaining — **but check what is actually true now**: the manual template button was gated in this
same work, so the claim that the professional can send anything outside the window is false too.
Rewrite the section to say what is true today: inside 24 hours the assistant replies normally;
outside it, the customer has to write first. Do not promise reminders "coming soon" — say nothing
about them.

**2. \`app/(legal)/help/whatsapp/page.tsx:44-46\`** tells the professional the reminder template
needs Meta approval and that automatic reminders may not send yet. Template approval genuinely does
still run (a deliberate decision — it keeps every account warm for the rebuild), but the page
promises a feature that is off. Rewrite or remove.

**3. \`lib/i18n/dict/chat.ts:64\` \`windowClosedText\`** now reads "…para një përgjigjeje të lirë"
("before a free-form reply"), implying a non-free-form reply is still possible. After the template
button was gated, nothing is. This sentence is the *entire* windowClosed composer state, so it is
the most-read wrong string in the app. It also says "Pacienti" where the horizontal product wants
"Klienti". Fix both.

**4. Stripping asymmetry.** \`lib/pwa/read-models.ts:243-285\` still left-joins \`reminderJobs\` and
ships \`reminder: {...}\` to the browser, while \`lib/today/queries.ts\` and \`lib/clients/queries.ts\`
strip at source. Nothing renders it, so there is no user-visible leak — but sibling paths behaving
differently is exactly the kind of asymmetry this project treats as a design flaw. Make the calendar
read model strip at source like its siblings, or if there is a real reason it cannot, write that
reason in a comment. Do not leave it undecided.

**5. Two small ones.** \`app/(dashboard)/today/today-client.tsx:77\` holds a live Supabase Realtime
subscription on \`reminder_jobs\`, a table nothing writes any more — a real websocket for a parked
feature; gate it. Same file ~\`:226\` renders \`AppointmentSheet\` without the \`remindersEnabled\`
prop: currently safe twice over, but it becomes the one sheet that stays wrong when the flag is
turned back on. Pass it.

**6.** \`lib/billing/read-model.ts:138-140\` still calls \`getReminderUsage\` on every billing page
load though the meter is no longer rendered — a wasted query computing a meter that cannot move off
zero. Skip it when reminders are off.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test && pnpm build\` (build matters — the help pages
are prerendered). Read each help page's rendered text yourself and confirm no surviving claim about
reminders or about messaging outside the 24h window. Then commit.`,
    { label: 'fix:copy-and-consistency', phase: 'Cleanup', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

const [chain, copy] = await parallel([inboundChain, copyCleanup])

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Check, do not trust.

Claims:
${JSON.stringify({ chain, copy }, null, 1)}

1. \`git log --oneline\`, \`git status\`. What landed? **Any uncommitted code is a finding** — the
   previous phase left its single most important gate sitting dirty in the working tree because an
   agent died mid-report, and nobody noticed until verification.
2. Run the full gate, paste real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`.
3. **Attack the cap change — this is the point of the phase.** Prove by running code, not by
   reading it: a capped conversation leaves \`ai_active\` TRUE and \`escalation_state\` \`'idle'\`;
   the professional is pushed on the first AND on later messages the same day; and once the cap
   clears the next inbound gets an ordinary AI turn with no manual intervention. If the
   "answers again once the cap clears" test does not exist or does not actually exercise a cleared
   cap, say so — it is the whole reason for the change.
4. **Check the A2 extraction for drift.** The handler body was moved to a named export. Diff it
   against the pre-change version normalised for whitespace and confirm it is character-identical
   apart from the extraction and the gate. This file is the heart of the message pipeline.
5. **Read the two help pages as a visitor would.** \`pnpm build\` prerenders them. Confirm no
   surviving instruction to reply KONFIRMO/ANULO/RICAKTO, no promise of reminders, and no claim
   that the professional can message outside the 24-hour window. A leftover here is published to
   the public internet.
6. **Hunt again for ungated boundaries.** The last verifier found one the five gate agents missed
   (a Settings notification toggle) and two public help pages. Assume there is another. Grep for
   anything that schedules, sends, interprets, displays or *describes* reminders without consulting
   the flag.
7. Fix anything small and obviously wrong; report anything larger.

Set \`done\` true only if the gate is green, nothing is uncommitted, the cap genuinely self-heals,
the extraction is drift-free, and the public pages are clean. Paste real command output.`,
  { label: 'verify:phase-b', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { chain, copy, verification }
