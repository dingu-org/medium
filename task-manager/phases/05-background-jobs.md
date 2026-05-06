# Phase 5 — Background jobs (Inngest)

**Goal.** All asynchronous work — running an AI turn, sending outbound, scheduling reminders, polling template approval, retention purge — runs in Inngest with retries, idempotency, and proper event subscriptions.

**Source.** Tech doc §2 (jobs row), §3 (modules), §5.1–5.4, §14.

**Effort.** 3–4 days.

**Prerequisites.** Phases 2, 3, 4 complete.

---

## Tasks

### Inngest setup

- [ ] Install `inngest`.
- [ ] `lib/events/inngest.ts` — typed Inngest client; declare event types union (Zod-derived).
- [ ] `app/api/inngest/route.ts` — serves all functions.
- [ ] Set Inngest signing key + event key in env; verify in Inngest dashboard the app shows up.
- [ ] Local dev: run `npx inngest-cli dev`; production: Inngest cloud.

### Functions

#### `handleInboundMessage` — triggered by `message.received`

- [ ] Load `message`, `conversation`, `pt`, `whatsapp_connection`.
- [ ] If `conversations.ai_active = false`, do nothing (PT is handling it).
- [ ] Translate message into channel-agnostic `InboundMessage` shape.
- [ ] Call `lib/conversation/engine.runTurn`.
- [ ] Send the engine's outbound message via the appropriate channel adapter.
- [ ] Idempotency: keyed on `messages.external_id`; don't re-run if the inbound is already responded to.
- [ ] Retries: 3 attempts with exponential backoff. On final failure, mark conversation flagged + emit `conversation.failed` (handled by notifications later).

#### `sendReminder` — scheduled on `appointment.booked`

- [ ] Schedule for `appointment.starts_at - 24h`.
- [ ] On fire:
  - [ ] Re-read appointment; abort if status is no longer (pending, confirmed).
  - [ ] Re-read connection; abort if status != active (PT will be notified to reconnect via separate alerting).
  - [ ] Check 24 h window — should be closed; use approved template.
  - [ ] If template not approved: requeue with 6 h backoff up to 3 attempts; surface in dashboard.
  - [ ] Send template; update `reminder_jobs.status = sent`.
  - [ ] Increment rate-tier counter.

#### `bootstrapWaConnection` — triggered by `wa.connection.created`

- [ ] Submit `appointment_reminder_24h` template to Business Management API.
- [ ] Insert `message_templates` row with status `pending`.
- [ ] Step function: poll status every 1 h up to 72 h.
- [ ] On `approved`: update row, emit `wa.template.approved`.
- [ ] On `rejected`: update row, emit `wa.template.rejected` (Phase 6 wiring shows fallback variant).

#### `purgeExpiredMessages` — daily cron

- [ ] Iterate active PTs; for each, delete `messages` older than `pts.retention_days`.
- [ ] Skip messages tied to non-completed appointments (defensive).
- [ ] Log the purge count to the audit log per PT.

#### `offerResumeAfterPtInactivity` — scheduled when PT takes over

- [ ] Triggered by `conversation.taken_over` (emitted in Phase 7 from the Server Action).
- [ ] Wait 1 h.
- [ ] Re-check `ai_active` — if still false and no PT message in last 1 h, emit `conversation.resume_offered` (handled by notifications: Web Push to PT).

#### `pollQualityRating` — daily cron per active connection

- [ ] Read each `whatsapp_connections` with status `active`.
- [ ] Call Graph API for quality rating.
- [ ] Update column; if rating drops to a warning level, emit `wa.quality_warning` (notifications fan-out).

### Event subscribers (Inngest functions reacting to domain events)

- [ ] `appointment.booked` →
  - [ ] Send confirmation to patient (free-form, since 24 h window is open by definition — they just messaged).
  - [ ] Schedule `sendReminder`.
  - [ ] Emit Web Push to PT (Phase 9 will handle the actual push; for now emit `notification.requested`).
- [ ] `appointment.cancelled` →
  - [ ] Cancel scheduled reminder run (Inngest cancel-by-id).
  - [ ] Send cancellation confirmation to patient.
  - [ ] Emit `notification.requested` to PT.
- [ ] `appointment.rescheduled` →
  - [ ] Cancel old reminder, schedule new one.
  - [ ] Send confirmation, emit notification.

### Reliability guardrails

- [ ] Every function uses Inngest's `step.run` for side effects so retries don't double-send.
- [ ] Outbound send wrapped in `step.run('send-template', …)` etc.
- [ ] DB writes inside steps are idempotent (use `external_id` / `appointment_id` checks).
- [ ] Add a circuit-breaker for the AI client: if Anthropic 5xx-rate exceeds X% in 5 min, pause inbound handling and Sentry-alert. (Stretch; can defer.)

---

## Acceptance criteria

- [ ] Inbound test message → AI responds → outbound sent → all four steps visible in Inngest run history.
- [ ] Replaying the same `message.received` event yields no duplicate outbound (idempotent).
- [ ] A booked appointment shows up in Inngest's scheduled-runs view at `starts_at - 24h`.
- [ ] Cancelling that appointment removes the scheduled reminder run.
- [ ] Failing one Anthropic call retries; failing three fails the run cleanly with a Sentry record.
- [ ] `purgeExpiredMessages` deletes only messages older than the retention window in fixture data.

---

## Notes

- Inngest event names should mirror domain event names — easier to reason about. `appointment.booked` is both a DB row in `events` and an Inngest event.
- Don't call the Anthropic SDK inside `step.run` and forget to `await` — wrap correctly so retries are coherent.
- The reminder cancellation on reschedule needs the Inngest run ID; store it in `reminder_jobs.inngest_run_id` when the reminder is scheduled.
