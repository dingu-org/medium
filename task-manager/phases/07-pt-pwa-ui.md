# Phase 7 — PT PWA UI

**Goal.** A working PT-facing app: calendar (week + month), appointment detail, chat with manual takeover, availability editor, settings, and an onboarding flow that takes a fresh PT to a working state.

**Source.** Tech doc §3 (modules), §9 (PWA delivery); product spec `docs/medium-canvas/documents/pt-admin-pwa-screens.md`.

**Effort.** 7–10 days. The biggest phase; a solo dev should batch this in a few sittings.

**Prerequisites.** Phase 1 complete. Develop in parallel with Phases 2–6 against fixtures if the backend isn't ready.

---

## Tasks

### App shell

- [x] `/(dashboard)/layout.tsx` with bottom nav: Calendar, Chat, Settings.
- [x] Top bar: PT name, sync indicator (online/offline), notification bell (unread count from `events` filtered to notification types).
- [x] Loading + empty + error states defined as shared components in `components/states/`.
- [x] Realtime hook `useRealtimeChannel(table, filter)` used everywhere — wraps Supabase subscription, scopes by RLS naturally.

### Calendar — `/(dashboard)/calendar`

- [x] Default view: current week, mobile vertical scroll.
- [x] Toggle: month view (compact agenda).
- [x] Custom calendar built from `react-day-picker` (month) + a CSS grid week view, both driven by `date-fns`. Reserve FullCalendar only for a specific feature later that is too painful to build (e.g. drag-to-reschedule with recurring events).
- [x] Tap an appointment → bottom sheet with detail.
- [x] Realtime subscription on `appointments` filtered to current PT; calendar updates without refresh.
- [x] Show reminder status badge per appointment ("Reminder pending" / "Reminder sent" / "Confirmed").
- [x] Empty state: "No appointments yet — share your WhatsApp number to start."

### Appointment detail (sheet)

- [x] Patient: name, phone, last message snippet, link to full chat.
- [x] Times in PT timezone with day-of-week label.
- [x] Service type, notes (editable inline).
- [x] Actions: Reschedule (opens slot picker), Cancel (with reason input), Mark no-show (after start time), Mark complete (after end time).
- [x] Each action via Server Action; optimistic UI, rolled back on error.

### Chat — `/(dashboard)/chat`

- [x] Conversation list, sorted by `last_inbound_at` desc.
- [x] Each row: patient name, last message preview, "AI" or "You" badge, unread indicator.
- [x] Open conversation: messages in chronological order; auto-scroll to bottom on new message.
- [x] Realtime subscription on `messages` filtered to conversation_id.
- [x] Header toggle: "AI is handling this" ↔ "I'll take over". Toggling sets `conversations.ai_active`. When PT takes over, emit `conversation.taken_over` (consumed by Phase 5's `offerResumeAfterPtInactivity`).
- [x] Input: send-as-PT (Server Action); calls Graph API directly via `lib/channels/whatsapp`. Forces `ai_active = false`.
- [x] Window indicator: red banner if 24 h window is closed and template would be required; PT can still type — Server Action validates and returns a clear error.

### Availability — `/(dashboard)/settings/availability`

- [x] Weekly schedule editor: 7-day grid; tap to add/remove time blocks.
- [x] Time blocks save to `availability_rules` (one row per weekday range).
- [x] Blocked periods: list + "Add" button → date range, label.
- [x] Service types: data model in place; UI is minimal MVP — single default service with duration setting (60 min default).

### Settings — `/(dashboard)/settings`

- [x] Profile: practice name, timezone (auto-detected, editable).
- [x] AI: name, greeting message, escalation keyword.
- [x] Notifications: which events trigger Web Push (booking, cancel, reschedule, escalation, reminder failures).
- [x] Retention: dropdown (30 / 60 / 90 / 180 / 365 days) → updates `pts.retention_days`.
- [x] WhatsApp: connected number + status; "Reconnect" button if revoked.
- [x] Danger zone: disconnect WhatsApp, delete account (cascade with confirmation).

### Onboarding — `/(dashboard)/onboarding`

- [x] Steps detected from data state (not stored — derived from absence of rows):
  1. Profile complete (name, timezone) ?
  2. WhatsApp connected ?
  3. Availability set ?
  4. Test message sent ?
- [x] Linear stepper UI with progress bar; PT can revisit any step.
- [x] On completion → redirect to calendar with a celebratory toast.
- [x] Middleware redirects to `/onboarding` if any step is incomplete (skippable on user request).

### Realtime hooks — `lib/hooks/realtime.ts`

- [x] `useRealtimeChannel(table, filter)`, `useRealtimeRefresh(table, filter)`, `useMessages(conversationId)`, `useOnlineStatus()`.
- [x] Cleanup on unmount.
- [x] Reconnect with exponential backoff if Supabase Realtime drops.

### Performance

- [x] First contentful paint ≤ 1.5 s on simulated 3G; first interactive ≤ 3 s (per tech doc §9).
- [x] Calendar route ships its own code-split chunk; no heavy third-party calendar bundle.
- [x] Use Server Components by default; Client Components only where interaction demands.

---

## Acceptance criteria

- [x] PT can navigate the entire app on mobile; no horizontal scroll, no broken touch targets.
- [x] Calendar updates in real time when an appointment is booked from another tab.
- [x] Manual takeover toggles AI off and lets PT send a free-form message; AI does not respond to subsequent inbound until toggled back on.
- [x] Onboarding takes a fresh signup to a state where they can receive a real message.
- [x] Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95. PWA section evaluated in Phase 8.
- [x] No PII in client-side logs (verified in console).

---

## Notes

- Build the calendar last — it's the highest-effort screen and benefits from having real data flowing.
- Use shadcn's Sheet component for the appointment detail; it's the right shape for mobile.
- The Realtime channel must respect RLS — Supabase enforces this on the channel level, but verify by trying to subscribe to another PT's appointments and confirm zero events arrive.
- Chat input pattern: keep the input stuck to the bottom on iOS Safari (use `100dvh` not `100vh`).

---

## Implementation status (2026-06-17)

**Shipped (code complete, statically verified — `pnpm typecheck`, `pnpm lint`,
`pnpm build` all pass):**

- **Shared infra:** migration `0010_phase7_realtime` (adds `pts.notifications_seen_at`
  + `pts.notification_prefs`, the `supabase_realtime` publication for
  `appointments/messages/conversations/events`, and `REPLICA IDENTITY FULL` on
  those tables). Realtime hooks `lib/hooks/realtime.ts` (`useRealtimeChannel`,
  `useRealtimeRefresh`, `useMessages`, `useOnlineStatus`) — the browser client is
  **lazy-loaded** so supabase-realtime stays out of every route's initial bundle.
  Shared `components/states` (Loading/Empty/Error), `components/realtime-refresher`.
- **App shell:** top-bar notification bell (unread badge from `events` vs
  `notifications_seen_at`, sheet feed, mark-all-read) + online/offline sync
  indicator. Bottom nav unchanged (Calendar/Chat/Settings, per decision).
- **Settings:** practice + AI + notification prefs + retention form (Server
  Action writing `pts`), availability link, WhatsApp card, danger zone
  (disconnect WhatsApp, delete account via service-role admin delete).
- **Availability:** weekly editor (per-day switch + times, copy-to-all) writing
  `availability_rules`; blocked-periods list/add/delete (tz-correct via TZDate).
- **Chat:** conversation list (lateral last-message), realtime thread, takeover
  toggle (`ai_active` + `conversation.taken_over` event), send-as-PT
  (`sendFreeForm` + persist), 24h-window banner, revoked/no-connection handling.
- **Appointment detail sheet:** bottom Sheet with patient (tel/wa.me/chat link),
  PT-tz times, inline notes, reminder badge, reschedule (slot picker), cancel
  (reason), mark complete/no-show.
- **Calendar:** week vertical agenda (default) + month picker, realtime refresh,
  status dots, reminder badges, tap→sheet, today/week-nav/view toggle, FAB
  (block time + manual add appointment with patient search / add-patient).
  Backend: `bookAppointment` gained `allowOutsideAvailability` for manual books
  (overlap still enforced by the exclusion constraint).
- **Onboarding:** `/onboarding` (outside the dashboard layout to avoid a gate
  loop) — steps derived from data state, progress bar, completion CTA; soft gate
  in the dashboard layout (skippable via cookie).

**Verified (2026-06-19):**

- Applied migrations `0009_phase6_reminders` and `0010_phase7_realtime` to
  hosted Supabase with `pnpm db:migrate`.
- `pnpm test:all` passes: 245 tests across 32 files.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.
- Hosted Supabase Realtime/RLS smoke passed: a signed-in PT received their own
  `appointments` insert and did not receive another PT's insert on the same
  publication/filter path.
- Signed-in production build smoke passed on `/calendar`; mobile viewport
  `scrollWidth === innerWidth` at 390 px.
- Lighthouse mobile on signed-in `/calendar`: Performance 98, Accessibility 96,
  Best Practices 100. FCP 0.8 s, LCP 2.4 s, TBT 10 ms, CLS 0.
- Client-side console scan is clean for `app`/`components`; remaining console
  calls are server route logs.

**Critical-path First Load JS after lazy-loading realtime:** calendar ~168 kB,
chat list ~180 kB, conversation ~139 kB (was 231/244/202 kB).
