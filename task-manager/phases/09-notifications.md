# Phase 9 — Notifications

**Goal.** The PT receives Web Push notifications for new bookings, cancellations, reschedules, and explicit human-escalation requests, and tapping a notification deep-links to the relevant screen in the PWA.

**Source.** Tech doc §3 (notifications module), §9 (Web Push).

**Effort.** 1–2 days.

**Prerequisites.** Phase 7 (subscription registration in PWA), Phase 5 (event subscribers).

---

## Tasks

### Setup

- [x] Install `web-push`. (Added `@types/web-push` too — the package ships no types.)
- [x] Use the VAPID keypair generated in Phase 0; never regenerate (it would invalidate every existing subscription). (`lib/notifications/push.ts` reads `VAPID_*` from env; throws at construction; a throwaway keypair lives in `.env.test`.)
- [x] Expose VAPID public key via a Server Action; PWA reads it on first subscription. (`getVapidPublicKey` in `settings/push-actions.ts`.)

### Subscription flow (PWA side)

- [x] On first login post-onboarding (and once per browser): show a permissioning UI explaining why we want to notify them. (`PushPromptBanner` in `components/pwa/pwa-provider.tsx`, gated on visits ≥ 2 + a 7-day localStorage dismiss key.)
- [x] On accept: subscribe via `serviceWorker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. (`lib/pwa/push-client.ts`.)
- [x] POST subscription to a Server Action; persist to `push_subscriptions`. (`savePushSubscription` upserts on `endpoint`; migration `0015` adds the unique index.)
- [x] On deny: respect the choice, offer a re-prompt button under settings. (`settings/push-notifications.tsx` shows denied/blocked state + a re-enable toggle.)
- [x] Allow PT to remove a subscription per-browser. (`unsubscribeFromPush` + `removePushSubscription`.)

### Dispatcher — `lib/notifications/`

- [x] `sendPush(ptId, payload)` — fan-out to all `push_subscriptions` for the PT.
- [x] On 410 Gone (subscription dead): delete the row. (Also 404.)
- [x] On 4xx other than 410: structured-warn, leave the row (could be transient).
- [x] Payload shape: `{ title, body, url, tag }`.
  - `tag` deduplicates ("appointment-12345-booked" prevents duplicate booking pushes).
- [x] Title + body templates per event type. (`push-payload.ts`, Albanian; patient names kept out of titles.)
- [x] Surface the fan-out result. `sendPush` returns `{ sent, removed }`; `dispatchPushForEvent` now returns those counts (previously discarded, so it always reported `sent` even when it reached zero browsers) and structured-warns when a PT _had_ subscriptions but every one was stale (`sent===0 && removed>0`). The counts are the Inngest step output, so each dispatch's real reach is recorded in run history — the delivery signal Phase 11's dashboard reads. (Persistent delivery-rate metrics remain Phase 11.)

### Event subscribers (extends Phase 5 stubs)

Wired as a single multi-trigger Inngest function (`lib/inngest/functions/dispatch-push.ts`) → `dispatchPushForEvent`. Appointment pushes hang off the existing `notification.requested` intent event.

- [x] `appointment.booked` → "Rezervim i ri" / body has patient + time. URL: `/calendar?appointmentId=…`.
- [x] `appointment.cancelled` → "Takim i anuluar". URL: same.
- [x] `appointment.rescheduled` → "Takim i ricaktuar". URL: same.
- [x] `conversation.escalated` → "{patient} kërkoi të flasë me ty". URL: `/chat/{conversationId}`. (New event — emitted transactionally from `escalateConversationToHuman`.)
- [x] `conversation.resume_offered` → "Ta rimarr bisedën?". URL: `/chat/{conversationId}`.
- [x] `wa.connection.revoked` → "WhatsApp u shkëput". URL: `/settings`.
- [x] `reminder.failed` → "Kujtesa nuk u dërgua". URL: appointment detail.

### Service worker push handler

- [x] In Serwist, register a `push` event handler that displays the notification. (`app/sw.ts`; verified in generated `public/sw.js`.)
- [x] `notificationclick` handler navigates to `payload.url`.
- [x] If the app is already open at that URL, focus the existing window. (`focusOrOpenWindow` matches on pathname, navigates if the query differs.)

### Per-event opt-out

- [x] PT settings lets them disable categories. Read the setting in the dispatcher; skip if disabled. (Seven `NOTIFICATION_PREF_KEYS`; `dispatchPushForEvent` gates via `resolveNotificationPrefs`. Added two new keys — `connection`, `resumeOffer` — per the product decision to make all seven events opt-out-able.)

---

## Acceptance criteria

Automated coverage in place and executed green this session (`pnpm test:all` = 50 files / 355 tests, plus typecheck/lint/build): `push-payload.test.ts` (event→payload mapping, deep links, tags, name-out-of-title), `push.integration.test.ts` (fan-out, 410 → row delete, transient → row kept + warn, secret-safety — the "never logs endpoint/keys" sentinel was hardened from a 2-char `'a1'` that flaked ~11% against random subscription UUIDs to a non-hex `'AUTHMARK'`), `push-dispatch.integration.test.ts` (now exhaustive: all seven event→pref gates through the DB-backed path via `describe.each(NOTIFICATION_PREF_KEYS)`, plus fan-out-count propagation and the all-stale warn), `escalation.integration.test.ts` (event appended + published). The generated `public/sw.js` contains the `push`/`notificationclick` handlers.

**Device-free transport smoke — `pnpm push:smoke` (`scripts/smoke-push.ts`).** Uses the app's real VAPID keys and the same `web-push` library the dispatcher uses to build an actual push request via `generateRequestDetails` (genuine VAPID JWT signing + aes128gcm encryption), then asserts it is exactly what a push service validates before accepting: POST, `Content-Encoding: aes128gcm`, TTL, non-empty encrypted body, and a VAPID `Authorization` header whose JWT verifies (ES256) against our public key with the right audience/subject/expiry. Passes (12/12). This closes the "does our push produce a valid, correctly-signed request" slice of the live acceptance items without a browser, device, or database. The only remaining unverified hop is the real push service → browser render.

- [ ] After signup + permission grant, a `push_subscriptions` row exists. _(Code complete; needs a real browser permission grant.)_
- [ ] A test booking fires a Web Push that appears on the registered browser. _(Request validity now proven device-free by `pnpm push:smoke`; the real push-service → browser render hop still needs a device.)_
- [ ] Tapping the notification opens the relevant screen. _(Handler implemented + unit-covered; live tap pending.)_
- [x] Two rapid bookings for the same appointment (rare race) deduplicate via `tag`. _(Deterministic `tag` per subject; verified in `push-payload.test.ts`.)_
- [x] An expired subscription returns 410 on next push and the dispatcher removes the DB row. _(Verified in `push.integration.test.ts`.)_
- [x] PT can disable a category and it stops arriving. _(Now verified for all seven categories through the DB-backed dispatch path in `push-dispatch.integration.test.ts`.)_

**Remaining — genuinely needs a device / external account (cannot be closed from a headless box):**

Desktop Chrome (fastest end-to-end confirmation), with Docker + `supabase start` up and a signed-in PT:

1. Run `pnpm dev`, sign in, and accept the push permission banner (or Settings toggle). Confirm a `push_subscriptions` row appears for the PT.
2. Trigger a booking (or fire a `notification.requested` event through the Inngest dev server). Confirm the OS notification appears with the right title/body.
3. Click it — confirm it deep-links to `/calendar?appointmentId=…` and focuses an existing tab if one is open.
4. Hand-delete the subscription in DevTools (Application → Service Workers → Push) or let it expire, push again, and confirm the row is removed on the 410.

Then:

- [ ] iOS delivery on an **installed** PWA (Add to Home Screen), on a real device — not the simulator.
- [ ] Confirm `VAPID_*` (public/private/subject) are set in Vercel **Preview + Production** before any deployed push test. `NEXT_PUBLIC`-free, so runtime-read — but a missing key throws at module load (`lib/notifications/push.ts`).

---

## Notes

- iOS PWA Web Push works but only for installed PWAs. Test on a real device, not just the simulator.
- VAPID keys must be base64url-encoded when sent to the browser. `web-push` provides helpers.
- Don't include patient names in the push title if iOS lock-screen privacy is a concern — keep details inside the notification body, surfaced after unlock.
- Track delivery rate in the internal Phase 11 dashboard — Web Push silently fails sometimes.
