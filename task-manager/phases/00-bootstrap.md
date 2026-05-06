# Phase 0 — Bootstrap

**Goal.** A clean, deployable Next.js skeleton with all third-party accounts created and credentials wired through env vars. No product features yet — just the scaffolding everything else slots into.

**Source.** Tech doc §2 (Stack at a glance), §14 (Setup checklist).

**Effort.** 1–2 days.

**Prerequisites.** None.

---

## Tasks

### Repo & app skeleton

- [x] Initialise git repo at project root, create the GitHub repo, push to `main`.
- [x] `pnpm create next-app@latest` with: TypeScript, App Router, Tailwind, ESLint, src dir = no, import alias `@/*`.
- [x] Add Prettier with Tailwind plugin; integrate with ESLint.
- [x] Add Husky + lint-staged: pre-commit runs `pnpm lint` and `pnpm typecheck`.
- [x] Follow the current output of the Next.js generator for config files (`eslint.config.*`, `next.config.*`, etc.); do not force legacy filenames from older tutorials.
- [x] Create the module folders from tech doc §3:
  - `app/(dashboard)/`, `app/api/webhooks/whatsapp/`, `app/api/auth/meta-embedded/`, `app/api/inngest/`
  - `lib/conversation/`, `lib/channels/whatsapp/`, `lib/ai/`, `lib/appointments/`, `lib/reminders/`, `lib/tenancy/`, `lib/db/`, `lib/events/`, `lib/notifications/`
- [x] Add a project-root `README.md` with quick-start (clone → install → `.env.local` → `pnpm dev`).
- [x] Install shadcn/ui (`pnpm dlx shadcn@latest init`); add a few base components (button, card, input, dialog, sheet) so styling matches across the app from day one.

### External accounts (start the slow ones first — Meta App Review takes days)

- [x] **Meta** — create Business Manager + Developer account; create WhatsApp Business App (type: Business). Note `app_id`, `app_secret`.
- [x] **Meta dev app** — create a separate Meta test app for local and non-prod webhook work so production review state stays isolated.
- [x] **Supabase** — new project in Frankfurt (EU). Note `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [x] **Vercel** — create project, link GitHub repo, set serverless region to Frankfurt (`fra1`).
- [ ] **Inngest** — create app; note signing key + event key.
- [ ] **Anthropic** — create API key; confirm Haiku 4.5 + Sonnet 4.6 access; set budget alerts at 50 % and 90 % of monthly target.
- [ ] **Sentry** — new project for the Next.js app; note DSN.
- [ ] **PostHog EU** — new project; note browser key.

### Env wiring

- [x] Create `.env.example` with every var name (no values).
- [x] Create `.env.local` (gitignored) with dev values.
- [ ] Set the same vars in Vercel project settings (production + preview).
- [ ] Use the first Vercel production URL as the temporary `META_REDIRECT_URI` until a custom domain exists.
- [x] Generate and store `TOKEN_ENCRYPTION_KEY` (32-byte random) — used by pgcrypto in Phase 2.
- [x] Generate Web Push VAPID keypair (used in Phase 9 — generate now so they're stable).

### Sentry from day one

- [ ] Install `@sentry/nextjs`; run the wizard.
- [ ] Keep the wizard's current output and config filenames; do not force specific Sentry file names from older examples.
- [ ] Verify a thrown error in a test route shows up in Sentry.
- [ ] Configure source map upload via the Sentry build plugin so stack traces stay readable in production.

### First deploy

- [ ] Push to `main`; confirm Vercel builds and serves a preview URL.
- [ ] Open the preview on a phone — confirm Tailwind renders.

---

## Acceptance criteria

- [x] `pnpm dev` runs with no errors and serves the bootstrap placeholder page.
- [ ] Every account exists, including a separate Meta dev app; every credential is in `.env.example` (with names) and `.env.local` (with values), and the same vars are set in Vercel.
- [ ] A push to `main` produces a successful Vercel deploy.
- [ ] A test thrown error appears in Sentry within ~30 s.
- [ ] No secrets in committed files (verified with `git log -p` and staged diff review; `gitleaks` if already installed).

---

## Notes

- Don't skip Meta App Review — it can take days. Submit on day one, build the rest while waiting.
- Use `pnpm` (lighter lockfile, faster on serverless), not npm.
- Vercel's `fra1` region matches Supabase Frankfurt for low latency.
- A custom domain is not required to finish Phase 0; the Vercel production URL is acceptable as the temporary Embedded Signup redirect URI.
