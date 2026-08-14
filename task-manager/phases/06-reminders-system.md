# Phase 6 — Reminders system

**Goal.** A 24-hour reminder fires reliably for every appointment, the patient's CONFIRM / CANCEL / RESCHEDULE response transitions the appointment, and the PT can see the status of pending reminders (especially when a template is awaiting Meta approval).

**Source.** Tech doc §5.2; product spec `docs/medium-canvas/documents/reminder-system.md`.

**Effort.** 2–3 days.

**Prerequisites.** Phase 5 complete (Inngest functions + scheduling).

---

## Tasks

### Template lifecycle

- [x] Define the reminder template body (per spec doc):
  - `appointment_reminder_24h_v2` — body-only, variables: patient first name, practice name, appointment time, response instructions. Existing `appointment_reminder_24h` remains supported as legacy fallback for already-approved accounts.
- [x] Submit on `wa.connection.created` (wired in Phase 5's `bootstrapWaConnection`).
- [x] Track approval in `message_templates`; surface it in the dashboard in Phase 7.
- [x] Define a fallback variant; if the primary is rejected, auto-submit the fallback.

### Reminder dispatch (extends Phase 5's `sendReminder`)

- [x] Variable binding from `appointments` + `patients` + `pts` for patient first name and appointment time in the PT timezone. Practice-name binding remains with any final template revision.
- [x] Refuse to send if template status != approved; requeue with backoff.
- [x] Refuse to send if `whatsapp_connections.status != 'active'`; emit `reminder.skipped` with reason.
- [x] On send: insert/link the `messages` row (`role=ai`, `template_id` set), count it toward rolling tier usage, and update `reminder_jobs.status = sent`.

### Response parsing — `lib/language/reply-intent.ts`

> Moved out of `lib/reminders/parse-response.ts` on 2026-08-14: the handoff offer
> reads the same replies, so the affirmative has one shared definition
> (`isAffirmative`) instead of one per subsystem.

- [x] Match against keyword set per locale:
  - **EN:** confirm | yes | y | ok | sure → CONFIRM
  - cancel | no | n → CANCEL
  - stop → OPT_OUT
  - reschedule | change | move → RESCHEDULE
  - **DE / IT / FR / ES** equivalents (per spec doc §language-coverage).
- [x] Anchor matching to the _first_ full word, case-insensitive, allowing leading/trailing punctuation.
- [x] If no match: hand off to a reminder-aware AI engine path — the model can interpret nuanced replies.

### Response handling

- [x] On CONFIRM: `transition(appointment, 'confirmed')`, emit `appointment.confirmed`, send a brief "see you then" reply.
- [x] On CANCEL: `transition(appointment, 'cancelled', { cancelledBy: 'patient' })`, send acknowledgement + offer to rebook.
- [x] On RESCHEDULE: record `reschedule_requested`, immediately offer real slots, then route follow-up selection through the reminder-aware AI engine.
- [x] Reminder-aware AI receives a system hint with reminder context and may run even when `ai_active = false`.

### Reminder visibility for the PT (data hooks, UI in Phase 7)

- [x] `reminder_jobs` row per appointment with `status` (scheduled, sent, requeued, skipped, failed, cancelled).
- [x] Joinable on appointment id so the PT detail view can show scheduled time and pending/failure state.

### Throttling / safety

- [ ] If the rolling 24 h send count is approaching the rate tier cap, schedule reminders earlier in the day (still within 24 h of appointment) to spread load — only relevant once a PT is busy enough; defer the optimisation but leave a TODO.

---

## Acceptance criteria

- [ ] An appointment booked for "tomorrow" fires a reminder 24 h before, with correct variables, in the PT's timezone.
- [x] Replying CONFIRM transitions the appointment to confirmed.
- [x] Replying CANCEL transitions to cancelled and the calendar updates via Realtime.
- [x] Replying "can we move it to Thursday?" enters the AI rebook flow with no special-cased keyword path.
- [x] If the template is unapproved, the reminder is requeued and `reminder_jobs.status = requeued` is persisted.
- [ ] Cancelling an appointment cancels the scheduled reminder run (no orphaned send).
- [x] German / Italian fixtures of CONFIRM keywords work (sample 2–3 per language).

Verification on 2026-06-19: migration `0009_phase6_reminders` is applied to
hosted Supabase. `pnpm test:all` passes (245 tests), plus `pnpm typecheck`,
`pnpm lint`, and `pnpm build`.

---

## Notes

- Reminder responses bypass `ai_active = false` — even if the PT has taken over, a CONFIRM still updates the appointment status. Document this in the spec; it's a sharp edge.
- If a patient sends "yes thanks" we want to match. The matcher must tolerate trailing words while still anchoring on the first one.
- Don't over-fit the keyword matcher. When in doubt, fall through to the AI engine — that's the whole point of having one.
- The reminder template content is immutable once submitted; if you want to change wording, submit a new template variant and migrate.
