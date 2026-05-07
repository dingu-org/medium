# Progress

> Living document. Update at the end of every working session.

**Last updated:** 2026-05-07
**Current phase:** Phase 0 in flight — local scaffold and first deploy are verified; external review and final wiring remain.
**Days into build:** 1

---

## Status by phase

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Bootstrap | ◐ In flight | Local scaffold and first deploy are verified; remaining work is Meta review, final redirect wiring, and final hygiene checks. |
| 1 | Foundation | ☐ Not started | — |
| 2 | WhatsApp integration | ☐ Not started | — |
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

- Verified the local scaffold against the retired `task-manager/doing/plan.md` checklist.
- Remaining: Meta App Review, final `META_REDIRECT_URI`, and final secret review.

---

## Blockers

_Things that need an external answer or an account / approval I'm waiting on._

- Meta App Review.

---

## Verification notes

_What is actually complete versus still missing for Phase 0._

- Complete locally: Next.js scaffold at repo root, formatting/tooling, Husky pre-commit, shadcn/ui setup, placeholder routes, module folders, `.env.example`, local `.env.local`, generated local secrets, `pnpm lint`, `pnpm typecheck`, `pnpm dev`, placeholder route smoke tests, and `pnpm build`.
- Complete in hosted verification: Vercel production deploy is live at `kdmedium.vercel.app`, and the bootstrap app opens correctly on both mobile and desktop.
- Not complete yet: `META_REDIRECT_URI` finalization, Meta App Review completion, and final secret review.
- Verified mismatch fixed: `.env.example` is now explicitly unignored so it can be committed while `.env.local` stays ignored.

---

## Decisions log

_Significant choices that diverge from the tech doc or that I want to remember the reasoning for. Newest first._

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
