# Human handoff

A conversation belongs either to the assistant or to a person, and `conversations.ai_active` is the whole of that distinction. Four paths flip it — an escalation, a failed turn, the owner taking over, and closing the thread — and one more suspends the assistant without handing anything over: the echo pause that follows an owner replying from the WhatsApp Business app. An accepted handoff offer is not a fifth: the model reads the acceptance and calls `escalate_to_human`, so it *is* the escalation path. This document explains each path, what the customer and the owner see, and how a thread comes back to the assistant. The turn that produces these outcomes is explained in [the assistant conversation engine](./assistant-conversation-engine.md).

## The paths out of the assistant

Telling the owner and stopping the assistant are **independent**. Most paths do both, and those set the same two columns deliberately: the chat list, the chat banner, and the Today attention list all read `ai_active` and `escalation_state`, and a path-specific third value would buy nothing they could act on differently. Two paths tell the owner without stopping the assistant, because their trigger is transient — permanent state that only a human can undo must never be written for a reason that undoes itself.

| Path                   | Trigger                                                                  | Sets                                                                        | Customer sees                                   | Owner sees                                                           |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Escalation             | `escalate_to_human` tool call, including on an accepted offer            | `ai_active = false`, `escalation_state = 'requested'`                       | The escalation sentence                         | `conversation.escalated` push and bell entry                         |
| Failure handoff        | A turn changed state then produced no text, or every retry was exhausted | Escalation                                                                  | The escalation sentence                         | The escalation push, plus `conversation.failed` for an exhausted run |
| Cap notice             | The monthly conversation cap is reached                                  | Nothing — the assistant keeps the thread                                    | The escalation sentence, once per local day     | `conversation.needs_reply` push                                      |
| Non-text notice        | A voice note, photo, or document arrives                                 | Nothing — the assistant keeps the thread                                    | One fixed notice, once per local day            | `conversation.needs_reply` push                                      |
| Takeover               | The owner switches handling to themselves, or answers by hand            | `ai_active = false`, pause cleared                                          | Nothing                                         | `conversation.taken_over`, then a resume offer after an idle hour    |
| Close                  | The owner closes the thread                                              | `ai_active = false`, `closed_at` set, `escalation_state = 'idle'`           | Nothing                                         | The thread moves to the **Closed** tab                               |
| Echo pause             | The owner replies from the WhatsApp Business app                         | `ai_active = false`, `ai_paused_until` two hours out, `ai_pause_reason` set | Nothing                                         | Nothing; the owner is already replying                               |

Only the echo pause is excluded from `manualHandling` in the inbound job. Every row that sets `ai_active = false` means the customer's next message gets a nudge instead of an answer; the two notice rows leave the assistant answering as usual.

Three of those rows send the customer the same words. `escalationMessage` in `lib/conversation/customer-copy.ts` — *"Këtë bisedë ia kalova {business} — do t'ju përgjigjen personalisht sa më shpejt."* — is sent by a model escalation, an accepted offer, a failed turn, and the cap. That is deliberate: a customer told "we have reached our monthly limit" or "the assistant crashed" learns something true, useless to them, and damaging to the business. What is useful is identical in all four cases — a person has this now.

## Escalation

`escalateConversationToHuman` in `lib/conversation/escalation.ts` is the single implementation, called by the `escalate_to_human` tool and by the failure handoff. It flips `ai_active` to false and `escalation_state` to `requested`, and appends `conversation.escalated` in the same transaction, so the push and the bell entry fire only when the state actually changed.

The `UPDATE` is guarded on `ai_active = true`. A repeat call therefore updates no row, returns false, and emits nothing — which is what the dispatcher reports to the model as `not_found`. That code is ambiguous by construction: it covers both a missing conversation and one that is already human-owned. The engine's `escalateToHuman` wrapper resolves the ambiguity by re-reading the conversation, and treats "already human-owned" as success, because a customer whose thread was escalated earlier in the same turn must still receive their reply rather than have the turn throw.

The tool's own description reserves it for three cases: the customer asks outright for a person, a scheduling request cannot be resolved safely, or the customer agrees to the offer below. It also tells the model not to write a confirmation, because the engine sends one.

A successful call is a `StopCondition` (`stopOnEscalation` in `lib/conversation/engine.ts`): the loop ends on the step that escalated, and the turn resolves as the `escalation` outcome. The model is never asked for a further round, so it cannot write its own version of the handover sentence — which it used to, and which is the one place free-form wording was least wanted. The outcome is resolved after `appointment_mutation` and before `handoff_offer`: a step that books a slot *and* escalates announces the booking, because nothing else will ever tell the customer the appointment exists, while the escalation reaches them through the person who now owns the thread.

The reply carries the real token metadata of the round behind it, not the internal/zero stamp, so escalation turns are not under-reported on the cost dashboard.

## The handoff offer

When a request falls outside booking, rescheduling, cancelling, and the configured services, the model calls `offer_human_handoff` and the engine sends one static sentence offering to pass the question on: *"Mund të ndihmoj vetëm me takimet. Dëshironi t'ia kaloj këtë pyetje {business}?"* Nothing inspects what the customer asked; scope is resolved entirely in the prompt, and the sentence is identical for every request. It names no vertical, promises no response time, and gives no emergency guidance.

The offer is not an escalation. `ai_active` stays true, the tool has no side effect, and — since 2026-08-30 — **nothing is recorded about the offer at all**. The message the engine just sent is the only trace it exists.

### The model reads the answer

The offer used to end in *"reply PO"*, and the engine matched the next message against an Albanian keyword list (`isAffirmative`), anchored to the customer message the offer answered so that only the immediately-next reply could accept. The anchor was sound; the matching was not, and could not be made so. Six ordinary ways of declining — `"ok, jo"`, `"ok, jo faleminderit"`, `"ok nuk dua"`, `"Ok, e kuptova"`, `"ok, me vone"`, `"Ok, po pyesja"` — all parsed as a **confirm**, because the parser judged the first token and Albanian `jo` is an ambiguous particle rather than a command, so it never overrode a leading `ok`. Typos, dialect, and the number of ways people say the same thing are not enumerable, and the rule had already been fixed twice.

So the assistant reads it. The offer is a plain question with no keyword in it, the customer's answer arrives as an ordinary message, and agreeing is one more reason for the model to call `escalate_to_human`. The customer then gets the escalation sentence, which the engine writes rather than the model.

Two consequences, both accepted deliberately:

- **Acceptance depends on the offer being visible in the history.** The turn is given a flat window of the last `HISTORY_LIMIT` (20) messages. The offer is normally the message immediately before the reply, so this holds comfortably; an offer answered twenty-plus messages later has scrolled out and is simply re-offered. That is no worse than the anchor rule, where only the immediately-next message could accept at all.
- **Over-escalation is now possible.** With the only-the-next-message bound gone, the model judges late or ambiguous replies. The failure direction is an unnecessary handoff — recoverable, and a human sees a real question — against the old failure direction, which silently mutated a booking. `conversation.escalated` volume is the thing to watch.

Deleted with the keyword rule: `isHandoffAcceptance`, `HANDOFF_ACCEPTANCE_WORD`, `handoffAcceptedMessage`, `armHandoffOffer`, `outstandingHandoffOffer`, `handoffOfferOutcome`, `clearHandoffOffer`, `acceptHandoffOffer`, `isAffirmative`, and `resolveInboundClaim` — the arbitration that decided which of two outstanding questions a one-word reply answered, which has nothing left to arbitrate. `conversations.handoff_offer_message_id` is dead but still declared, and is dropped by its own migration one deploy later: dropping a column while running code still selects it is the one ordering that breaks.

## Non-text messages

A voice note, photo, or document reaches the webhook with no readable body. The webhook stores a `messages` row whose content is an Albanian placeholder for the type — `[mesazh zanor]`, `[foto]`, `[dokument]` and so on, from `NON_TEXT_PLACEHOLDER_SQ` — with the caption appended when the customer wrote one. That row is what restores the unread badge, the chat-list preview, and the realtime refresh.

The placeholder is never routed into the model. It is text the product wrote, and a model asked to reply to `[mesazh zanor]` would fabricate the contents of the voice note. The inbound job answers with one fixed notice instead: *"Mund të lexoj vetëm mesazhe me tekst, ndaj këtë ia kalova {business} — do t'ju përgjigjen së shpejti. Për takimet mund të më shkruani këtu me tekst."* It does both halves of the job the customer needs — what happened to what they sent, and what to do next — and it states the handoff as already done, which the push below makes true. It does not offer anything or ask for a keyword; that took two messages and a keyword match to achieve what the owner-facing push already achieves on the first one.

The notice is throttled to one per conversation per local day through `conversations.non_text_notice_at`, so a burst of voice notes is answered once. Per day rather than once for good: a conversation row lives as long as the customer does, and a once-ever notice would meet the voice note they send months later with the silence this exists to remove.

The owner is told on **every** non-text inbound, by a `conversation.needs_reply` push dispatched before any branch below it can decide the customer hears nothing — the throttled path and the globally-paused path most of all, since those two used to end the run in silence for everyone. It stops there: non-text never sets `ai_active = false`, because the assistant can still read the next message the customer types.

The branch sits after the human-owned check, so a thread a person is already handling gets the nudge rather than an assistant talking over them, and before the cap gate, because no model round happened and nothing should be metered. Placeholder types are also the webhook's allowlist: a type absent from the map is ignored outright rather than turning an unknown number into a permanent entry in the client directory.

## Cap notice

At the monthly conversation cap the assistant genuinely cannot serve this customer, so unlike an out-of-scope question there is nothing to offer and nothing to ask. `notifyCappedConversation` in `lib/billing/cap-handoff.ts` dispatches a `conversation.needs_reply` push before the customer's holding message goes out, so whatever happens to the send, the owner knows someone is waiting.

It notifies and nothing else — the cap writes no conversation state at all. It used to also set `ai_active = false, escalation_state = 'requested'`, hand-rolling the transition `escalateConversationToHuman` owns. That was permanent state only the owner toggling the thread back could undo, written for a reason that undoes itself: the cap clears at month rollover, or the moment the account upgrades. Resuming therefore needs no code and no human. Once the cap clears, the next inbound finds `ai_active` still true and takes an ordinary AI turn.

The customer receives one sentence per local day, guarded by `conversations.limit_handoff_at`, and it is the shared `escalationMessage` — the same words an escalated question gets, with the business named. It carries no plan, limit, or AI language; that belongs on the owner-facing surfaces, and a customer cannot tell a cap from any other handover.

The second and later messages of a capped day still reach the owner, by a different route than the thread being human-owned. The cap gate compensates its day-fact away when it turns a customer away, so every later message that day hits the cap afresh and lands on this same push — which runs ahead of the once-a-day throttle that keeps the *customer* from being told twice. The per-conversation device tag collapses the burst into one notification.

The push is `conversation.needs_reply` and not `conversation.escalated`, because at the cap the customer asked for nothing. Push yes, bell no: the value of a “reply now” nudge decays in hours, and the durable records are the unread badge and the monthly `billing.limit_reached` event, which already reach the owner. No resume offer is armed either, and none is needed — nothing was taken away to hand back. Metering and cap arithmetic are covered in [billing and plans](./billing-and-plans.md).

## Failure handoff

A turn that changed state and then produced no text cannot simply be retried — the change already committed — and it cannot be left silent. There are two entry points and they send the same sentence.

`handoff_required` is the in-turn case: the model produced no text and some step called a mutating tool. Only a *failed* mutation can reach it now — a successful booking stops the loop and speaks for itself, and a successful escalation stops the loop and sends the escalation sentence — so what is left is an attempt that went wrong and then went speechless.

`handoffFailedTurn` is the exhausted-retries case, reached from the function's `onFailure` after every attempt failed for any cause: a provider outage, a timeout, an empty read-only response.

Both escalate and send `escalationMessage`. There used to be two sentences chosen between, the second picked by `bookedSinceInbound` looking for an appointment created since the inbound message arrived. Both the choice and that second sentence are gone. It told a customer their booking might have failed on the strength of a state guess made in a fresh invocation that remembers nothing of the dead turn, and neither answer is one a customer can act on.

`onFailure` also appends `conversation.failed` to the `events` table before attempting the reply. The bell feed reads that table, so a bare event emission would leave no row and no bell entry.

Only the exhausted-retries reply is stamped `deterministic-failure-handoff`, because no model round stands behind it. The in-turn reply carries the real metadata of the round that failed, so the tokens and cost that round did spend are not lost from the cost dashboard.

## Owner takeover and hand-back

The chat thread carries a handling switch backed by `setTakeover` in `app/(dashboard)/chat/actions.ts`, wrapped in `withAuditLog` as `conversation.takeover`.

Taking over sets `ai_active = false` and clears `ai_paused_until` and `ai_pause_reason`, so an indefinite hold replaces any two-hour echo pause. It appends `conversation.taken_over` in the same transaction, and only on the takeover half of the toggle: handing back writes no event. Notably it does not touch `escalation_state`: a thread the customer escalated stays marked as escalated while the owner works it.

The switch is not the only way to take a thread over. Answering from the composer is one too, so `POST /api/pwa/mutations/message` sets the same columns itself — the composer never calls `setTakeover`. It reads `ai_active` under a row lock first and appends `conversation.taken_over` only on a real on-to-off flip, so a second manual reply on an already-human thread does not re-arm the resume offer. Sending a manual reminder from the same screen turns the assistant off in the same way, but writes no event, because the owner sent one template rather than started a conversation.

Handing back sets `ai_active = true`, clears both pause columns, and resets `escalation_state` to `idle`. Clearing the pause columns on every resume path is the rule, not an optimisation: leaving one set means the interface reports the assistant as on while the next inbound message is silently skipped.

## Closing and reopening a thread

Closing sets `closed_at`, turns the assistant off, clears the pause columns, and resets `escalation_state` to `idle`. The thread moves to the **Closed** tab and stops appearing in the active list.

Reopening happens two ways. The owner can reopen from the same control, which mirrors the close exactly and turns the assistant back on. Or the customer writes again: `bumpLastInboundAt` in the webhook clears `closed_at`, sets `ai_active = true`, and resets `escalation_state` — but only when `closed_at` is at or before the inbound message's own timestamp. Meta redelivers whole batches, and that guard is what stops a two-day-old message reopening a thread the owner closed after it was sent. The same timestamp rule keeps the 24-hour service window honest; see [WhatsApp connection](./whatsapp-connection.md).

## Resume offer

A thread handed to a person stays with that person until someone hands it back, so `offer-resume-after-account-inactivity` (`lib/inngest/functions/offer-resume.ts`) asks. It triggers on both `conversation.taken_over` and `conversation.escalated`, because an escalation hands the thread over exactly like a manual takeover — without the second trigger the assistant would stay off for good the moment a customer asks for a person.

The run sleeps one hour, then checks three things: the conversation still exists, the assistant is still off, and no `account` message was written in the last hour. An owner message inside the window re-arms the check from that message's own timestamp rather than declining for good, since an owner who replies by hand at minute five would otherwise never be asked. The re-arm is bounded at 12, so a thread the owner keeps working by hand does not hold a run open indefinitely.

When the checks pass, the run emits `conversation.resume_offered`, which reaches the owner as a push. Nothing changes in the database; handing back is the owner's action.

## WhatsApp Business app echo pause

On a coexistence connection the owner can answer from the WhatsApp Business app on their phone. Meta echoes that message back to the webhook, which stores it as an `account` message and pauses the assistant for two hours so it does not talk over a live human reply.

Three guards keep the pause honest:

- **After the dedupe.** The pause is written only when the echo insert was fresh, so a redelivered echo cannot push `ai_paused_until` past the resume job already scheduled for it.
- **Never over a manual hold.** The `UPDATE` sets the pause columns only when the conversation is either still assistant-handled or already echo-paused. An indefinite hold the owner set themselves — `ai_active = false` with no echo reason — keeps its own state, and `escalation_state` is never cleared here.
- **No orphan resume job.** `conversation.ai_paused` is appended only when the row came back carrying the echo reason, so no resume job is scheduled against a conversation a person is still handling.

The pause ends either way. `resume-business-app-ai` sleeps until `pausedUntil` and then restores `ai_active`, guarded on the conversation still being echo-paused at that exact instant, so a later takeover or a newer pause supersedes it. Independently, the inbound job's load step clears an expired echo pause under the same guard, so a customer message arriving after the two hours is answered without waiting for the job.

## Manual-reply nudge

When a customer writes to a human-owned thread, the inbound job returns `conversation_inactive` — and, when `manualHandling` is true, dispatches `conversation.needs_reply` first. It is the one event dispatched directly through `dispatchPushForEvent` rather than through the `dispatch-push-notification` function, and it is push-only: there is no bell entry, because the message itself is already visible in the chat.

`manualHandling` means `ai_active` is false for a reason that warrants telling someone: a takeover, an open escalation, or a cap handoff. An echo pause is excluded, since the owner is already replying from their phone and a push would be redundant. The push tag is per-conversation, so a burst of messages collapses into one notification on the device. Preferences and payloads are covered in [notifications](./notifications.md).

## Conversation flags

Every handling decision reads from one of these columns on `conversations` (`lib/db/schema.ts`).

| Column                     | Values                               | Meaning                                                                           |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `ai_active`                | boolean                              | Whether the assistant answers this thread. False means human-owned.               |
| `ai_paused_until`          | timestamp or null                    | When a temporary pause lapses. Only the echo pause sets it.                       |
| `ai_pause_reason`          | `whatsapp_business_app_echo` or null | Why the pause exists. Distinguishes a two-hour pause from an indefinite hold.     |
| `escalation_state`         | `idle`, `requested`                  | Whether a handoff is outstanding. Free text, not an enum.                         |
| `closed_at`                | timestamp or null                    | When the owner closed the thread. Cleared by a reopen or a newer inbound message. |
| `last_inbound_at`          | timestamp or null                    | The newest customer message's own timestamp. Drives the 24-hour service window.   |
| `last_read_at`             | timestamp or null                    | The owner's read watermark, resolved in SQL to keep microsecond precision.        |
| `limit_handoff_at`         | timestamp or null                    | When the cap handoff last replied, throttling it to one per local day.            |
| `non_text_notice_at`       | timestamp or null                    | When the non-text notice last replied, on the same one-per-local-day rule.        |
| `handoff_offer_message_id` | uuid or null                         | Dead since 2026-08-30. Nothing reads or writes it; dropped by its own migration.  |

`escalation_state` is a text column defaulting to `idle`, and the Today attention list selects on `escalation_state != 'idle'` rather than on a specific value, so it surfaces anything that is not idle.

## Related documents

The mechanisms above touch six other areas, each explained in its own document.

- [Assistant conversation engine](./assistant-conversation-engine.md) — the inbound pipeline, the turn, the tools, and model routing.
- [Owner app](../product/owner-app.md) — the chat screen controls that drive takeover, close, and hand-back.
- [Billing and plans](./billing-and-plans.md) — the conversation cap the cap handoff enforces.
- [Notifications](./notifications.md) — the pushes and bell entries each handoff produces.
- [Events and background jobs](./events-and-background-jobs.md) — the outbox behind every event named here.
- [Reminders](./reminders.md) — reminder answers, which are handled even while a person owns the thread.
