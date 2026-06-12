# Phase 5 — Background jobs (Inngest)

**Goal.** All asynchronous work — running an AI turn, sending outbound, scheduling reminders, polling template approval, retention purge — runs in Inngest with retries, idempotency, and proper event subscriptions.

**Source.** Tech doc §2 (jobs row), §3 (modules), §5.1–5.4, §14.

**Effort.** 3–4 days.

**Prerequisites.** Phases 2, 3, 4 complete.

---

## Phase 4 handoff (2026-06-12)

- Appointment events are already written to `events` plus `event_outbox` in the appointment transaction.
- `publishEventOutbox` attempts due delivery every minute and uses the event UUID as Inngest's idempotency ID.
- Phase 5 subscribers should consume `appointment.*`; they must not add a second direct publisher.

---

## Tasks

### Inngest setup

- [x] Install `inngest`.
- [x] Typed Inngest client and Zod-derived event union in `lib/inngest/` + `lib/events/`.
- [x] `app/api/inngest/route.ts` — serves all functions.
- [ ] Set Inngest signing key + event key in env; verify in Inngest dashboard the app shows up.
- [x] Local route verification: `GET /api/inngest` reports 11 registered handlers (9 functions plus 2 generated failure handlers).
- [ ] Production: deploy and verify registration in Inngest Cloud.

### Functions

#### `handleInboundMessage` — triggered by `message.received`

- [x] Load `message`, `conversation`, patient, and active `whatsapp_connection`.
- [x] If `conversations.ai_active = false`, do nothing (PT is handling it).
- [x] Translate message into channel-agnostic `InboundMessage` shape.
- [x] Call `lib/conversation/engine.runTurn`.
- [x] Send the engine's outbound message via the WhatsApp channel adapter.
- [x] Idempotency: `runTurn` serializes same-inbound execution and returns the existing AI row keyed by unique `messages.reply_to_message_id`.
- [x] Put outbound delivery in a named `step.run`; after a successful send, store the channel message ID in the AI row's `external_id`. If that field is already set on replay, skip delivery.
- [x] Retry transient provider failures plus typed `empty_response` / `step_limit_reached` errors up to 3 attempts with Inngest backoff.
- [x] Do not retry `conversation_not_found` or `conversation_inactive`.
- [x] Mutation-uncertain turns already return an escalated verification reply from `runTurn`; send it normally and do not retry.
- [x] On final retry exhaustion, emit `conversation.failed`, call `handoffFailedTurn({ inboundMessage })`, and send its idempotent fallback reply.

#### `sendReminder` — scheduled on `appointment.booked`

- [x] Schedule for `appointment.starts_at - 24h` (with defined short-notice behavior).
- [x] On fire:
  - [x] Re-read appointment; abort if status is no longer (pending, confirmed).
  - [x] Re-read connection; abort if status != active.
  - [x] Use the approved reminder template.
  - [x] If template not approved: requeue with 6 h backoff up to 3 attempts and persist the visible status.
  - [x] Insert/link the outbound message, send the template, and update `reminder_jobs.status = sent`.
  - [x] Enforce 95% of the current messaging tier using the rolling 24 h persisted-template count.

#### `bootstrapWaConnection` — triggered by `wa.connection.created`

- [x] Submit `appointment_reminder_24h` template to Business Management API.
- [x] Insert `message_templates` row with status `pending`.
- [x] Step function: poll status every 1 h up to 72 h.
- [x] On `approved`: update row, emit `wa.template.approved`.
- [x] On `rejected`: update row, emit `wa.template.rejected` (Phase 6 adds the fallback variant).
- [x] On 72 h timeout: emit `wa.template.timed_out`.

#### `purgeExpiredMessages` — daily cron

- [x] Iterate PTs; for each, delete `messages` older than `pts.retention_days`.
- [x] Skip reminder messages tied to pending/confirmed appointments (defensive).
- [x] Log purge count, retention, and cutoff to the audit log per PT.

#### `offerResumeAfterPtInactivity` — scheduled when PT takes over

- [x] Triggered by `conversation.taken_over` (emitted in Phase 7 from the Server Action).
- [x] Wait 1 h.
- [x] Re-check `ai_active` — if still false and no PT message in last 1 h, emit `conversation.resume_offered`.

#### `pollQualityRating` — daily cron per active connection

- [x] Read each `whatsapp_connections` with status `active`.
- [x] Call Graph API for quality rating and messaging tier.
- [x] Update columns; on a transition into yellow/red, emit `wa.quality_warning`.

#### `monitorWaTokenExpiry` — WhatsApp access-token expiry (added 2026-05-25)

- [x] **Context:** the Embedded Signup configuration issues a **system-user token that expires in ~60 days** (confirmed from the live config). This corrects the earlier "long-lived business token, no refresh" assumption. Reactive handling already exists (a Graph 401/403 → `status='revoked'` → `wa.connection.revoked` → PWA "Reconnect"), which is fine for dev/MVP, but a token silently dying every 60 days is poor UX for a real PT.
- [ ] **First, try to remove the problem:** check whether the Embedded Signup config / token settings can issue a **non-expiring** system-user token. If yes, this job is unnecessary.
- [x] Expiring-token fallback: store `token_expires_at`, backfill active connections, set it at connect time, and emit one `wa.connection.expiring` warning within 7 days of expiry.
- [x] Reconnect resets the warning claim; reactive revocation handling remains the final backstop.
- [ ] Reconfirm Meta's current non-refreshable system-user-token guidance before production onboarding.

### Event subscribers (Inngest functions reacting to domain events)

- [x] `appointment.booked` →
  - [x] Send an idempotent patient confirmation.
  - [x] Schedule `sendReminder`.
  - [x] Emit `notification.requested` for the PT.
- [x] `appointment.cancelled` →
  - [x] Cancel the matching reminder with Inngest `cancelOn` and mark its record cancelled.
  - [x] Send an idempotent cancellation confirmation.
  - [x] Emit `notification.requested` for the PT.
- [x] `appointment.rescheduled` →
  - [x] Cancel the old matching reminder and schedule a new run.
  - [x] Send an idempotent confirmation and emit `notification.requested`.

### Reliability guardrails

- [x] Every function uses Inngest steps for retry-sensitive side effects.
- [x] Outbound sends are wrapped in named steps.
- [x] DB writes inside steps are idempotent (`external_id`, source-event, appointment, and run checks).
- [ ] Add an AI-provider circuit breaker. **Deferred to Phase 11 observability.**

---

## Acceptance criteria

- [ ] Inbound test message → AI responds → outbound sent → all four steps visible in Inngest run history.
- [x] Replaying the same `message.received` event yields no duplicate outbound (integration-tested).
- [ ] A booked appointment shows up in Inngest's scheduled-runs view at `starts_at - 24h`.
- [ ] Cancelling that appointment removes the scheduled reminder run.
- [x] A transient/read-only AI failure retries; after three failures, one human-handoff reply is persisted and sent, with a structured `conversation.failed` event.
- [x] A mutation followed by an empty/step-limited model response does not rerun the mutation and sends the engine's verification handoff.
- [x] `purgeExpiredMessages` deletes only messages older than the retention window in fixture data.

The three remaining acceptance checks require a deployed app connected to Inngest Cloud so the run history and scheduled-run cancellation can be inspected directly.

---

## Notes

- Inngest event names should mirror domain event names — easier to reason about. `appointment.booked` is both a DB row in `events` and an Inngest event.
- Don't call the AI SDK / OpenRouter provider inside `step.run` and forget to `await` — wrap correctly so retries are coherent.
- The reminder cancellation on reschedule needs the Inngest run ID; store it in `reminder_jobs.inngest_run_id` when the reminder is scheduled.
