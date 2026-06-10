# Phase 4 — Appointments & availability

**Goal.** Real implementations of the AI's booking tools: an availability resolver, transactional booking / reschedule / cancel, an appointment state machine, and the domain events the rest of the system reacts to.

**Source.** Tech doc §3 (modules), §5.1 (booking flow); product spec `docs/medium-canvas/documents/core-user-flows.md`.

**Effort.** 3–4 days.

**Prerequisites.** Phase 1 complete. Can run in parallel with Phase 3 (engine).

---

## Tasks

### Availability resolver — `lib/appointments/availability.ts`

- [ ] `getFreeSlots({ ptId, start, end, durationMinutes, serviceType? })`:
  - [ ] Load `availability_rules` for the PT (recurring weekly schedule).
  - [ ] Materialise rules across the requested window in PT's timezone.
  - [ ] Subtract `blocked_periods` overlapping the window.
  - [ ] Subtract `appointments` with status in (pending, confirmed) overlapping the window.
  - [ ] Slice into slots of `durationMinutes` (default 60; configurable per service later).
  - [ ] Return as ISO datetimes in UTC, with PT timezone metadata for display.
- [ ] Edge cases:
  - [ ] DST transitions handled by date-fns-tz.
  - [ ] Empty rules → no slots (don't crash).
  - [ ] Window crossing midnight handled correctly.
- [ ] Performance: query is one round trip per range, not one per day.

### Booking transaction — `lib/appointments/book.ts`

- [ ] `bookAppointment({ ptId, patientId, startsAt, endsAt, serviceType, notes? })`:
  - [ ] DB transaction (`BEGIN`).
  - [ ] Check no overlapping appointment exists in (pending, confirmed). Use `SELECT … FOR UPDATE` on the row range to avoid races.
  - [ ] Insert `appointments` with status `pending`.
  - [ ] Insert `events` row (`appointment.booked`) with full payload.
  - [ ] `COMMIT`.
  - [ ] Emit Inngest event `appointment.booked` post-commit (so subscribers don't fire for rolled-back transactions).
  - [ ] Idempotency key: `(ptId, patientId, startsAt)` — re-running returns the existing appointment, doesn't create a new one.

### Reschedule — `lib/appointments/reschedule.ts`

- [ ] `rescheduleAppointment({ appointmentId, newStartsAt, newEndsAt })`:
  - [ ] Load appointment with row lock.
  - [ ] Guard: must be in (pending, confirmed); else throw typed error.
  - [ ] Conflict check on the new slot.
  - [ ] Update; status remains (pending|confirmed) but row reflects new times; previous reminder is cancelled (Phase 6).
  - [ ] Emit `appointment.rescheduled` with `{ from, to }` payload.

### Cancel — `lib/appointments/cancel.ts`

- [ ] `cancelAppointment({ appointmentId, reason?, cancelledBy: 'patient'|'pt'|'ai' })`:
  - [ ] Guard: must not already be cancelled / completed / no_show.
  - [ ] Set status `cancelled`, store reason + cancelledBy.
  - [ ] Emit `appointment.cancelled`.

### State machine

- [ ] `lib/appointments/state.ts` — explicit transition table:
  - pending → confirmed | cancelled | rescheduled
  - confirmed → cancelled | rescheduled | completed | no_show
  - rescheduled → confirmed | cancelled | rescheduled | completed | no_show
  - cancelled → (terminal)
  - completed → (terminal)
  - no_show → (terminal)
- [ ] All status changes go through `transition(appointmentId, nextStatus, ctx)` which checks legality.

### Domain event types — `lib/events/appointments.ts`

- [ ] `appointment.booked`, `appointment.confirmed`, `appointment.cancelled`, `appointment.rescheduled`, `appointment.completed`, `appointment.no_show`.
- [ ] Each event has a typed payload (Zod schema). The Inngest event names use the same strings.
- [ ] Append every event to the `events` table (DB log) in addition to emitting to Inngest.

### Tool wiring (replaces Phase 3 stubs)

- [ ] `lib/ai/dispatcher.ts` — replace stubs with real calls into `lib/appointments`.
- [ ] Implement `list_upcoming_appointments` for the engine-context patient so cancel/reschedule can resolve IDs safely.
- [ ] Each tool wraps in `withAuditLog` and respects the engine's implicit `pt_id` + `patient_id` context.

---

## Acceptance criteria

- [ ] `getFreeSlots` returns expected slots for a fixture PT with known rules + blocks + appointments.
- [ ] Two concurrent bookings for the same slot result in exactly one success (the other gets a conflict error).
- [ ] Re-running `bookAppointment` with the same idempotency key returns the existing appointment.
- [ ] State transitions illegal under the table throw a typed error and don't update the row.
- [ ] Every booking writes one `events` row and emits one Inngest event.
- [ ] AI engine end-to-end: fixture inbound → `get_availability` returns real slots → `book_appointment` writes a real row → assistant response contains the real time.

---

## Notes

- Use Postgres timestamp **with time zone** for `starts_at` / `ends_at`. Store UTC; convert at the edges.
- Don't put the recurrence/series logic here — that's deferred. The `series_id` column doesn't exist yet.
- The reminder side (24h before, response handling) is not in this phase — that's Phase 6 wiring on top of `appointment.booked`.
