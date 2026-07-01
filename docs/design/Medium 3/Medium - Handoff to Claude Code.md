# Medium — Design ↔ Build reconciliation (handoff to Claude Code)

**Date:** 2026-06-22
**Purpose:** The design package (`Medium - *.html` canvases + `Medium - Flow map.html`) is the source of truth for IA, copy, and UX. The codebase under `medium/` diverged on a few points during the backend-first build. This note records the **decisions** and the **concrete codebase deltas** needed so implementation matches the design. Hand this file (and the design canvases) to whoever continues the build.

---

## Decisions (locked)

| # | Topic | Decision |
|---|---|---|
| 1 | **Product language** | **Albanian** is canonical for all practitioner-facing UI. The current English strings are placeholders — localize to the design's Albanian copy. |
| 2 | **Navigation / IA** | **5 tabs**, exactly as designed: **Sot · Kalendari · Bisedat · Klientët · Ti**. Build the `Today` home and the new `Clients` (Klientët) destination. |
| 3 | **Services** | Services are **real configurable data** (a managed list per PT), as the onboarding step + empty state in the design imply — not free-text. |
| 4 | **Appointment status taxonomy** | **Keep the code's enum** as canonical: `pending · confirmed · cancelled · no_show · completed · rescheduled`. "No response to a reminder" stays **reminder-derived** (not a separate appointment status). The design's orange "Pa përgjigje" is a *visual* state driven by reminder fields, not a 7th status. |
| 5 | **Attention accent** | **Keep the warm accent** (`#d97706` / orange-amber) used for "needs attention" on Today/calendar/reschedule. Promote it to a **token** (e.g. `--attention-500`) in `colors_and_type.css` rather than hard-coding the hex. |
| 6 | **Calendar day view** | **Keep the day view** as in the design (day · week · month). |

---

## Concrete codebase deltas

### 1. Language → Albanian
- All UI strings move to Albanian per the canvases. Practitioner UI uses informal **ti**; AI→patient copy uses formal **Ju** (already correct in prompts).
- Keep the design's conventions: 24h time (`14:30`), abbreviated Albanian days (`E hënë`, `E mar.`), dates as `6 maj`, tabular numerals, sentence case, no emoji, `KONFIRMO`/`ANULO`/`RICAKTO`/`NDIHMË` in mono caps.
- Recommend extracting strings to a single `lib/i18n/sq.ts` (or similar) now, even if only one locale ships — it makes the WhatsApp-language story (Phase 6 templates already version `sq`/`en`) consistent.

### 2. Navigation → 5 tabs
- `components/dashboard/bottom-nav.tsx`: items become **Sot** (`/today`, `home` icon) · **Kalendari** (`/calendar`, `calendar`) · **Bisedat** (`/chat`, `message`, unread dot) · **Klientët** (`/clients`, `users`) · **Ti** (`/settings`, `settings`). Active tint brand-500; 22px bottom safe-area; unread count as a 16px dot on the icon.
- **New route `/today`** = the exception-first home (`cal/cal-today.jsx`, canvas *Today & Calendar* → `today/*`). Sections: "Kërkon vëmendjen tënde" (reminder no-replies, escalations), "Më pas" (next appointment), "Më vonë sot", and a "Medium po menaxhon N biseda" strip. Default landing after sign-in/onboarding changes from `/calendar` → `/today`.
- **New route `/clients`** = the Klientët directory (see §New screen below). Update the dashboard-layout default redirect and any `/calendar` hardcoded "home" assumptions.
- Notifications stay a **top-bar bell sheet** (already correct — not a tab).

### 3. Services → configurable data
- New table `services` (`id, pt_id, name, duration_min, active, created_at`) + RLS tenant isolation like the other tables.
- Onboarding gains a real **Shërbimet** step (design canvas *Onboarding* → `wizard/services`, with the empty state `edge/services-empty`). Add it to `lib/onboarding/state.ts` (a step is "done" when ≥1 active service row exists). Note this changes the derived step set — reconcile with the existing `testMessage` step (keep both, so onboarding becomes 5 data-derived steps; the design wizard shows Profile → WhatsApp → Hours → Services as the numbered "4", with Welcome/Done as framing).
- `appointments.service_type` (free text today) should reference a service (keep the text column for legacy/AI-created rows, but the PT-facing pickers choose from the managed list).
- AI booking tools should offer the configured services ("vlerësim i parë apo seancë vijuese?") from this table.

### 4. Appointment status — no code change needed
- The design's Klientët/calendar pills should map onto the existing enum. Add a **`rescheduled`** pill to the design kit's `CAL` map (currently missing) when you port pills to code — `StatusBadge` in `components/appointments/badges.tsx` already handles it (tone `brand`). The orange "Pa përgjigje" remains the reminder-derived dot already implemented in `calendar-client.tsx#statusDot`.

### 5. Attention accent → token
- Add `--attention-500: #d97706` (+ a tint, e.g. `--attention-100`) to `colors_and_type.css` and use it for the "needs you" treatments. Don't reuse `--warning` (the design distinguishes "needs your attention" from "pending/warning").

---

## New screen — Klientët (Clients directory)

**Design:** `Medium - Clients.html` (canvas: `list/*` + `detail/*`). 7 screens. **Flow:** `Medium - Flow map.html` → Flow 07.

**Data (already in schema — no migration):** `patients (name, phone, wa_id null=manual, notes, reminder_opted_out_at, created_at)`, joined to `appointments` (history + upcoming) and `conversations` (chat link, who's handling). Manual patients have `wa_id = NULL` and **no WhatsApp action until they message first**.

**Routes / screens to build:**
- `/clients` — directory: always-visible search, count label, list rows = avatar + name + one meta line (next appointment in green/amber/orange, or "I fundit: …"). Top-right `+` to add. States: default, **loading** (skeleton rows), **empty** ("Ende asnjë klient" + "Shto klient"), **search** (filtered + result count).
- `/clients/[id]` — pushed detail (NavBar back, **no bottom tabs**): header (big avatar, name, phone mono, "Kliente që nga …", WhatsApp `ChannelChip` **or** "Shtuar me dorë" badge), quick actions **Telefono / WhatsApp / Biseda** (WhatsApp + Biseda disabled for manual patients), editable **Shënim privat**, **Takimet e ardhshme**, **Historiku** (each row → appointment detail sheet). If `reminder_opted_out_at` is set, show the "Ç'regjistruar nga kujtesat" warning banner.
- `/clients/new` (or a sheet) — manual add: Emri + Telefoni (+ optional note), with the "WhatsApp lidhet kur të shkruajnë" info banner. Reuses the existing `bookAppointment` manual-patient path (insert with `wa_id = NULL`).

**Reuse existing code:** `AppointmentSheet` (open from a history row), `StatusBadge`/`ReminderBadge`, `initials-avatar`, `grouped-list`, `status-pill`, `app-banner`, `EmptyState`, `Skeleton`. Realtime: `RealtimeRefresher` on `patients` + `appointments` filtered by `pt_id`. Offline: the directory is read-snapshot cacheable (same pattern as calendar); manual-add is online-only (mirror settings) **or** queue via `pwa_mutations` if you want parity with appointment writes — pick one and disable the button offline if not queued.

---

## Already aligned — leave as-is
Auth (email/password + Google), WhatsApp Embedded-Signup failure matrix, coexistence + 2h AI-pause, chat takeover/escalation/debounce, send-state matrix (typed/pending/offline/failed/24h-window/revoked), offline sync queue, GDPR export/delete, appointment detail quick-actions, push as a bell sheet, and the token/type/spacing system all match the design and the bound design tokens.
