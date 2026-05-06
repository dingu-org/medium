# Phase 8 — PWA features

**Goal.** The app is installable to home screen, the PT can read their cached calendar / messages / settings offline, and writes made offline replay when the connection returns.

**Source.** Tech doc §9; product spec `docs/medium-canvas/documents/pt-admin-pwa-screens.md` § Offline handling.

**Effort.** 3–4 days.

**Prerequisites.** Phase 7 complete (the app must exist before it can be installed).

---

## Tasks

### Manifest + icons

- [ ] `public/manifest.json`:
  - `name`, `short_name`, `start_url: '/calendar'`, `display: 'standalone'`, `background_color`, `theme_color`, `orientation: 'portrait'`, `lang`, `dir`.
- [ ] Icon set in `public/icons/`: 192, 256, 384, 512 px; maskable variants for Android.
- [ ] Apple touch icon (`apple-touch-icon.png`) for iOS install.
- [ ] Wire via Next.js `app/layout.tsx` metadata.
- [ ] Splash screens for iOS (one per device size or use the maskable icon).

### Service worker (Serwist)

- [ ] Install Serwist (`@serwist/next`).
- [ ] Configure caching strategies:
  - **App shell** (HTML, JS, CSS): cache-first with revalidation.
  - **Calendar + messages API responses**: stale-while-revalidate.
  - **Mutations** (POST/PATCH/DELETE): network-first, queue on failure.
  - **Static assets**: cache-first.
- [ ] Skip caching for `/api/webhooks/*` and `/api/inngest`.
- [ ] Pre-cache the app shell on install.

### Offline read

- [ ] Cache last loaded calendar (next 30 days), messages per open conversation (last 50 messages), PT settings.
- [ ] Render a banner ("You're offline — showing last loaded data") per spec doc § Offline handling.
- [ ] Disable interactive elements that require server (manual send button) with a tooltip explaining why.

### Write queue

- [ ] IndexedDB store `pendingMutations` with `{ id, endpoint, body, createdAt, retryCount }`.
- [ ] Service worker intercepts failed mutations (network errors only — not 4xx/5xx) and enqueues them.
- [ ] On `online` event: replay queue oldest-first, with backoff on transient failures.
- [ ] Surface queue size in the UI ("3 pending changes will sync when online").
- [ ] Conflict resolution: server wins for now. Document the tradeoff.

### Install prompt

- [ ] Listen for `beforeinstallprompt` event.
- [ ] Surface the prompt after first meaningful engagement (e.g., after first appointment booked or 2nd visit).
- [ ] Don't nag — once dismissed, wait 7 days before re-offering.
- [ ] iOS doesn't fire the event — show static "Add to Home Screen" instructions on iOS Safari.

### Lifecycle

- [ ] On service worker update: show a "New version available — refresh" toast.
- [ ] User taps refresh → `skipWaiting` + reload.

---

## Acceptance criteria

- [ ] Installs to home screen on Android (Chrome) and iOS (Safari).
- [ ] Once installed, opens in standalone mode (no browser chrome).
- [ ] Going offline shows the cached calendar; opening an appointment shows cached detail.
- [ ] Sending a manual message offline queues it; reconnecting replays it; PT sees feedback.
- [ ] Lighthouse PWA section ≥ 90 (installable, manifest valid, service worker present).
- [ ] Update flow works — bumping the build deploys a new SW; users see the refresh prompt.

---

## Notes

- iOS PWA support is improving but still has gaps. Don't promise feature parity on iOS — degrade gracefully (fewer notifications, smaller offline cache).
- IndexedDB write queue can grow unbounded if the user is offline for a long time. Cap at ~100 items and surface a warning if approaching the cap.
- Don't cache authentication tokens in the SW. Auth is handled by Supabase cookies, which the SW shouldn't touch.
