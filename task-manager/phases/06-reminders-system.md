# Phase 6 — Reminders system

**Goal.** A 24-hour reminder fires reliably for every appointment, the patient's CONFIRM / CANCEL / RESCHEDULE response transitions the appointment, and the PT can see the status of pending reminders (especially when a template is awaiting Meta approval).

**Source.** Tech doc §5.2; product spec `docs/medium-canvas/documents/reminder-system.md`.

**Effort.** 2–3 days.

**Prerequisites.** Phase 5 complete (Inngest functions + scheduling).

---

## Tasks

### Template lifecycle

- [ ] Define the reminder template body (per spec doc):
  - `appointment_reminder_24h` — variables: `{{patient_name}}`, `{{appointment_time}}`, `{{practice_name}}`, response-instructions footer.
- [x] Submit on `wa.connection.created` (wired in Phase 5's `bootstrapWaConnection`).
- [x] Track approval in `message_templates`; surface it in the dashboard in Phase 7.
- [ ] Define a fallback variant; if the primary is rejected, auto-submit the fallback.

### Reminder dispatch (extends Phase 5's `sendReminder`)

- [x] Variable binding from `appointments` + `patients` + `pts` for patient first name and appointment time in the PT timezone. Practice-name binding remains with any final template revision.
- [x] Refuse to send if template status != approved; requeue with backoff.
- [ ] Refuse to send if `whatsapp_connections.status != 'active'`; emit `reminder.skipped` with reason.
- [x] On send: insert/link the `messages` row (`role=ai`, `template_id` set), count it toward rolling tier usage, and update `reminder_jobs.status = sent`.

### Response parsing — `lib/reminders/parse-response.ts`

- [ ] Match against keyword set per locale:
  - **EN:** confirm | yes | y | ok | sure → CONFIRM
  - cancel | no | n | stop → CANCEL
  - reschedule | change | move → RESCHEDULE
  - **DE / IT / FR / ES** equivalents (per spec doc §language-coverage).
- [ ] Anchor matching to the _first_ full word, case-insensitive, allowing leading/trailing punctuation.
- [ ] If no match: hand off to AI engine (no special path) — the model can interpret nuanced replies.

### Response handling

- [ ] On CONFIRM: `transition(appointment, 'confirmed')`, emit `appointment.confirmed`, AI sends a brief "see you then" reply.
- [ ] On CANCEL: `transition(appointment, 'cancelled', { cancelledBy: 'patient' })`, AI sends acknowledgement + offer to rebook.
- [ ] On RESCHEDULE: AI engine starts the rebook flow (calls `get_availability`, then `reschedule_appointment` with the chosen slot).
- [ ] These are routed _through_ the conversation engine (so cached prompts apply) but the engine sees a system hint that the inbound is a reminder response — the prompt has explicit instructions for these three keywords.

### Reminder visibility for the PT (data hooks, UI in Phase 7)

- [x] `reminder_jobs` row per appointment with `status` (scheduled, sent, requeued, skipped, failed, cancelled).
- [x] Joinable on appointment id so the PT detail view can show scheduled time and pending/failure state.

### Throttling / safety

- [ ] If the rolling 24 h send count is approaching the rate tier cap, schedule reminders earlier in the day (still within 24 h of appointment) to spread load — only relevant once a PT is busy enough; defer the optimisation but leave a TODO.

---

## Acceptance criteria

- [ ] An appointment booked for "tomorrow" fires a reminder 24 h before, with correct variables, in the PT's timezone.
- [ ] Replying CONFIRM transitions the appointment to confirmed.
- [ ] Replying CANCEL transitions to cancelled and the calendar updates via Realtime.
- [ ] Replying "can we move it to Thursday?" enters the AI rebook flow with no special-cased keyword path.
- [x] If the template is unapproved, the reminder is requeued and `reminder_jobs.status = requeued` is persisted.
- [ ] Cancelling an appointment cancels the scheduled reminder run (no orphaned send).
- [ ] German / Italian fixtures of CONFIRM keywords work (sample 2–3 per language).

---

## Notes

- Reminder responses bypass `ai_active = false` — even if the PT has taken over, a CONFIRM still updates the appointment status. Document this in the spec; it's a sharp edge.
- If a patient sends "yes thanks" we want to match. The matcher must tolerate trailing words while still anchoring on the first one.
- Don't over-fit the keyword matcher. When in doubt, fall through to the AI engine — that's the whole point of having one.
- The reminder template content is immutable once submitted; if you want to change wording, submit a new template variant and migrate.
