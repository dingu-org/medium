# Progress

> Living document. Update at the end of every working session.

**Last updated:** 2026-05-14
**Current phase:** Phase 2 WhatsApp integration in flight — Inngest event-bus wiring landed; token crypto + webhook hardening are the next slices.
**Days into build:** 2

---

## Status by phase

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Bootstrap | ☑ Complete | Local scaffold, first deploy, Meta dev preflight, and final secret review are complete. |
| 1 | Foundation | ☑ Complete | Schema + RLS + tenancy helpers, tests, auth UI (email/password + Google OAuth end-to-end), middleware, dashboard shell. Lighthouse mobile audit verified at 100 / 100 / 100 / 96 on 2026-05-14. |
| 2 | WhatsApp integration | ◐ In flight | Inngest client + `serve` handler wired (`lib/inngest/`, `app/api/inngest/route.ts`); 4 Phase 2 events typed. Token crypto, webhook hardening, Embedded Signup, channel adapter still pending. |
| 3 | AI conversation engine | ☐ Not started | — |
| 4 | Appointments & availability | ☐ Not started | — |
| 5 | Background jobs | ☐ Not started | — |
| 6 | Reminders system | ☐ Not started | — |
| 7 | PT PWA UI | ☐ Not started | — |
| 8 | PWA features | ☐ Not started | — |
| 9 | Notifications | ☐ Not started | — |
| 10 | GDPR & security | ☐ Not started | — |
| 11 | Observability | ☐ Not started | — |
| 12 | Pre-launch | ☐ Not started | — |

Status legend: ☐ not started · ◐ in flight · ☑ complete · ⊘ skipped

---

## In flight

_Tasks I'm working on right now._

- Phase 2 — WhatsApp integration. Inngest event-bus foundation landed. Next slice: token encryption helpers (`lib/db/crypto.ts`), then webhook HMAC verification + idempotent `messages` insert + `message.received` emission.

---

## Blockers

_Things that need an external answer or an account / approval I'm waiting on._

- None for local/dev implementation. External PT onboarding is still gated on Meta Business Verification plus App Review / advanced access.

---

## Verification notes

_What is actually complete versus still missing for Phase 0._

- Complete locally: Next.js scaffold at repo root, formatting/tooling, Husky pre-commit, shadcn/ui setup, placeholder routes, module folders, `.env.example`, local `.env.local`, generated local secrets, `pnpm lint`, `pnpm typecheck`, `pnpm dev`, placeholder route smoke tests, and `pnpm build`.
- Complete in hosted verification: Vercel production deploy is live at `kdmedium.vercel.app`, and the bootstrap app opens correctly on both mobile and desktop.
- Complete in Meta dev preflight: `META_REDIRECT_URI` now points at `https://kdmedium.vercel.app/api/auth/meta-embedded`; Facebook Login for Business OAuth settings, allowed domains, redirect validation, saved `config_id`, and `messages` + `account_update` webhook subscriptions are in place; a Meta test WABA and test number exist for dev.
- Phase 0 is complete. Meta Business Verification plus App Review / advanced access remain pending, but only for external PT onboarding.
- Verified mismatch fixed: `.env.example` is now explicitly unignored so it can be committed while `.env.local` stays ignored.

---

## Decisions log

_Significant choices that diverge from the tech doc or that I want to remember the reasoning for. Newest first._

- **2026-05-14** — Inngest client is a module-level singleton in `lib/inngest/client.ts`, not a per-call factory like `lib/supabase/*`. Reason: the Inngest client carries no per-request state (no cookies, no RLS context); the canonical SDK pattern (per `node_modules/inngest/components/Inngest.d.ts`) is module-level instantiation, and a factory would only add ceremony. App `id` is fixed at `'medium'` and treated as immutable — changing the id orphans Inngest history. `INNGEST_EVENT_KEY` is validated at module init (matching the repo's "throw at construction" pattern for env vars); `INNGEST_SIGNING_KEY` is intentionally validated lazily inside `serve()` because the Inngest dev server bypasses signature verification locally and a boot-time throw would block `pnpm dev`. `.env.test` carries `INNGEST_EVENT_KEY=dev` so any future test that imports the client transitively can run without the production key.
- **2026-05-08** — Closed Phase 1. The remaining open acceptance item is the Lighthouse mobile audit, which is deferred until Phase 7 builds real UI worth measuring against a `pnpm build && pnpm start` signed-in session. Everything else (schema, RLS, tenancy helpers, tests, auth UI, middleware, dashboard shell) is shipped and verified locally.
- **2026-05-08** — Picked Vitest projects for the unit/integration split rather than CLI flags, after Vitest 4 dropped `--include`. `pnpm test` uses `--project unit`, `pnpm test:integration` uses `--project integration`. Same `vitest.config.ts`, two named project blocks.
- **2026-05-08** — Decided to keep the public root `/` as a session-aware redirect (signed-in → `/calendar`, otherwise → `/sign-in`) rather than preserve the Phase 0 status landing. Reason: the status page was a deploy-verification placeholder; the real app shouldn't open on it.
- **2026-05-08** — `auth.users` → `pts` row sync implemented as a `SECURITY DEFINER` Postgres trigger (`public.handle_new_user` on `auth.users` AFTER INSERT) instead of app-side code at signup. Reason: keeps the data layer self-consistent during dev without an auth UI, and means future signup code only needs to `UPDATE` the existing row with onboarding fields rather than juggling insert order. Defaults: `timezone='Europe/Berlin'`, `retention_days=90`. The PT row is also CASCADE-linked to `auth.users(id)`, so deleting the auth user purges the PT data.
- **2026-05-08** — Phase 1 split into a backend-only landing first (Drizzle, schema, RLS, tenancy helpers, signup trigger) and a follow-up session for Vitest + auth UI + dashboard shell. Reason: tests and UI weren't blocking later phases and the data layer is the dependency every other phase needs to start.
- **2026-05-07** — Closed Phase 0. Treat the bootstrap as complete for development: local scaffold, Vercel deploy, env wiring, and Meta Embedded Signup dev preflight are all done. Leave Meta Business Verification plus App Review / advanced access as a later production-onboarding dependency, not a Phase 0 blocker.
- **2026-05-07** — Continue Meta work on a dev path without Business Verification: keep testing limited to app-role users, the Meta test app, and test WhatsApp assets; defer external PT onboarding until Business Verification plus App Review / advanced access are complete.
- **2026-05-07** — Finalized the temporary `META_REDIRECT_URI` to `https://kdmedium.vercel.app/api/auth/meta-embedded` and completed the Facebook Login for Business / Embedded Signup dashboard preflight (`config_id`, allowed domains, redirect validation, `messages` + `account_update` subscriptions).
- **2026-05-07** — Split AI model selection by environment. Dev keeps `meta-llama/llama-3.3-70b-instruct:free` (€0 iteration); prod switches to `openai/gpt-4.1-mini` for reliable tool calling and ZDR-compliant routing. Implemented as `selectModel()` in `lib/ai/models.ts` (Phase 3) driven by `OPENROUTER_DEV_MODEL` / `OPENROUTER_PROD_MODEL` / `OPENROUTER_MODEL_OVERRIDE` env vars. Reason: free Llama's tool-calling reliability and free-tier privacy posture aren't acceptable for production patient-facing chat; cost at MVP volume is well under €5/PT/month. Updated tech doc §2 / §8 / §10 and `phases/03-ai-conversation-engine.md` accordingly; new env names added to Phase 0 wiring.
- **2026-05-07** — Flipped the calendar default to **custom** (`react-day-picker` for month + a `date-fns`-driven grid for week). Reason: FullCalendar's bundle (~200–400 KB) eats too much of the ≤3 s 3G first-load budget, and the MVP calendar only needs view + tap-to-open; drag-to-reschedule is deferred. FullCalendar is reserved for a specific feature later that is too painful to build. Updated tech doc §2 / §9 and `phases/07-pt-pwa-ui.md` accordingly.
- **2026-05-07** — Pinned Next.js to stable v15 (`15.5.16`) and `eslint-config-next` to match (was `16.2.4`). Reason: keep the running stack aligned with `docs/tech-stack-and-architecture.md` rather than running production on `create-next-app`'s default v16 ahead of the doc. Required swapping `eslint.config.mjs` to a `FlatCompat` shim because Next 15's `eslint-config-next` is legacy-format; added `@eslint/eslintrc` as a devDependency.
- **2026-05-07** — Pinned Inngest to stable v3 (`3.54.2`, was `4.0.0-beta.4`). Reason: the async backbone (webhook fan-out, reminders, retention purge, template polling) is too central to run on a beta SDK. Reassess once v4 is GA. No code migration needed — only a placeholder route exists.
- **2026-05-07** — Adopted Vitest as the test runner and promoted RLS isolation tests into Phase 1 deliverables. Reason: tenant isolation is the highest-leverage test surface in this codebase; the matrix must exist before any tenant data flows through the system. Added §15 Testing to the architecture doc.
- **2026-05-07** — The first Vercel deployment is live at `kdmedium.vercel.app`; bootstrap rendering is verified on both mobile and desktop.
- **2026-05-06** — Meta App Review starts in Phase 0 on day one, not Phase 2. Keep a separate Meta dev/test app for local and non-prod work.
- **2026-05-06** — Replace Vercel AI Gateway with OpenRouter. Use `OPENROUTER_API_KEY` and keep provider routing decisions inside `lib/ai/`.
- **2026-05-06** — The current OpenRouter guardrail pins runtime inference to `meta-llama/llama-3.3-70b-instruct:free`. Do not silently introduce paid or alternate models without an explicit planning update.
- **2026-05-06** — OpenRouter is accepted on the current plan without guaranteed EU-only inference; keep system-of-record data in EU services, minimize prompt payloads, and disclose cross-border AI processing in privacy docs.
- **2026-05-06** — Sentry and PostHog are intentionally skipped for the current MVP because their free-tier limits are exhausted. Use structured platform logs and internal dashboards instead.
- **2026-05-06** — Use the Vercel production URL as the temporary `META_REDIRECT_URI` until a custom domain exists.
- **2026-05-06** — Required env vars were mirrored from local `.env.local` into Vercel preview and production.
- **2026-05-06** — Follow the current Next.js generator outputs as authoritative; do not force legacy config filenames.
- **2026-05-06** — `create-next-app@latest` produced Next.js `16.2.4`, not 15. Phase 0 now follows the current generator output rather than pinning the earlier plan text.
- **2026-05-06** — `.env.example` must be tracked even though `.env.local` stays ignored; `.gitignore` now explicitly unignores `.env.example`.
- **2026-05-06** — GitHub repo creation and the initial push to `main` were completed for Phase 0 tracking purposes.
- **2026-05-06** — Meta production app and separate testing app were created; App Review is still pending.
- **2026-05-06** — Vercel project setup was completed with the repo linked and the deployment region configured.
- **2026-05-06** — Supabase Phase 0 setup completed in Frankfurt and the required connection values were captured for later wiring.
- **2026-05-06** — OpenRouter setup completed and the current model guardrail was pinned to `meta-llama/llama-3.3-70b-instruct:free`; next is Inngest and Vercel env wiring.
- **2026-05-06** — Inngest setup completed and the event key plus signing key were captured; next is Vercel env wiring.
- **2026-05-06** — Project plan created. Phasing follows `docs/tech-stack-and-architecture.md` §13 MVP cut line. No deviations from the tech doc yet.

---

## Recent sessions

_One bullet per session: date — what shipped — what's next._

- **2026-05-14** — Started Phase 2 with the Inngest event-bus wiring. New `lib/inngest/`: `events.ts` (typed event union for `message.received`, `wa.connection.created`, `wa.connection.revoked`, `wa.template.approved`), `client.ts` (singleton `Inngest({ id: 'medium', schemas: EventSchemas.fromRecord<Events>() })` with module-init throw on missing `INNGEST_EVENT_KEY`), `functions.ts` (empty `InngestFunction.Like[]` — real handlers land in Phases 5–6), and unit tests covering both env-guard branches. Replaced the placeholder `app/api/inngest/route.ts` with the real `serve({ client, functions })` exporting GET/POST/PUT under `runtime = 'nodejs'`. `.env.test` got `INNGEST_EVENT_KEY=dev` so future tests can transitively import the client. Typecheck + lint clean; 61/61 tests pass (59 baseline + 2 new). Local smoke: `GET /api/inngest` returns `{ has_event_key: true, has_signing_key: true, function_count: 0, mode: 'dev' }`; `PUT` returns 500 `"No functions registered within your app"` — expected for zero-function Phase 2 state. Next: token encryption helpers + webhook hardening.
- **2026-05-14** — Ran Lighthouse mobile audit against prod: 100 / 100 / 100 on Performance, Best Practices, SEO; 96 on Accessibility. Last open Phase 1 acceptance bullet is now satisfied; Phase 1 is fully closed. Next: Phase 2 — WhatsApp integration.
- **2026-05-14** — Finished Google OAuth end-to-end on prod: added `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel Production and redeployed (root cause of the "no network call" symptom — `NEXT_PUBLIC_*` vars are inlined at build time and were missing from the previous build); set Supabase **Site URL** to `https://kdmedium.vercel.app` and added both `https://kdmedium.vercel.app/auth/callback` and `http://localhost:3000/auth/callback` to **Redirect URLs** so the OAuth flow lands on the correct origin for prod and local dev. Google sign-in now works on both. Next: dig into the `pnpm build` `PageNotFoundError` for the auth routes, then start Phase 2 — WhatsApp integration.
- **2026-05-08** — Fixed the font theme-token regression in `app/globals.css`: Tailwind `--font-sans` / `--font-heading` now point at Next's `--font-geist-sans` variable instead of self-referencing `--font-sans`, and the compiled CSS now emits `html{font-family:var(--font-geist-sans)}` again. `pnpm lint` passes. A separate follow-up is needed for `pnpm build`, which currently fails during page-data collection with `PageNotFoundError` on `/sign-in`, `/sign-up`, and `/forgot-password`.
- **2026-05-08** — Closed Phase 1: brought up the local Supabase stack (`supabase init` + `supabase start`), wrote `vitest.config.ts` with unit/integration projects + globalSetup that reapplies Drizzle migrations and clears `auth.users`, added the tenancy unit test, the `audit.integration.test.ts` covering success + throw paths, the `coverage.integration.test.ts` introspecting `pg_class.relrowsecurity` and `pg_policies` for every tenant-scoped table, and the `isolation.integration.test.ts` matrix that fails if a new `pt_id`-bearing table lacks a seed factory and otherwise asserts SELECT/INSERT/UPDATE/DELETE blocks for cross-tenant access (12 tables × 4 verbs + pts SELECT/UPDATE specials = 50 cells, plus the 1 registry-coverage assertion). Built `lib/supabase/browser.ts`, `lib/auth/actions.ts` (`signOut`), the `(auth)` route group with `/sign-up`, `/sign-in`, `/forgot-password` (server actions + `useActionState` inline errors + zod validation), the `/auth/callback` route handler with same-origin `next` validation, `middleware.ts` for JWT cookie refresh, and the `(dashboard)` shell (auth guard in `layout.tsx`, top header with avatar dropdown + sign-out, fixed bottom nav with active-state styling, and placeholder Calendar/Chat/Settings pages). 59/59 tests green, lint + typecheck + production build all clean, dev-server smoke confirms unauthenticated `/` and `/calendar` both redirect to `/sign-in`. Next: Phase 2 — WhatsApp integration.
- **2026-05-08** — Landed the Phase 1 data layer: installed Drizzle + `postgres-js` + `@supabase/{ssr,supabase-js}`, wrote `lib/db/schema.ts` for all 13 tables with indexes, applied four migrations to the Frankfurt dev DB (`pgcrypto`, schema, RLS policies on every tenant-scoped table, and the `auth.users`→`pts` trigger + FK), and built `lib/tenancy/` (`getAuthedClient`, `getServiceClient`, `withAuditLog`, `TenancyError`) plus `lib/supabase/{server,service}.ts`. End-to-end smoke (`scripts/smoke-tenancy.ts`) verifies trigger insert + defaults, ctx validation, audit-log success/throw paths, RLS cross-tenant isolation (SELECT and INSERT), and CASCADE on user delete — 17/17 green. Next: Vitest + RLS isolation matrix + auth UI + dashboard shell in a follow-up Phase 1 session.
- **2026-05-07** — Closed Phase 0 by accepting the final secret review; next is Phase 1 Foundation (Drizzle schema, RLS, tenancy helpers, auth, and the first dashboard shell).
- **2026-05-07** — Finalized the Meta Embedded Signup dev preflight: the temporary `META_REDIRECT_URI`, Facebook Login for Business settings, saved `config_id`, webhook subscriptions, and Meta test assets are all in place; next is the final secret review and then implementation in Phase 1 / Phase 2 can proceed on the dev path while external PT onboarding stays deferred behind Meta verification/review.
- **2026-05-07** — Split AI model selection by environment (dev = free Llama, prod = `openai/gpt-4.1-mini`) via env-driven `selectModel()`; flipped the calendar default to a custom `react-day-picker` + `date-fns` build; updated tech doc §2 / §8 / §9 / §10 and the Phase 0 / 3 / 7 trackers; next is the remaining Phase 0 wiring (`META_REDIRECT_URI`, Meta App Review, final secret review, plus the new OpenRouter model env vars in Vercel).
- **2026-05-07** — Pinned Next.js to v15.5.16, Inngest to v3.54.2, fixed the ESLint flat config for Next 15 via `FlatCompat`, and added the testing strategy (Vitest + RLS isolation matrix promoted into Phase 1); next is the remaining Phase 0 wiring (`META_REDIRECT_URI`, Meta App Review, final secret review).
- **2026-05-07** — Verified the first Vercel deploy at `kdmedium.vercel.app` and confirmed the bootstrap app opens on mobile and desktop; next is `META_REDIRECT_URI`, Meta App Review, and the final secret review.
- **2026-05-06** — Reviewed and tightened the Phase 0 bootstrap plan; next is execute the bootstrap checklist.
- **2026-05-06** — Bootstrapped the local app scaffold, added tooling and placeholder routes, and verified `pnpm lint`, `pnpm typecheck`, `pnpm dev`, placeholder route responses, and `pnpm build`; next is external service setup plus deploy wiring.
- **2026-05-06** — GitHub repo was marked done in Phase 0 tracking; next is the remaining hosted services, env wiring, and deployment checks.
- **2026-05-06** — Meta production and testing apps were marked done; next is App Review plus the remaining hosted services and deployment checks.
- **2026-05-06** — Vercel project setup was marked done; next is env wiring, preview verification, and the remaining hosted services.
- **2026-05-06** — Supabase project created in Frankfurt and the needed env values captured; next is the remaining hosted services plus Vercel env wiring.
- **2026-05-06** — Switched the AI plan from Vercel AI Gateway to OpenRouter; next is create the OpenRouter key and update the remaining Phase 0 hosted-service setup.
- **2026-05-06** — Inngest event and signing keys were captured; next is env wiring and deploy verification.
- **2026-05-06** — Sentry and PostHog were intentionally skipped, and required env vars were mirrored into Vercel; next is `META_REDIRECT_URI`, Meta App Review, preview verification, and the final secret review.
- **2026-05-06** — Retired the detailed `doing` playbook after verification; canonical status now lives in `phases/00-bootstrap.md` and this progress file.

---

## Open questions

_Things to decide before I get to the relevant phase._

- Domain name for the production deployment? Optional for Phase 0; needed before Phase 2 if we want to stop using the Vercel URL as `META_REDIRECT_URI`.
- Pick first real PT for the launch test — needed by Phase 12.
