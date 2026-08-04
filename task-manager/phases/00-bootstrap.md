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
- [x] **Meta Embedded Signup dev preflight** — connect the app to the Business, create the system user + system token, configure Facebook Login for Business OAuth settings, set `Allowed domains` + `Valid OAuth redirect URIs`, save the `config_id`, subscribe `messages` + `account_update` webhooks, and keep a Meta test WABA / test number available for dev.
- [x] **Supabase** — new project in Frankfurt (EU). Note `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [x] **Vercel** — create project, link GitHub repo, set serverless region to Frankfurt (`fra1`).
- [x] **Inngest** — create app; note signing key + event key.
- [x] **OpenRouter** — create `OPENROUTER_API_KEY`; pin the current guardrail to `nvidia/nemotron-3-ultra-550b-a55b:free`; keep prompt logging and product-use opt-ins disabled.
- [x] **Sentry** — intentionally skipped for the current MVP; free-tier exhausted. Use platform logs and manual smoke checks instead.
- [x] **PostHog EU** — intentionally skipped for the current MVP; free-tier exhausted. Derive funnel metrics from app data and internal dashboards instead.

### Env wiring

- [x] Create `.env.example` with every var name (no values).
- [x] Create `.env.local` (gitignored) with dev values.
- [x] Set the same vars in Vercel project settings (production + preview).
- [x] Use the first Vercel production URL as the temporary `META_REDIRECT_URI` until a custom domain exists.
- [x] Generate and store `TOKEN_ENCRYPTION_KEY` (32-byte random) — used by pgcrypto in Phase 2.
- [x] Generate Web Push VAPID keypair (used in Phase 9 — generate now so they're stable).
- [x] Add `OPENROUTER_MODEL_OVERRIDE` to `.env` and the Vercel preview + production env vars, left blank in all environments. (`OPENROUTER_DEV_MODEL`/`OPENROUTER_PROD_MODEL` existed here until the 2026-08-04 model cutover; the model per environment is now code — `lib/billing/plans.ts`.)

### Observability tooling

- [x] Defer Sentry for now; rely on Vercel / Supabase logs plus manual smoke tests because the free-tier limit is already exhausted.
- [x] Defer PostHog for now; derive MVP funnel and cost visibility from internal tables / dashboards instead of a third-party analytics tool.

### First deploy

- [x] Push to `main`; confirm Vercel builds and serves a preview URL.
- [x] Open the preview on a phone — confirm Tailwind renders.

---

## Acceptance criteria

- [x] `pnpm dev` runs with no errors and serves the bootstrap placeholder page.
- [x] Every required account exists, including a separate Meta dev app; every required credential is in `.env.example` (with names) and `.env.local` (with values), and the same required vars are set in Vercel.
- [x] A push to `main` produces a successful Vercel deploy.
- [x] No secrets in committed files (verified with `git log -p` and staged diff review; `gitleaks` if already installed).

---

## Notes

- Don't skip Meta App Review — it can take days. Submit on day one, build the rest while waiting.
- Use `pnpm` (lighter lockfile, faster on serverless), not npm.
- Vercel's `fra1` region matches Supabase Frankfurt for low latency.
- Sentry and PostHog are intentionally deferred for the current MVP because their free-tier limits are exhausted; revisit if paid monitoring/analytics become justified.
- A custom domain is not required to finish Phase 0; the Vercel production URL is acceptable as the temporary Embedded Signup redirect URI.
- Meta Business Verification and App Review are still needed before external PT self-serve onboarding, but they do not block app-role testing or dev implementation once the Meta dev preflight above is in place.
