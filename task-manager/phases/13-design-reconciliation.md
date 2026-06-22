# Phase 13 — Design reconciliation (Albanian IA, Today, Clients, Services)

**Goal.** Bring the build in line with the locked design package
(`docs/design/Medium - Handoff to Claude Code.md` + the claude.ai/design canvases):
Albanian as the canonical UI language, the designed 5-tab IA, the exception-first
**Today** home, the **Clients** directory, and **configurable Services**.

**Why this is net-new.** Phase 7 shipped a visual/token pass only (decision log
2026-06-21): it intentionally kept the 3-tab Calendar/Chat/Settings nav and English
copy. The handoff now locks the full IA + Albanian, which is scope beyond the Phase 7
checklist. Phase 7 stays complete; this phase tracks the reconciliation.

**Source of truth.** Design project `019dfd60-5ce2-7ab6-b849-1f619e69849d` (canvases
`Medium - *.html` + JSX sources), read on-demand via the design MCP (not committed).

**Decisions (2026-06-22).**
- Albanian: full-app now via `lib/i18n/sq.ts` (practitioner UI informal *ti*; AI→patient
  copy stays formal *Ju*, already correct in prompts).
- Execution: staged with checkpoints — Foundation → Today → Services → Clients.
- Design files: referenced via the design MCP, not copied into the repo.

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

## Stage 2 — Today (`/today`)

- [ ] Exception-first home: "Kërkon vëmendjen tënde" (reminder no-replies + escalations),
      "Më pas" (next appt), "Më vonë sot", "Medium po menaxhon N biseda" strip.
- [ ] `lib/today/queries.ts → getTodaySnapshot(ptId)`; realtime; reuse appointment sheet/badges.

## Stage 3 — Configurable Services

- [ ] `services` table (`id, pt_id, name, duration_min, active, created_at`) + RLS + migration
      (next number) ; add to the RLS isolation test seed registry.
- [ ] Settings CRUD (`/settings/services`) + onboarding step (4→5 steps; done when ≥1 active).
- [ ] Manual-book service picker (writes `appointments.service_type` from the managed list;
      text column kept for legacy/AI rows).
- [ ] AI booking tool offers configured services.

## Stage 4 — Clients

- [ ] `/clients` directory (search, count, next/last-appt meta, default/loading/empty/search
      states), `/clients/[id]` detail (quick actions, private note, upcoming + history →
      appointment sheet, reminder opt-out banner), `/clients/new` manual add (`wa_id` NULL;
      online-only).
- [ ] `lib/clients/queries.ts` (directory + detail); hide bottom nav on detail/new.
- [ ] Manual patients: no WhatsApp/Biseda action until they message first.

---

## Acceptance

- [ ] App reads Albanian end-to-end; new IA matches the canvases.
- [ ] Sign-in / onboarding land on Today; 5 tabs navigate with no 404s.
- [ ] Services configurable and drive onboarding, manual booking, and AI booking.
- [ ] Clients directory / detail / new work; manual patients gated correctly.
- [ ] `pnpm typecheck/lint/build/test:all` green; signed-in Lighthouse mobile on `/today`
      Performance ≥ 90, Accessibility ≥ 95.
