# Phase 8 — PWA features

**Goal.** The app is installable to home screen, the PT can read their cached calendar / messages / settings offline, and writes made offline replay when the connection returns.

**Source.** Tech doc §9; product spec `docs/medium-canvas/documents/pt-admin-pwa-screens.md` § Offline handling.

**Effort.** 3–4 days.

**Prerequisites.** Phase 7 complete (the app must exist before it can be installed).

---

## Tasks

### Manifest + icons

- [x] `public/manifest.json`:
  - `name`, `short_name`, `start_url: '/calendar'`, `display: 'standalone'`, `background_color`, `theme_color`, `orientation: 'portrait'`, `lang`, `dir`.
- [x] Icon set in `public/icons/`: 192, 256, 384, 512 px; maskable variants for Android.
- [x] Apple touch icon (`apple-touch-icon.png`) for iOS install.
- [x] Wire via Next.js `app/layout.tsx` metadata.
- [ ] Splash screens for iOS (not in Phase 8 implementation scope; current iOS support uses the Apple touch icon plus static Add to Home Screen instructions).

### Service worker (Serwist)

- [x] Install Serwist (`@serwist/next`) plus `serwist`, `idb`, `sharp`, and test-only `fake-indexeddb`.
- [x] Configure caching strategies:
  - **Dashboard pages + App Router RSC payloads**: network-first with cache fallback.
  - **PWA read API responses**: stale-while-revalidate.
  - **Queueable mutations**: explicit client IndexedDB queue + idempotent PWA API routes; service worker background sync asks open clients to replay.
  - **Static assets + generated icons**: cache-first.
- [x] Skip caching for `/api/webhooks/*`, `/api/inngest`, `/api/auth/*`, and `/api/pwa/mutations/*`.
- [x] Pre-cache generated build/public assets on install via Serwist manifest injection.

### Offline read

- [x] Cache last loaded calendar (visible range plus next 30 days), messages per open conversation (last 50 messages), PT settings.
- [x] Add same-origin PWA snapshot APIs for calendar, chat thread, and settings.
- [x] Render a dashboard banner ("You're offline. Showing last loaded data.") per spec doc § Offline handling.
- [x] Keep settings, availability, WhatsApp connection, account deletion, and auth online-only with disabled/clear offline states.

### Write queue

- [x] IndexedDB stores `snapshots` and `pendingMutations` with capped queue metadata.
- [x] Add server-side `pwa_mutations` idempotency table in migration `0011_phase8_pwa`.
- [x] Add queueable API routes for manual PT chat messages and appointment mutations.
- [x] On app start, `online`, and service-worker sync message: replay queue oldest-first.
- [x] Surface pending and failed queue size in the UI ("N changes will sync when online", "N changes need attention").
- [x] Show failed queued items with retry/remove actions.
- [x] Conflict resolution: server wins for now; 4xx responses become final failed queue items.

### Install prompt

- [x] Listen for `beforeinstallprompt` event.
- [x] Surface the prompt after first meaningful engagement (first successful queueable action or 2nd dashboard visit).
- [x] Don't nag — once dismissed, wait 7 days before re-offering.
- [x] iOS doesn't fire the event — show static "Add to Home Screen" instructions on iOS Safari.
- [x] Hide install UI in standalone display mode.

### Lifecycle

- [x] On service worker update: show a "New version available" refresh banner.
- [x] User taps refresh → `SKIP_WAITING` + reload on controller change.

---

## Acceptance criteria

- [ ] Installs to home screen on Android (Chrome) and iOS (Safari). Code support is implemented; device/browser verification pending.
- [ ] Once installed, opens in standalone mode (no browser chrome). Metadata/manifest support is implemented; device/browser verification pending.
- [ ] Going offline shows the cached calendar; opening an appointment shows cached detail. Code support is implemented; production browser smoke confirmed warmed calendar/chat routes and appointment details still load when the app server is stopped. True device/browser offline-mode banner verification remains pending.
- [ ] Sending a manual message offline queues it; reconnecting replays it; PT sees feedback. Unit/API coverage implemented; production browser smoke confirmed manual chat sends queue with an optimistic pending bubble when the app server is stopped. Successful live replay remains pending because it requires a real Meta WhatsApp send path.
- [ ] Lighthouse PWA section ≥ 90 (installable, manifest valid, service worker present). Production build generates `/sw.js`; Lighthouse run pending.
- [ ] Update flow works — bumping the build deploys a new SW; users see the refresh prompt. Code support implemented; browser verification pending.

---

## Notes

- iOS PWA support is improving but still has gaps. Don't promise feature parity on iOS — degrade gracefully (fewer notifications, smaller offline cache).
- IndexedDB write queue can grow unbounded if the user is offline for a long time. Cap at ~100 items and surface a warning if approaching the cap.
- Don't cache authentication tokens in the SW. Auth is handled by Supabase cookies, which the SW shouldn't touch.

## Browser verification notes

- 2026-06-19: Production-mode local smoke with `.env.test` passed for generated `/sw.js`, manifest, icon serving, cached `/calendar` and `/chat/:id` route fallback with `next start` stopped, appointment notes queueing while the server was stopped, appointment replay after restart/reload, and database persistence of the replayed notes mutation.
- 2026-06-19: Manual PT chat send queued while the server was stopped and showed the optimistic outbound bubble plus pending banner. Replay success was not claimed locally because message replay requires a real active WhatsApp Graph send path.
