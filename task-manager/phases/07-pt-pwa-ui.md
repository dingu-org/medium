# Phase 7 — PT PWA UI

**Goal.** A working PT-facing app: calendar (week + month), appointment detail, chat with manual takeover, availability editor, settings, and an onboarding flow that takes a fresh PT to a working state.

**Source.** Tech doc §3 (modules), §9 (PWA delivery); product spec `docs/medium-canvas/documents/pt-admin-pwa-screens.md`.

**Effort.** 7–10 days. The biggest phase; a solo dev should batch this in a few sittings.

**Prerequisites.** Phase 1 complete. Develop in parallel with Phases 2–6 against fixtures if the backend isn't ready.

---

## Tasks

### App shell

- [ ] `/(dashboard)/layout.tsx` with bottom nav: Calendar, Chat, Settings.
- [ ] Top bar: PT name, sync indicator (online/offline), notification bell (unread count from `events` filtered to notification types).
- [ ] Loading + empty + error states defined as shared components in `components/states/`.
- [ ] Realtime hook `useRealtimeChannel(table, filter)` used everywhere — wraps Supabase subscription, scopes by RLS naturally.

### Calendar — `/(dashboard)/calendar`

- [ ] Default view: current week, mobile vertical scroll.
- [ ] Toggle: month view (compact agenda).
- [ ] FullCalendar integration; lazy-load the calendar bundle on this route only (per tech doc §9 perf budget). If FullCalendar bundle is too heavy, fall back to a custom layout with date-fns.
- [ ] Tap an appointment → bottom sheet with detail.
- [ ] Realtime subscription on `appointments` filtered to current PT; calendar updates without refresh.
- [ ] Show reminder status badge per appointment ("Reminder pending" / "Reminder sent" / "Confirmed").
- [ ] Empty state: "No appointments yet — share your WhatsApp number to start."

### Appointment detail (sheet)

- [ ] Patient: name, phone, last message snippet, link to full chat.
- [ ] Times in PT timezone with day-of-week label.
- [ ] Service type, notes (editable inline).
- [ ] Actions: Reschedule (opens slot picker), Cancel (with reason input), Mark no-show (after start time), Mark complete (after end time).
- [ ] Each action via Server Action; optimistic UI, rolled back on error.

### Chat — `/(dashboard)/chat`

- [ ] Conversation list, sorted by `last_inbound_at` desc.
- [ ] Each row: patient name, last message preview, "AI" or "You" badge, unread indicator.
- [ ] Open conversation: messages in chronological order; auto-scroll to bottom on new message.
- [ ] Realtime subscription on `messages` filtered to conversation_id.
- [ ] Header toggle: "AI is handling this" ↔ "I'll take over". Toggling sets `conversations.ai_active`. When PT takes over, emit `conversation.taken_over` (consumed by Phase 5's `offerResumeAfterPtInactivity`).
- [ ] Input: send-as-PT (Server Action); calls Graph API directly via `lib/channels/whatsapp`. Forces `ai_active = false`.
- [ ] Window indicator: red banner if 24 h window is closed and template would be required; PT can still type — Server Action validates and returns a clear error.

### Availability — `/(dashboard)/settings/availability`

- [ ] Weekly schedule editor: 7-day grid; tap to add/remove time blocks.
- [ ] Time blocks save to `availability_rules` (one row per weekday range).
- [ ] Blocked periods: list + "Add" button → date range, label.
- [ ] Service types: data model in place; UI is minimal MVP — single default service with duration setting (60 min default).

### Settings — `/(dashboard)/settings`

- [ ] Profile: practice name, timezone (auto-detected, editable).
- [ ] AI: name, greeting message, escalation keyword.
- [ ] Notifications: which events trigger Web Push (booking, cancel, reschedule, escalation, reminder failures).
- [ ] Retention: dropdown (30 / 60 / 90 / 180 / 365 days) → updates `pts.retention_days`.
- [ ] WhatsApp: connected number + status; "Reconnect" button if revoked.
- [ ] Danger zone: disconnect WhatsApp, delete account (cascade with confirmation).

### Onboarding — `/(dashboard)/onboarding`

- [ ] Steps detected from data state (not stored — derived from absence of rows):
  1. Profile complete (name, timezone) ?
  2. WhatsApp connected ?
  3. Availability set ?
  4. Test message sent ?
- [ ] Linear stepper UI with progress bar; PT can revisit any step.
- [ ] On completion → redirect to calendar with a celebratory toast.
- [ ] Middleware redirects to `/onboarding` if any step is incomplete (skippable on user request).

### Realtime hooks — `lib/hooks/realtime.ts`

- [ ] `useAppointments(ptId)`, `useMessages(conversationId)`, `useConversation(conversationId)`.
- [ ] Cleanup on unmount.
- [ ] Reconnect with exponential backoff if Supabase Realtime drops.

### Performance

- [ ] First contentful paint ≤ 1.5 s on simulated 3G; first interactive ≤ 3 s (per tech doc §9).
- [ ] Calendar route lazy-loads FullCalendar.
- [ ] Use Server Components by default; Client Components only where interaction demands.

---

## Acceptance criteria

- [ ] PT can navigate the entire app on mobile; no horizontal scroll, no broken touch targets.
- [ ] Calendar updates in real time when an appointment is booked from another tab.
- [ ] Manual takeover toggles AI off and lets PT send a free-form message; AI does not respond to subsequent inbound until toggled back on.
- [ ] Onboarding takes a fresh signup to a state where they can receive a real message.
- [ ] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95. PWA section evaluated in Phase 8.
- [ ] No PII in client-side logs (verified in console).

---

## Notes

- Build the calendar last — it's the highest-effort screen and benefits from having real data flowing.
- Use shadcn's Sheet component for the appointment detail; it's the right shape for mobile.
- The Realtime channel must respect RLS — Supabase enforces this on the channel level, but verify by trying to subscribe to another PT's appointments and confirm zero events arrive.
- Chat input pattern: keep the input stuck to the bottom on iOS Safari (use `100dvh` not `100vh`).
