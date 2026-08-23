export const meta = {
  name: 'medium-wave1-escalation-and-esu',
  description: 'Wave 1 Tracks B+C: rebuild escalation as an AI-decided offer, and migrate Embedded Signup to v4',
  phases: [
    { title: 'Build', detail: 'escalation chain, plus the Embedded Signup v4 migration in parallel' },
    { title: 'Verify', detail: 'independent verification of both tracks' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const CONTEXT = `
Project "Medium": a multi-tenant SaaS for booking appointments over WhatsApp with an AI assistant,
run by solo service professionals from a mobile-first PWA. Repo: ${REPO}. Read AGENTS.md first.
Pre-launch, no real customer onboarded.

**CRITICAL PRODUCT FACT, decided by the owner on 2026-08-14:** this is **NOT a medical product**.
It is a general appointment-booking product and will serve barbers, nail salons and similar small
businesses as well as physiotherapists. The owner's words: *"This app is not to be designed to
handle emergencies. This app is primarily about communicating schedules and creating appointments.
Also, this app will be serving to different professionals, not just professionals of a medical
discipline."* Every decision below follows from that. Patient-facing copy must read correctly for a
nail salon, not just a clinic.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest,
OpenRouter, WhatsApp Cloud API, Serwist + Web Push, POK payments, Vercel, Tailwind 4 + shadcn/ui,
Vitest. UI and patient-facing copy are Albanian-only.

**Docker and the local Supabase stack are running.** \`pnpm test\`, \`pnpm test:integration\`,
\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\` all work. Do NOT start dev servers, deploy, or touch
any hosted database. The local DB is currently WIPED of auth users (integration runs do that) —
run \`pnpm seed:qa\` if you need a signed-in fixture.

Branch: \`prod-readiness\`. Commit your own work when green. Do NOT push, do NOT merge, do NOT touch
\`main\`. Conventional commits, ending with:
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>

Recent work you are building on (all green, all committed): the test suite was repaired and made
clock-independent (\`tests/support/clock.ts\`, used by 27 files) and DB-independent
(\`tests/support/isolation.ts\`), and a CI gate was added. Baseline to preserve: **unit 66 files /
640 tests, integration 64 files / 608 tests, all passing.** If your change alters those counts,
that is expected — but every test must pass, and you must say what changed and why.

Use \`tests/support/clock.ts\` for any new test needing a stable clock. Do NOT introduce new
hard-coded absolute dates: the owner explicitly required derived dates.
`

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['done', 'summary', 'files_changed', 'verification_output', 'follow_ups'],
  properties: {
    done: { type: 'boolean', description: 'True ONLY if the verification command actually passed. Never true on a hope.' },
    summary: { type: 'string', minLength: 150 },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification_output: { type: 'string', minLength: 40, description: 'Literal tail of the command output. Paste it, do not paraphrase.' },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
}

phase('Build')

const escalationChain = async () => {
  const a1 = await agent(
    `${CONTEXT}

TASK 1 of 3 — Delete the deterministic escalation detection and the custom keyword setting.

The owner has redesigned escalation. The old model — pattern-matching the patient's message into
five categories before the AI runs — is being removed entirely. Read
\`task-manager/audits/2026-08-13-verification.md\` for background, but the design below is the
authority; it was agreed with the owner directly and supersedes anything in that file.

DELETE:

1. **All five detection categories in \`lib/conversation/safety.ts\`**: \`human_requested\`,
   \`urgent_health_concern\`, \`legal_or_billing\`, \`insurance_question\`, \`high_frustration\` —
   the pattern arrays, \`detectSafetyEscalation\`, and \`safetyEscalationResponse\`. Remove the call
   sites in \`lib/conversation/engine.ts\` (around lines 676-691 and 893-909) and the corresponding
   tests.

   **The medical patterns are the point of this change.** Detecting chest pain and ambulances inside
   a barber's booking assistant is a half-built medical feature the product explicitly does not want.

2. **The \`aiEscalationKeyword\` feature, entirely**: the DB column on \`pts\` (write a Drizzle
   migration — generate it with \`pnpm db:generate\`, do not hand-write the SQL), the field in
   \`app/(dashboard)/settings/assistant/\` (form, action, zod schema, snapshot/read-model), the
   \`escalationKeyword\` plumbing through \`lib/conversation/engine.ts\`, and the
   "Human escalation keyword" line in \`lib/ai/prompt.ts\` (around line 92). Also remove its
   Albanian UI strings from the i18n source and any settings constants listing it.

PRESERVE — do not touch:

- \`escalateToHuman\` and the \`escalate_to_human\` tool. The AI's ability to escalate is the whole
  basis of the new design; only the *deterministic pre-model detection* is going.
- \`runFailedTurnHandoff\` (engine.ts ~line 621). When the model fails, the thread still escalates
  automatically. That is the safety net and it stays exactly as it is.
- The \`conversation.escalated\` event, the push dispatch, and \`escalationState\`.
- \`lib/inngest/functions/offer-resume.ts\`. It already nudges the professional after 1 hour.

Do NOT yet build the new offer mechanism — that is task 2. This task should leave the codebase in a
state where the AI can still escalate via its tool, but nothing pattern-matches the inbound message.

Record the reasoning in \`task-manager/progress.md\`'s decisions log, newest first, dated
2026-08-14: that the deterministic safety detection was deleted **because the product is a
horizontal appointment-booking tool, not a medical one**. Someone reading this diff in six months
must not mistake it for an accidental safety regression and "restore" it.

VERIFY: \`pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration\` all green, and the
generated migration applies cleanly to the local DB (\`pnpm db:migrate\`). Paste the real summary
lines. Then commit.`,
    { label: 'esc:1-delete', phase: 'Build', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const a2 = await agent(
    `${CONTEXT}

TASK 2 of 3 — Build the new escalation offer.

Previous step: ${JSON.stringify(a1 && a1.summary)}

THE AGREED DESIGN, in full. This was decided with the owner question by question; implement exactly
this and do not improvise around it.

1. **The AI alone decides** it cannot or should not answer something. There is no pattern matching.
   The AI's system prompt must tell it: when a request is outside what you can handle (anything that
   is not booking, rescheduling, cancelling or answering about services/availability), do not guess
   — offer to pass the question to the business. Update \`lib/ai/prompt.ts\` accordingly.

2. **One static message, used for every such case.** Vertical-agnostic, no emergency guidance
   (deliberately — the product is not medical). The agreed Albanian text:

   > Mund të ndihmoj vetëm me takimet. Nëse dëshironi t'ia kaloj këtë pyetje {businessName}, përgjigjuni me PO.

   ("I can only help with appointments. If you'd like me to pass this question to {business},
   reply PO.") Put it with the other patient-facing copy, interpolating the practice/business name
   the same way the existing handoff copy does. Note the existing fallback string
   \`'the physical therapy practice'\` is now wrong for a horizontal product — if you touch it, make
   it vertical-neutral, and flag it in follow-ups either way.

3. **Acceptance is the word, and ONLY the immediately next message counts.** The conversation must
   record that an offer is outstanding. If the very next inbound message is the acceptance word, it
   escalates. If it is anything else, the offer lapses and the message is handled normally — a
   patient who replies "po" three messages later gets normal AI handling, not an escalation.

   This precision matters: **"po" is Albanian for "yes"**, and it is what a patient types to accept
   a proposed time slot. The codebase already carries scars from this class of bug — see the comment
   in the deleted safety.ts about \`nuk funksionon\` also being how someone declines a slot. Getting
   the scoping wrong turns every slot confirmation into an escalation.

   Add whatever state this needs (a column on \`conversations\`, generated via \`pnpm db:generate\`).
   Match the acceptance case-insensitively and diacritic-insensitively — the old safety.ts \`fold()\`
   helper is a good reference for how this codebase normalises Albanian input, and its approach is
   worth preserving even though its patterns are not.

4. **On acceptance:** notify the professional and escalate exactly as \`escalateToHuman\` does today
   — the AI goes silent for that conversation until the professional turns it back on. Unchanged
   behaviour, new trigger.

VERIFY: new tests covering — the offer is made when the AI declines; the next-message word
escalates; the same word one message later does NOT; a normal "po" accepting a time slot with no
offer outstanding still books; an offer followed by an unrelated question lapses cleanly. Full
\`pnpm test && pnpm test:integration\` green. Then commit.`,
    { label: 'esc:2-offer', phase: 'Build', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  const a3 = await agent(
    `${CONTEXT}

TASK 3 of 3 — Non-text messages, and the billing-cap notification.

Previous steps:
- delete: ${JSON.stringify(a1 && a1.summary)}
- offer: ${JSON.stringify(a2 && a2.summary)}

**(A) Non-text inbound messages.** Today a voice note, photo, document or sticker is dropped: the
patient gets no reply and the professional never sees it in their inbox. WhatsApp users send voice
notes constantly, so this lands in the first days of real use.

In the existing non-text branch of \`app/api/webhooks/whatsapp/route.ts\` (~lines 208-225), which
already opens a transaction and holds \`conversationId\`, also insert a \`messages\` row inside that
same transaction: role \`'patient'\`, \`externalId\` = \`msg.id\` (the \`messages_external_id_uq\`
index plus \`onConflictDoNothing\` gives the redelivery dedupe that branch's own comment says it
lacks), and a deterministic per-type Albanian placeholder as content (\`[mesazh zanor]\`, \`[foto]\`,
…), plus \`msg.image?.caption\` when present — captions never live in \`msg.text\` and are dropped
entirely today.

That single insert is what restores the unread badge, the chat-list preview and the realtime
refresh: all three key off this row. Then send a deterministic Albanian reply saying the assistant
can only read text messages, **and make the same handoff offer built in task 2** (the owner
confirmed non-text should offer escalation too). Send it once per conversation, not per message —
model the guard on \`lib/billing/cap-handoff.ts\`, which already implements once-per-conversation
plus the AI-reply-unique-index idempotency pattern. Do **not** route a synthetic placeholder into
the AI engine. Leave \`bumpLastInboundAt\`'s semantics untouched — the redelivery test depends on them.

**(B) The billing cap.** Today, when a professional is at their monthly conversation cap, the
patient gets a static holding message, **the professional is never notified**, and the thread looks
AI-handled in the inbox. Worse, the day-fact is compensated-deleted, so every later message that day
re-hits the cap and \`prepareCapHandoff\` returns \`skip\` — the 2nd through Nth messages get no
reply at all.

The owner's decision: **at the cap, notify the professional automatically — no offer.** There is
nothing to offer, because the AI genuinely cannot serve them. Flag the conversation and dispatch the
push, reusing the existing \`conversation.needs_reply\` dispatch at
\`lib/inngest/functions/handle-inbound-message.ts\` (~lines 432-442). Make sure the second and later
messages in a capped day still result in the professional seeing a waiting patient, rather than
silence.

VERIFY: invert \`app/api/webhooks/whatsapp/__tests__/route.integration.test.ts:583-615\`, which
currently asserts the drop — after an inbound audio from a new sender the chat list preview shows
the placeholder and the unread count is 1; an inbound image on an existing conversation moves both;
a second media message sends no second explanatory reply; the redelivery test at :617 stays green.
For the cap: an at-cap professional receiving a message produces a push and a flagged conversation,
and a SECOND message the same day still leaves the professional able to see it. Full
\`pnpm test && pnpm test:integration\` green. Then commit.`,
    { label: 'esc:3-nontext-cap', phase: 'Build', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

  return { a1, a2, a3 }
}

const esuMigration = () =>
  agent(
    `${CONTEXT}

TASK — Migrate WhatsApp Embedded Signup to v4. Hard external deadline: **2026-10-15**.

Read \`docs/whatsapp/embedded-signup-v4-setup.md\` first — it is sourced against Meta's live
documentation and records an operator observation that resolves an open contradiction in Meta's own
docs. Trust it.

**Own only these files.** Another agent is working on the conversation engine and the WhatsApp
*webhook* route in parallel — do not edit anything under \`lib/conversation/\`,
\`lib/inngest/\`, or \`app/api/webhooks/\`.

Three coupled changes, one commit:

**(a) The v4 payload.** In \`app/(dashboard)/settings/connect-whatsapp.tsx\` (~lines 184-188):

\`\`\`js
// today (v2-era)
extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
// v4
extras: { setup: {} }
\`\`\`

Both \`featureType\` and \`sessionInfoVersion\` go. This is safe because the operator confirmed on
2026-08-14 that "WhatsApp Business app user onboarding" was a tickable product in the new
configuration and they ticked it in both Meta apps — so the configuration now carries the
coexistence intent that \`featureType\` used to carry. The doc records this.

**(b) Stop discarding the finish-event discriminator.** The client captures the popup's event name
and throws it away, and the server hardcodes \`mode: 'coexistence'\`. Widen the ref to carry
\`{ event?, phoneNumberId?, wabaId? }\`, store \`data.event\`, and derive the mode at the POST site:

| Event | Mode |
|---|---|
| \`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING\` | \`coexistence\` |
| \`FINISH\` | \`cloud_api\` |
| \`FINISH_ONLY_WABA\` | decide explicitly — it carries **no phone number**, and \`app/api/auth/meta-embedded/route.ts:157\` throws \`MetaSignupError('rejected')\` when a cloud_api payload lacks \`phone_number_id\`. Read that path and choose deliberately; say what you chose and why. |
| \`FINISH_OBO_MIGRATION\`, \`FINISH_GRANT_ONLY_API_ACCESS\` | unsupported — show the existing "incomplete" card rather than guessing |

Drop \`.default('coexistence')\` at \`route.ts:35\` so an absent mode is a 400. Check the test helper
default at \`route.integration.test.ts:80\` first — it may rely on it.

**(c) A security fix in the same listener.** The origin check is
\`event.origin.endsWith('facebook.com')\`, which also admits \`https://evilfacebook.com\`. Replace it
with exact-origin comparison against Meta's expected origin(s). There is no other integrity check on
the IDs this listener accepts, so this is the only thing standing between a lookalike origin and a
forged signup payload.

VERIFY: extend \`app/api/auth/meta-embedded/__tests__/route.integration.test.ts\` with one case per
finish event asserting the persisted mode and \`coexistenceSyncStatus\`. Add the first unit test for
the \`connect-whatsapp.tsx\` postMessage handler — it has zero coverage today — covering each event
name plus a lookalike-origin rejection (\`https://evilfacebook.com\` must be refused). Then
\`pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration\` green. Commit.

Note in your follow-ups that the real gate is a live phone test only the operator can run, and that
\`NEXT_PUBLIC_META_CONFIG_ID\` must be repointed and each environment **redeployed** (the value is
inlined at build time) — Preview to \`1017283718025738\`, Production to \`2608232889596345\`.`,
    { label: 'esu:v4', phase: 'Build', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
  )

const [escalation, esu] = await parallel([escalationChain, esuMigration])

phase('Verify')
const verification = await agent(
  `${CONTEXT}

You are an INDEPENDENT verifier. Two tracks just landed on \`prod-readiness\` — a full escalation
redesign and the Embedded Signup v4 migration. They each claim success. Check, do not trust.

Claims:
${JSON.stringify({ escalation, esu }, null, 1)}

1. \`git log --oneline\` and \`git status\`. What actually landed? Is the tree clean?
2. Run the whole gate and capture real output: \`pnpm lint\`, \`pnpm typecheck\`, \`pnpm test\`,
   \`pnpm test:integration\`, \`pnpm build\`. Baseline before this work was unit 66 files/640 tests
   and integration 64 files/608 tests; counts will have changed, but everything must pass.
3. **Verify the deletions are complete, not partial.** Grep for \`detectSafetyEscalation\`,
   \`safetyEscalationResponse\`, \`escalationKeyword\`, \`aiEscalationKeyword\`,
   \`urgent_health_concern\`. Any surviving reference in live code (tests asserting absence are
   fine) means a half-deleted feature. Confirm the migration dropping the column exists and applies.
4. **Verify the safety net survived.** \`runFailedTurnHandoff\` must still escalate when the model
   fails, and \`escalateToHuman\` / the \`escalate_to_human\` tool must still exist. If the deletion
   took those with it, that is a serious regression — report it loudly.
5. **Attack the acceptance-word scoping.** This is the highest-risk part of the design. "po" is
   Albanian for "yes" and is how a patient accepts a proposed appointment slot. Confirm by reading
   the code and by running the tests that: a "po" with an offer outstanding escalates; a "po" with
   NO offer outstanding does not; a "po" one message *after* the offer does not; and accepting a
   time slot with "po" still books normally. If any of these is untested, write the test yourself
   and report what it found.
6. **Verify the v4 payload really is clean** — grep the client for \`featureType\` and
   \`sessionInfoVersion\` and confirm both are gone, and that the origin check is exact rather than
   suffix-based. Confirm a \`https://evilfacebook.com\` origin is actually rejected by a test.
7. Fix anything small and obviously wrong, and say what you fixed. Leave anything large and report
   it precisely.

Set \`done\` true only if the gate is green AND the deletions are complete AND the safety net
survived AND the acceptance-word scoping is proven by tests. Paste real command output. If you
cannot run something, say so — do not infer.`,
  { label: 'verify:tracks-bc', phase: 'Verify', schema: RESULT_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { escalation, esu, verification }
