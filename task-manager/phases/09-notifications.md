# Phase 9 — Notifications

**Goal.** The PT receives Web Push notifications for new bookings, cancellations, reschedules, and explicit human-escalation requests, and tapping a notification deep-links to the relevant screen in the PWA.

**Source.** Tech doc §3 (notifications module), §9 (Web Push).

**Effort.** 1–2 days.

**Prerequisites.** Phase 7 (subscription registration in PWA), Phase 5 (event subscribers).

---

## Tasks

### Setup

- [ ] Install `web-push`.
- [ ] Use the VAPID keypair generated in Phase 0; never regenerate (it would invalidate every existing subscription).
- [ ] Expose VAPID public key via a Server Action; PWA reads it on first subscription.

### Subscription flow (PWA side)

- [ ] On first login post-onboarding (and once per browser): show a permissioning UI explaining why we want to notify them.
- [ ] On accept: subscribe via `serviceWorker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
- [ ] POST subscription to `/api/push/subscribe` Server Action; persist to `push_subscriptions`.
- [ ] On deny: respect the choice, offer a re-prompt button under settings.
- [ ] Allow PT to remove a subscription per-browser.

### Dispatcher — `lib/notifications/`

- [ ] `sendPush(ptId, payload)` — fan-out to all `push_subscriptions` for the PT.
- [ ] On 410 Gone (subscription dead): delete the row.
- [ ] On 4xx other than 410: structured-warn, leave the row (could be transient).
- [ ] Payload shape: `{ title, body, url, tag }`.
  - `tag` deduplicates ("appointment-12345-booked" prevents duplicate booking pushes).
- [ ] Title + body templates per event type (i18n later).

### Event subscribers (extends Phase 5 stubs)

- [ ] `appointment.booked` → "New booking — {patient_name} at {time}". URL: `/calendar?appointmentId=…`.
- [ ] `appointment.cancelled` → "Cancelled — {patient_name} at {time}". URL: same.
- [ ] `appointment.rescheduled` → "Rescheduled — {patient_name} now at {new_time}".
- [ ] `conversation.escalated` → "{patient_name} asked to talk to you". URL: `/chat/{conversationId}`.
- [ ] `conversation.resume_offered` → "Want me to take back over with {patient_name}?". URL: `/chat/{conversationId}`.
- [ ] `wa.connection.revoked` → "Reconnect WhatsApp — your connection was revoked". URL: `/settings`.
- [ ] `reminder.failed` → "Reminder couldn't be sent — {patient_name}". URL: appointment detail.

### Service worker push handler

- [ ] In Serwist, register a `push` event handler that displays the notification.
- [ ] `notificationclick` handler navigates to `payload.url`.
- [ ] If the app is already open at that URL, focus the existing window.

### Per-event opt-out

- [ ] PT settings (Phase 7) lets them disable categories. Read the setting in the dispatcher; skip if disabled.

---

## Acceptance criteria

- [ ] After signup + permission grant, a `push_subscriptions` row exists.
- [ ] A test booking fires a Web Push that appears on the registered browser.
- [ ] Tapping the notification opens the relevant screen.
- [ ] Two rapid bookings for the same appointment (rare race) deduplicate via `tag`.
- [ ] An expired subscription (simulate by hand-deleting on the browser) returns 410 on next push and the dispatcher removes the DB row.
- [ ] PT can disable "reschedule" notifications and they stop arriving.

---

## Notes

- iOS PWA Web Push works but only for installed PWAs. Test on a real device, not just the simulator.
- VAPID keys must be base64url-encoded when sent to the browser. `web-push` provides helpers.
- Don't include patient names in the push title if iOS lock-screen privacy is a concern — keep details inside the notification body, surfaced after unlock.
- Track delivery rate in the internal Phase 11 dashboard — Web Push silently fails sometimes.
