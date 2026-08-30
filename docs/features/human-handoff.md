# Human handoff

A conversation belongs either to the assistant or to a person, and `conversations.ai_active` is the whole of that distinction. Six paths flip it — an escalation, an accepted handoff offer, the conversation cap, a failed turn, the owner taking over, and closing the thread — and one more suspends the assistant without handing anything over: the echo pause that follows an owner replying from the WhatsApp Business app. This document explains each path, what the customer and the owner see, and how a thread comes back to the assistant. The turn that produces these outcomes is explained in [the assistant conversation engine](./assistant-conversation-engine.md).

## The paths out of the assistant

Telling the owner and stopping the assistant are **independent**. Most paths do both, and those set the same two columns deliberately: the chat list, the chat banner, and the Today attention list all read `ai_active` and `escalation_state`, and a path-specific third value would buy nothing they could act on differently. Two paths tell the owner without stopping the assistant, because their trigger is transient — permanent state that only a human can undo must never be written for a reason that undoes itself.

| Path                   | Trigger                                                                  | Sets                                                                        | Customer sees                                   | Owner sees                                                           |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Escalation             | `escalate_to_human` tool call                                            | `ai_active = false`, `escalation_state = 'requested'`                       | The model's own words                           | `conversation.escalated` push and bell entry                         |
| Accepted handoff offer | An affirmative reply to the offer                                        | Escalation, then the anchor cleared                                         | One fixed sentence                              | The escalation push and bell entry                                   |
| Failure handoff        | A turn changed state then produced no text, or every retry was exhausted | Escalation                                                                  | One of two fixed sentences                      | The escalation push, plus `conversation.failed` for an exhausted run |
| Cap notice             | The monthly conversation cap is reached                                  | Nothing — the assistant keeps the thread                                    | One static holding sentence, once per local day | `conversation.needs_reply` push                                      |
| Non-text notice        | A voice note, photo, or document arrives                                 | Nothing — the assistant keeps the thread                                    | One fixed notice, once per local day            | `conversation.needs_reply` push                                      |
| Takeover               | The owner switches handling to themselves, or answers by hand            | `ai_active = false`, pause cleared                                          | Nothing                                         | `conversation.taken_over`, then a resume offer after an idle hour    |
| Close                  | The owner closes the thread                                              | `ai_active = false`, `closed_at` set, `escalation_state = 'idle'`           | Nothing                                         | The thread moves to the **Closed** tab                               |
| Echo pause             | The owner replies from the WhatsApp Business app                         | `ai_active = false`, `ai_paused_until` two hours out, `ai_pause_reason` set | Nothing                                         | Nothing; the owner is already replying                               |

Only the echo pause is excluded from `manualHandling` in the inbound job. Every row that sets `ai_active = false` means the customer's next message gets a nudge instead of an answer; the two notice rows leave the assistant answering as usual.

## Escalation

`escalateConversationToHuman` in `lib/conversation/escalation.ts` is the single implementation, called by the `escalate_to_human` tool, by an accepted handoff offer, and by the failure handoff. It flips `ai_active` to false and `escalation_state` to `requested`, and appends `conversation.escalated` in the same transaction, so the push and the bell entry fire only when the state actually changed.

The `UPDATE` is guarded on `ai_active = true`. A repeat call therefore updates no row, returns false, and emits nothing — which is what the dispatcher reports to the model as `not_found`. That code is ambiguous by construction: it covers both a missing conversation and one that is already human-owned. The engine's `escalateToHuman` wrapper resolves the ambiguity by re-reading the conversation, and treats "already human-owned" as success, because a customer whose thread was escalated earlier in the same turn must still receive their reply rather than have the turn throw.

The prompt reserves the tool for two cases: the customer asks outright for a person, or a scheduling request cannot be resolved after two clarification attempts. Everything else out of scope uses the offer below.

## The handoff offer

When a request falls outside booking, rescheduling, cancelling, and the configured services, the model calls `offer_human_handoff` and the engine sends one static sentence offering to pass the question on. Nothing in `lib/conversation/handoff-offer.ts` inspects what the customer asked; scope is resolved entirely in the prompt, and the sentence is identical for every request. It names no vertical, promises no response time, and gives no emergency guidance.

The offer is not an escalation. `ai_active` stays true and the tool has no side effect. What the engine stores instead is an anchor: `conversations.handoff_offer_message_id`, holding the id of the customer message the offer answered.

That anchor is what bounds acceptance. `PO` is Albanian for "yes", and it is also what a customer types to take a proposed time slot, so a looser rule would turn every slot confirmation into a permanent handoff. `handoffOfferOutcome` returns `accepted` only when both halves hold: the anchored message is still the customer's most recent one strictly before this inbound message, and the inbound message is an affirmative by `isAffirmative`. Anything else is a lapse, cleared and handled as an ordinary turn — so an offer expires by itself, and no other code path needs to clear a flag.

The offer copy asks for the single word `PO`, which is clear instruction, but acceptance takes any affirmative. The two have to agree: were the offer to demand exact equality with `PO`, everything in the gap — `po faleminderit` — would fall to whichever subsystem runs first, which is always the reminder.

Three writes make the offer crash-safe:

- **Arming.** `armHandoffOffer` runs in the same transaction as the offer message. An anchor whose message never reached the customer would let an ordinary `po` escalate a conversation nobody offered anything to.
- **Accepting.** `acceptHandoffOffer` escalates _first_, then clears the anchor and writes the acceptance reply in one transaction. Were the anchor cleared first, a crash before the escalation would leave the retry with no anchor to read: it would fall through to an ordinary turn and the handoff the customer accepted would never happen. With the escalation durable first, any later crash leaves the anchor armed and the retry escalates again idempotently.
- **Clearing.** `clearHandoffOffer` is guarded on the anchor still being the one that was read, so a clear can never discard an offer armed after that read.

The anchor is deliberately not a foreign key. Retention purges messages, and a dangling anchor is self-correcting: it stops matching, which is exactly a lapse.

## Non-text messages

A voice note, photo, or document reaches the webhook with no readable body. The webhook stores a `messages` row whose content is an Albanian placeholder for the type — `[mesazh zanor]`, `[foto]`, `[dokument]` and so on, from `NON_TEXT_PLACEHOLDER_SQ` — with the caption appended when the customer wrote one. That row is what restores the unread badge, the chat-list preview, and the realtime refresh.

The placeholder is never routed into the model. It is text the product wrote, and a model asked to reply to `[mesazh zanor]` would fabricate the contents of the voice note. The inbound job answers with one fixed notice instead, saying the assistant reads text only and carrying the same handoff offer on the same terms — same acceptance word, same business label — so a customer meets one convention and not two.

The notice is throttled to one per conversation per local day through `conversations.non_text_notice_at`, so a burst of voice notes is answered once. Per day rather than once for good: a conversation row lives as long as the customer does, and a once-ever notice would meet the voice note they send months later with the silence this exists to remove.

The owner is told on **every** non-text inbound, by a `conversation.needs_reply` push dispatched before any branch below it can decide the customer hears nothing — the throttled path and the globally-paused path most of all, since those two used to end the run in silence for everyone. It stops there: non-text never sets `ai_active = false`, because the assistant can still read the next message the customer types.

The branch sits after the human-owned check, so a thread a person is already handling gets the nudge rather than an assistant talking over them, and before the cap gate, because no model round happened and nothing should be metered. Placeholder types are also the webhook's allowlist: a type absent from the map is ignored outright rather than turning an unknown number into a permanent entry in the client directory.

## Cap notice

At the monthly conversation cap the assistant genuinely cannot serve this customer, so unlike an out-of-scope question there is nothing to offer and nothing to ask. `notifyCappedConversation` in `lib/billing/cap-handoff.ts` dispatches a `conversation.needs_reply` push before the customer's holding message goes out, so whatever happens to the send, the owner knows someone is waiting.

It notifies and nothing else — the cap writes no conversation state at all. It used to also set `ai_active = false, escalation_state = 'requested'`, hand-rolling the transition `escalateConversationToHuman` owns. That was permanent state only the owner toggling the thread back could undo, written for a reason that undoes itself: the cap clears at month rollover, or the moment the account upgrades. Resuming therefore needs no code and no human. Once the cap clears, the next inbound finds `ai_active` still true and takes an ordinary AI turn.

The customer receives one static sentence per local day, guarded by `conversations.limit_handoff_at`. It carries no plan, limit, or AI language; that belongs on the owner-facing surfaces.

The second and later messages of a capped day still reach the owner, by a different route than the thread being human-owned. The cap gate compensates its day-fact away when it turns a customer away, so every later message that day hits the cap afresh and lands on this same push — which runs ahead of the once-a-day throttle that keeps the *customer* from being told twice. The per-conversation device tag collapses the burst into one notification.

The push is `conversation.needs_reply` and not `conversation.escalated`, because at the cap the customer asked for nothing. Push yes, bell no: the value of a “reply now” nudge decays in hours, and the durable records are the unread badge and the monthly `billing.limit_reached` event, which already reach the owner. No resume offer is armed either, and none is needed — nothing was taken away to hand back. Metering and cap arithmetic are covered in [billing and plans](./billing-and-plans.md).

## Failure handoff

A turn that changed state and then produced no text cannot simply be retried — the change already committed — and it cannot be left silent. There are two entry points, and they select different copy.

`handoff_required` is the in-turn case: the model produced no text and some step called a mutating tool. The engine escalates and sends the booking-unconfirmed sentence, which tells the customer the outcome of their booking could not be confirmed and that the thread has been passed on.

`handoffFailedTurn` is the exhausted-retries case, reached from the function's `onFailure` after every attempt failed for any cause — a provider outage, a timeout, an empty read-only response. It runs in a fresh invocation that holds no record of what the failed turn completed, so the only available signal is state: `bookedSinceInbound` looks for an appointment this customer gained at or after the inbound message arrived. With one, it sends the booking-unconfirmed sentence; without one, the neutral technical-failure sentence, because a customer with no booking must not be told their booking could not be confirmed.

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
| `handoff_offer_message_id` | uuid or null                         | The customer message an outstanding offer answered. An anchor, not a foreign key. |

`escalation_state` is a text column defaulting to `idle`, and the Today attention list selects on `escalation_state != 'idle'` rather than on a specific value, so it surfaces anything that is not idle.

## Related documents

The mechanisms above touch six other areas, each explained in its own document.

- [Assistant conversation engine](./assistant-conversation-engine.md) — the inbound pipeline, the turn, the tools, and model routing.
- [Owner app](../product/owner-app.md) — the chat screen controls that drive takeover, close, and hand-back.
- [Billing and plans](./billing-and-plans.md) — the conversation cap the cap handoff enforces.
- [Notifications](./notifications.md) — the pushes and bell entries each handoff produces.
- [Events and background jobs](./events-and-background-jobs.md) — the outbox behind every event named here.
- [Reminders](./reminders.md) — reminder answers, which are handled even while a person owns the thread.
