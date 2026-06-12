# Phase 4 — Appointments & availability

**Goal.** Real implementations of the AI's booking tools: an availability resolver, transactional booking / reschedule / cancel, an appointment state machine, and the domain events the rest of the system reacts to.

**Source.** Tech doc §3 (modules), §5.1 (booking flow); product spec `docs/medium-canvas/documents/core-user-flows.md`.

**Effort.** 3–4 days.

**Prerequisites.** Phase 1 complete. Can run in parallel with Phase 3 (engine).

---

## Implementation decisions (2026-06-12)

- Reschedule updates the existing appointment row and preserves its pending/confirmed status.
- Pending appointments may transition directly to completed or no_show.
- MVP scheduling uses a fixed 60-minute duration and no appointment buffer.
- Postgres enforces non-overlapping active appointments with a range exclusion constraint.
- Domain events are transactionally paired with a durable outbox and published to Inngest with the event UUID as the idempotency ID.

---

## Tasks

### Availability resolver — `lib/appointments/availability.ts`

- [x] `getFreeSlots({ ptId, start, end, durationMinutes, serviceType? })`:
  - [x] Load `availability_rules` for the PT (recurring weekly schedule).
  - [x] Materialise rules across the requested window in PT's timezone.
  - [x] Subtract `blocked_periods` overlapping the window.
  - [x] Subtract `appointments` with status in (pending, confirmed) overlapping the window.
  - [x] Slice into slots of `durationMinutes` (default 60; configurable per service later).
  - [x] Return as ISO datetimes in UTC, with PT timezone metadata for display.
- [x] Edge cases:
  - [x] DST transitions handled by `@date-fns/tz`.
  - [x] Empty rules → no slots (don't crash).
  - [x] Window crossing midnight handled correctly.
- [x] Performance: query is one round trip per range, not one per day.

### Booking transaction — `lib/appointments/book.ts`

- [x] `bookAppointment({ ptId, patientId, startsAt, serviceType, notes? })`:
  - [x] DB transaction (`BEGIN`).
  - [x] Serialize per PT and enforce active non-overlap with a Postgres exclusion constraint.
  - [x] Insert `appointments` with status `pending`.
  - [x] Insert `events` row (`appointment.booked`) with full payload.
  - [x] `COMMIT`.
  - [x] Publish through the durable outbox post-commit with the event UUID as Inngest's idempotency ID.
  - [x] Idempotency key: `(ptId, patientId, startsAt)` — re-running returns the existing appointment, doesn't create a new one.

### Reschedule — `lib/appointments/reschedule.ts`

- [x] `rescheduleAppointment({ ptId, patientId?, appointmentId, newStartsAt })`:
  - [x] Load appointment with row lock.
  - [x] Guard: must be in (pending, confirmed); else throw typed error.
  - [x] Conflict check on the new slot.
  - [x] Update in place; status remains pending/confirmed and reminder rewiring remains Phase 5–6.
  - [x] Emit `appointment.rescheduled` with `{ from, to }` payload.

### Cancel — `lib/appointments/cancel.ts`

- [x] `cancelAppointment({ ptId, patientId?, appointmentId, reason?, cancelledBy })`:
  - [x] Guard terminal states through the transition table.
  - [x] Set status `cancelled`, store reason + cancelledBy.
  - [x] Emit `appointment.cancelled`.

### State machine

- [x] `lib/appointments/state.ts` — explicit transition table:
  - pending → confirmed | cancelled | completed | no_show
  - confirmed → cancelled | completed | no_show
  - rescheduled → confirmed | cancelled | completed | no_show (legacy compatibility)
  - cancelled → (terminal)
  - completed → (terminal)
  - no_show → (terminal)
- [x] All status changes go through `transitionAppointment(...)`, which checks legality.

### Domain event types — `lib/events/appointments.ts`

- [x] `appointment.booked`, `appointment.confirmed`, `appointment.cancelled`, `appointment.rescheduled`, `appointment.completed`, `appointment.no_show`.
- [x] Each event has a typed payload (Zod schema). The Inngest event names use the same strings.
- [x] Append every event to `events` and a transactionally paired `event_outbox` row.
- [x] Attempt immediate post-commit delivery and retry due/expired leases every minute.

### Tool wiring (replaces Phase 3 stubs)

- [x] `lib/ai/dispatcher.ts` — replace stubs with real calls into `lib/appointments`.
- [x] Implement `list_upcoming_appointments` for the engine-context patient so cancel/reschedule can resolve IDs safely.
- [x] Each tool wraps in `withAuditLog` and respects the engine's implicit `pt_id` + `patient_id` context.

---

## Acceptance criteria

- [x] `getFreeSlots` returns expected slots for a fixture PT with known rules + blocks + appointments.
- [x] Two concurrent bookings for the same slot result in exactly one success (the other gets a conflict error).
- [x] Re-running `bookAppointment` with the same idempotency key returns the existing appointment.
- [x] State transitions illegal under the table throw a typed error and don't update the row.
- [x] Every booking writes one `events` row and publishes one idempotently keyed Inngest event.
- [x] AI engine end-to-end: fixture inbound → real availability → real booking → assistant response contains the real time.

---

## Notes

- Use Postgres timestamp **with time zone** for `starts_at` / `ends_at`. Store UTC; convert at the edges.
- Don't put the recurrence/series logic here — that's deferred. The `series_id` column doesn't exist yet.
- The reminder side (24h before, response handling) is not in this phase — that's Phase 6 wiring on top of `appointment.booked`.
