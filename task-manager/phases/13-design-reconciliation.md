# Phase 13 — Design reconciliation (Albanian IA, Today, Clients, Services)

**Goal.** Bring the build in line with the locked design package
(`docs/design/Medium - Handoff to Claude Code.md` + the claude.ai/design canvases):
Albanian as the canonical UI language, the designed 5-tab IA, the exception-first
**Today** home, the **Clients** directory, and **configurable Services**.

**Why this is net-new.** Phase 7 shipped a visual/token pass only (decision log
2026-06-21): it intentionally kept the 3-tab Calendar/Chat/Settings nav and English
copy. The handoff now locks the full IA + Albanian, which is scope beyond the Phase 7
checklist. Phase 7 stays complete; this phase tracks the reconciliation.

**Source of truth.** `docs/design/Medium - Handoff to Claude Code.md` plus the
read-only, untracked `docs/design/Medium 3/` HTML/JSX canvases. The package covers
auth, onboarding, Today/calendar, appointments, chat, clients, and current system
states. Net-new Phase 9-12 capabilities shown there remain deferred to those phases.

**Decisions (2026-06-22).**

- Albanian: full-app now via `lib/i18n/sq.ts` (practitioner UI informal _ti_; AI→patient
  copy stays formal _Ju_, already correct in prompts).
- Execution: staged with checkpoints — Foundation → Today → Services → Clients.
- Design files: referenced via the design MCP, not copied into the repo.

**Expanded reconciliation decisions (2026-06-30).**

- Reconcile the full applicable `Medium 3` package, not only the three placeholder
  destinations. Fix the existing baseline before building Today, Services, and Clients.
- Keep Web Push delivery, GDPR export, operational quota monitoring, legal review,
  observability, and launch work in Phases 9-12.
- Conversations close/reopen manually; a new inbound patient message reopens them.
- Existing practices get Services backfilled from appointment history, with the three
  design presets used when no history exists.
- Manual client phones use an application-level normalized duplicate check; historical
  phone storage is not rewritten and no new DB uniqueness constraint is added.
- Albanian reminder templates are preferred after approval; approved English templates
  remain a temporary fallback during Meta review.
- The matching Next 15.5.16 docs were restored under `node_modules/next/dist/docs/`
  from the official tag because the published package did not contain them.

---

## Stage 1 — Foundation & i18n

- [x] `--attention-50/100/500/600` (`#d97706`) token in `globals.css`; `attention` tone on
      `StatusPill`/`InitialsAvatar`; calendar `statusDot` uses it for reminder-sent/no-response
      (handoff §5 — distinct from `--warning`).
- [x] i18n scaffold: `lib/i18n/sq.ts` dictionary + `t` accessor; Albanian date/number
      formatters (date-fns `sq` locale): 24h `14:30`, `E hënë`/`E mar.`, `6 maj`, tabular nums.
- [x] 5-tab bottom nav: Sot · Kalendari · Bisedat · Klientët · Ti; unread dot on Bisedat
      (UI ready; the unread count source is wired in Stage 4).
- [x] Default landing `/calendar` → `/today` (page / auth-callback / sign-in / onboarding);
      `sw.ts` nav prefixes + manifest `start_url`.
- [x] Placeholder `/today` and `/clients` routes.
- [x] Full-app Albanian conversion of existing screens (auth, calendar, chat, settings,
      availability, appointment sheet, onboarding, states, PWA banners).

**Stage 1 done (2026-06-22).** Verified: `pnpm typecheck`/`lint`/`build` clean, 111 unit
tests pass, `/sign-in` renders Albanian (no English) in a prod-server smoke. A handful of
long-tail strings (a few `availability-editor` toasts/descriptions + 2 aria-labels in
`calendar-fab`/`pwa-provider`) are inline Albanian rather than dictionary-backed — fine to
migrate into `lib/i18n/dict` later. Legal pages (`/privacy`, `/terms`) intentionally left
English pending legal review.

## Stage 1B — Full-package baseline reconciliation

- [x] Restore and read the matching Next 15.5.16 App Router documentation.
- [x] Correct Albanian language gaps (`lang`, metadata, notifications/PWA/API errors,
      AI/safety/appointment/reminder patient copy); keep legal pages marked English.
- [x] Prefer new Albanian (`sq`) reminder templates with approved English fallback.
- [x] Implement designed top-level/pushed chrome; tabs only on the five root destinations;
      wire the real unread-chat indicator.
- [x] Reconcile auth visuals and complete reset/confirmation/OAuth states.
- [x] Add calendar day view, Albanian labels, all statuses, and designed loading/empty states.
- [x] Reconcile appointment sheets and chat list/thread state coverage, including search,
      active/closed, unread, escalation/takeover/pause/revoked, retry, and 24h-template UX.
- [x] Align currently implemented PWA/notification/settings/account states to the canvases.

## Stage 2 — Today (`/today`)

- [x] Exception-first home: "Kërkon vëmendjen tënde" (reminder no-replies + escalations),
      "Më pas" (next appt), "Më vonë sot", "Medium po menaxhon N biseda" strip.
- [x] `lib/today/queries.ts → getTodaySnapshot(ptId)`; realtime; reuse appointment sheet/badges.
- [x] Loading + quiet-day states; offline snapshot API/cache; attention actions.

## Stage 3 — Configurable Services

- [x] `services` table (`id, pt_id, name, duration_min, active, created_at`) + RLS + migration
      (next number) ; add to the RLS isolation test seed registry.
- [x] Settings CRUD (`/settings/services`) + onboarding step (4→5 steps; done when ≥1 active).
- [x] Manual-book service picker (writes `appointments.service_type` from the managed list;
      text column kept for legacy/AI rows).
- [x] AI booking tool offers configured services.
- [x] Service durations drive availability/booking; reschedules preserve existing duration;
      old queued `serviceType` mutations remain replay-compatible.
- [x] Replace the onboarding checklist with the data-derived five-step wizard
      (Profile → WhatsApp → Availability → Services → Test message → Done).

## Stage 4 — Clients

- [x] `/clients` directory (search, count, next/last-appt meta, default/loading/empty/search
      states), `/clients/[id]` detail (quick actions, private note, upcoming + history →
      appointment sheet, reminder opt-out banner), `/clients/new` manual add (`wa_id` NULL;
      online-only).
- [x] `lib/clients/queries.ts` (directory + detail); hide bottom nav on detail/new.
- [x] Manual patients: no WhatsApp/Biseda action until they message first.
- [x] Application-level phone normalization/duplicate check; notes editing; realtime and
      directory snapshot caching.

---

## Canvas acceptance matrix

| Surface               | Implementation gate                                                                        | Status   |
| --------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Component system      | Existing tokens/primitives retained; missing states added without copying canvas code.     | Complete |
| Auth                  | Sign in/up/recovery/reset/confirmation/OAuth default, validation, error, pending states.   | Complete |
| Onboarding            | Five data-derived steps plus Meta connection states and completion.                        | Complete |
| Today & Calendar      | Today default/loading/quiet; calendar day/week/month/loading/empty/lifecycle.              | Complete |
| Appointment lifecycle | Detail/reschedule/cancel/create/success/offline/failed states.                             | Complete |
| Chats & takeover      | Needs-you-first active list, closed/search/loading/empty, handling/send states.            | Complete |
| Clients               | Directory/search/loading/empty, WhatsApp/manual detail, opt-out, add-new.                  | Complete |
| System states         | Existing offline/sync/update/install/feed/account states only; Phase 9-12 states deferred. | Complete |

---

## Acceptance

- [x] App reads Albanian end-to-end; new IA matches the applicable canvases.
- [x] Sign-in / onboarding land on Today; 5 tabs navigate with no 404s.
- [x] Services configurable and drive onboarding, manual booking, and AI booking.
- [x] Clients directory / detail / new work; manual patients gated correctly.
- [x] Local migration reset, RLS/Realtime/backfill coverage, `pnpm typecheck`, `pnpm lint`,
      `pnpm build`, and `pnpm test:all` (45 files, 317 tests) pass.
- [x] Signed-in browser canvas checks pass at 390×844 and 1280×900, including pushed-view
      tab hiding, mobile overflow checks, service/client gating, and current PWA states.
- [x] Offline snapshots and queued mutation replay are covered by automated tests and the
      existing production-mode Phase 8 replay smoke.
- [x] Signed-in Lighthouse mobile on `/today`: Performance 100, Accessibility 100.

**Phase complete (2026-06-30).** The design package remains read-only and untracked. Web
Push, GDPR export, operational quotas, legal translation/review, observability, and launch
work remain in Phases 9-12.

**PR review hardening (2026-06-30).** Migration `0014_phase13_review_hardening` adds an
explicit service-confirmation timestamp while preserving seeded defaults for existing
practices. Onboarding setup/dismissal is account-scoped; duplicate inbound deliveries are
side-effect free; read watermarks stop at the latest rendered message; arbitrary service
durations remain editable; and a daily idempotent job submits/polls Albanian reminder
templates for existing active WhatsApp connections. Mobile browser verification covered
setup navigation, the Services confirmation step, and a 50-minute service edit.
