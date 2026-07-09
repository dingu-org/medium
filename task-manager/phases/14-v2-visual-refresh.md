# Phase 14 — v2 "New direction" visual refresh

**Goal.** Re-skin the whole app to the design project's new v2 "New direction"
language (Variant B — Manrope): vivid royal blue `#3B5BFE`, Manrope replacing
Inter/Inter Tight, borderless radius-26 cards on ambient shadows, a floating
black pill dock instead of the labeled tab bar, pill/circular buttons, warm-gray
canvas `#f3f3f0`, and per-canvas screen alignment — headlined by the
**Chats & takeover** canvas (15 artboards).

**Why this is net-new.** Phase 13 reconciled IA/copy/flows against the *old*
clinical-blue Medium 3 look. On 2026-07-07 the design project relaunched its
visual language wholesale (all 8 canvases). Functionality is untouched; this
phase is a skin + a single product deletion (below).

**Source of truth.** `docs/design/medium4/project/` (fresh export, committed
2026-07-07, replacing the removed `docs/design/Medium 3/`). Read-only reference —
never edit. Language: `v2/ui.jsx` (MT tokens + primitives) and
`components/kit.jsx`; per-section canvases in `chat/ cal/ clients/ onboarding/
auth/ sys/ appt/ components/sec-*`. Handoff doc:
`docs/design/medium4/project/Medium - Handoff to Claude Code.md`.

**Product delta (design decision 2026-07-07).** The Today "Medium po menaxhon
N biseda" strip is dropped — remove `HandlingStrip` usage from
`app/(dashboard)/today/today-client.tsx` (chat-list's "Medium po menaxhon"
section header is unrelated and stays).

**Non-negotiables.** No functional regression: realtime hooks, offline PWA
queue, chat server actions (takeover/read watermark/close/template send),
escalation, i18n dictionaries (`lib/i18n/dict/*` — all copy changes go through
them), PWA snapshot caching. Theme is locked calm/blue/soft — the canvas
applyTheme machinery is not ported.

## Stages

- [x] **Stage 0 — Bundle swap + tracker.** Remove `docs/design/Medium 3/` +
      stale root handoff from git, commit `docs/design/medium4/`, eslint-ignore
      `docs/design/**`, open this tracker.
- [x] **Stage 1 — Foundation.** `app/globals.css`: retune all `:root` scales to
      medium4 `colors_and_type.css` (royal-blue brand, warm-gray neutrals,
      semantic trios, info→brand alias, page `#f3f3f0`), radius system
      (card 26 / fields 18 / pills 999), MT_SH/MT_SH_FLOAT shadow tokens,
      borderless cards, shimmer keyframes, royal-blue focus rings, hatch
      utility; re-derive `--attention` from medium4 `cal/cal-kit.jsx`.
      `app/layout.tsx`: Manrope (400–800) replaces Inter + Inter Tight; keep
      `--font-sans`/`--font-heading` variable names; JetBrains Mono stays.
- [x] **Stage 2 — Component kit.** Restyle in place: button (pill h48 w700;
      new `tinted` + `dark` variants, primary glow), status-pill, grouped-list
      (borderless r26 + shadow, sep dividers), segmented-control (pill),
      switch (44×26), skeleton (pulse→shimmer), chat-bubble (MEDIUM mono label,
      meta mono 11, inline retry affordance), app-banner (borderless r18),
      dialog (r26), EmptyState (56px `#ecece7` circle), initials-avatar
      (700 + who-dot tones), input/textarea (h50 r18), sonner (black pill).
      New: round-button (44px white circle), handled-by, count-badge,
      channel-chip + whatsapp-mark, section-label, `dashboard/nav-bar`.
- [x] **Stage 3 — Chrome.** bottom-nav → floating black pill dock (icon-only
      52px circles, brand active, brand-dot badge, aria-labels); top-header →
      transparent TopBar (27px Manrope 700 + 44px white circle bell/avatar,
      sync dot kept); NavBar on pushed routes (chat thread, client detail/new,
      settings subpages, notifications); container `max-w-md px-4`, dock
      clearance.
- [x] **Stage 4 — Chats & takeover (headline).** List: TopBar + search RoundBtn
      (reveals existing `?q=` input), Seg Aktive/Të mbyllura, ListConvo rows
      (who-dot avatar, HandledBy / red "Të duhet ty", Count), red SectionLabel
      section, shimmer loading, EmptyState. Thread: NavBar (patient + phone;
      archive relocated here), CStatusRow (mode tints ai/you/paused/escalated +
      "Lër Medium-in" Switch), CNotice thin rows replacing stacked banners,
      CSys day separators (data-backed only), CGroup visual for existing 3-min
      grouping. Composer: pill input + 44px round send; windowClosed (grey card
      + tinted template CTA) and revoked (redTint card + WhatsApp-green
      reconnect) states. `dict/chat.ts`: "Kërkon ty" → "Të duhet ty" etc.
- [x] **Stage 5a — Today & Calendar** per `cal/*` (incl. HandlingStrip removal,
      hatch free slots, CalHeader/WeekStrip/MonthGrid/ApptRow, FAB).
- [x] **Stage 5b — Clients** per `clients/*` (directory, detail, new-client).
- [x] **Stage 5c — Appointments** per `appt/*` (sheet restyle, create flow;
      mode machine untouched).
- [x] **Stage 5d — Onboarding** per `onboarding/*` (OShell wizard skin,
      WAStatus cards instead of toasts, ChannelChip; data-derived steps kept).
- [x] **Stage 5e — Auth** per `auth/*` (AuthShell/AField/pill buttons across
      sign-in/up/forgot/reset/verify; server-action wiring kept).
- [x] **Stage 5f — System states** per `sys/*` (PWA banners, notification feed
      sheet, settings account + danger zone, r26 dialogs, push pre-prompt).
- [x] **Stage 6 — QA + close-out.** Component-sheet sweep (`components/sec-*`),
      typecheck/lint/build, visual pass vs artboards, behavior smoke
      (takeover, offline send, archive, reschedule, search, realtime,
      notifications), update this tracker + `progress.md`.

## Canvas acceptance matrix

| Canvas | Screens | Status |
| --- | --- | --- |
| Chats & takeover | list ×4 · thread ×5 · composer ×6 | ☑ |
| Today & Calendar | today ×3 · calendar ×6 | ☑ |
| Clients | directory ×4 · detail ×2 · new ×1 | ☑ |
| Appointment lifecycle | detail ×4 · actions · create | ☑ |
| Onboarding | steps ×5 · WhatsApp ×8 · edge | ☑ |
| Auth | sign-in/up ×7 · recovery ×7 | ☑ |
| System states | conn ×7 · notify ×6 · account ×3 | ☑ |
| Component sheet | foundations/forms/lists/nav-feedback | ☑ |

## Verification

Per stage: `pnpm typecheck && pnpm lint`; `pnpm build` after Stages 1, 4, and
final. `pnpm test` unit always; `pnpm test:all` only if the local Supabase
stack (Docker) is available. Visual QA: dev server at mobile 390×844,
screenshot per artboard, `preview_inspect` for exact values (bg `#f3f3f0`,
brand `#3b5bfe`, card radius 26, Manrope active). Behavior smoke listed in
Stage 6.

## Result (2026-07-09)

All stages shipped in one session (commits `f392ae4…abd76cf`). Full-suite
verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test:all`
(50 files / 355 tests) all green. Signed-in visual passes against the medium4
artboards on: chat list (default/closed/search), threads (escalated/takeover/
paused/ai+debounce/window-closed), today, calendar (day/week/month), clients
(directory/detail), appointment sheet, auth, settings.

Notable extras that landed with the phase:

- QA tooling: `pnpm seed:qa` seeds a local practitioner with canvas-mirroring
  fixtures (qa@medium.local / qa-medium-1234); `pnpm dev:test` runs the dev
  server against the local Supabase stack. **Gotcha:** every integration-test
  run wipes `auth.users` (tests/setup/global.ts), so reseed after `test:all`.
- Dev fix: `lib/db` now caches the postgres-js client on `globalThis` outside
  production — Next HMR was leaking a 10-connection pool per recompile and
  exhausting the local Postgres (SQLSTATE 53300).
- `getChatThreadSnapshot` gained `patientPhone` (thread call button); the
  Today snapshot dropped `managedConversationCount` with the strip.
- New i18n keys across `dict/chat|calendar|settings|common`; `formatRelativeShort`
  + `formatDayLabel` in `lib/i18n/datetime`.

Remaining (cosmetic, non-blocking): CGroup stacked-corner bubbles use the
existing 3-min grouping rather than per-message corner radii; the hatch
texture token exists but no screen consumes it yet (availability editor is
its natural home when that screen gets its pass).
