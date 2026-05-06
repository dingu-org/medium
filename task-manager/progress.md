# Progress

> Living document. Update at the end of every working session.

**Last updated:** 2026-05-06
**Current phase:** Phase 0 in flight — local scaffold is in place; external account setup and deploy wiring remain.
**Days into build:** 0

---

## Status by phase

| # | Phase | Status | Notes |
|---|---|---|---|
| 0 | Bootstrap | ◐ In flight | Local scaffold complete; external services, Sentry, and deploy verification still pending. |
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
- Remaining: external accounts, Sentry wizard, Vercel envs, first deploy verification, and mobile preview checks.

---

## Blockers

_Things that need an external answer or an account / approval I'm waiting on._

- Meta App Review.
- Inngest, Vercel AI Gateway, Sentry, and PostHog setup.

---

## Verification notes

_What is actually complete versus still missing for Phase 0._

- Complete locally: Next.js scaffold at repo root, formatting/tooling, Husky pre-commit, shadcn/ui setup, placeholder routes, module folders, `.env.example`, local `.env.local`, generated local secrets, `pnpm lint`, `pnpm typecheck`, `pnpm dev`, placeholder route smoke tests, and `pnpm build`.
- Not complete yet: Vercel env wiring, Inngest/AI Gateway/Sentry/PostHog setup, Meta App Review completion, Sentry wizard plus test error verification, Vercel preview deploy, and mobile device preview checks.
- Verified mismatch fixed: `.env.example` is now explicitly unignored so it can be committed while `.env.local` stays ignored.

---

## Decisions log

_Significant choices that diverge from the tech doc or that I want to remember the reasoning for. Newest first._

- **2026-05-06** — Meta App Review starts in Phase 0 on day one, not Phase 2. Keep a separate Meta dev/test app for local and non-prod work.
- **2026-05-06** — Replace direct Anthropic integration with Vercel AI Gateway. Use `AI_GATEWAY_API_KEY`, keep Claude Haiku 4.5 / Sonnet 4.6 as the default models, and keep provider routing decisions inside `lib/ai/`.
- **2026-05-06** — Use the Vercel production URL as the temporary `META_REDIRECT_URI` until a custom domain exists.
- **2026-05-06** — Follow the current Next.js and Sentry generator outputs as authoritative; do not force legacy config filenames.
- **2026-05-06** — `create-next-app@latest` produced Next.js `16.2.4`, not 15. Phase 0 now follows the current generator output rather than pinning the earlier plan text.
- **2026-05-06** — `.env.example` must be tracked even though `.env.local` stays ignored; `.gitignore` now explicitly unignores `.env.example`.
- **2026-05-06** — GitHub repo creation and the initial push to `main` were completed for Phase 0 tracking purposes.
- **2026-05-06** — Meta production app and separate testing app were created; App Review is still pending.
- **2026-05-06** — Vercel project setup was completed with the repo linked and the deployment region configured.
- **2026-05-06** — Supabase Phase 0 setup completed in Frankfurt and the required connection values were captured for later wiring.
- **2026-05-06** — Project plan created. Phasing follows `docs/tech-stack-and-architecture.md` §13 MVP cut line. No deviations from the tech doc yet.

---

## Recent sessions

_One bullet per session: date — what shipped — what's next._

- **2026-05-06** — Reviewed and tightened the Phase 0 bootstrap plan; next is execute the bootstrap checklist.
- **2026-05-06** — Bootstrapped the local app scaffold, added tooling and placeholder routes, and verified `pnpm lint`, `pnpm typecheck`, `pnpm dev`, placeholder route responses, and `pnpm build`; next is external service setup plus Sentry/Vercel wiring.
- **2026-05-06** — GitHub repo was marked done in Phase 0 tracking; next is the remaining hosted services, env wiring, and deployment checks.
- **2026-05-06** — Meta production and testing apps were marked done; next is App Review plus the remaining hosted services and deployment checks.
- **2026-05-06** — Vercel project setup was marked done; next is env wiring, preview verification, and the remaining hosted services.
- **2026-05-06** — Supabase project created in Frankfurt and the needed env values captured; next is the remaining hosted services plus Vercel env wiring.
- **2026-05-06** — Switched the AI plan from direct Anthropic to Vercel AI Gateway; next is create the gateway key and update the remaining Phase 0 hosted-service setup.
- **2026-05-06** — Retired the detailed `doing` playbook after verification; canonical status now lives in `phases/00-bootstrap.md` and this progress file.

---

## Open questions

_Things to decide before I get to the relevant phase._

- Domain name for the production deployment? Optional for Phase 0; needed before Phase 2 if we want to stop using the Vercel URL as `META_REDIRECT_URI`.
- Pick first real PT for the launch test — needed by Phase 12.
