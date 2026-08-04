# Context

The ubiquitous language for this repo. Terms are added when they're resolved,
not before. Implementation details live in code and `docs/`, not here.

## Environments

- **Environment** — one of exactly three named worlds the app can run in:
  `development`, `preview`, `production`. An environment owns its backing
  services; for **stateful** services (databases, encryption keys, queues,
  push keypairs) the ownership is absolute — two environments never share
  them. (`NODE_ENV` does not name an environment — it names a build mode.)

- **Borrow** — a deliberate, temporary use of another environment's backing
  service, done by hand and undone afterwards. The only sanctioned borrow:
  Development borrows Preview's Meta test app for local WhatsApp E2E over a
  tunnel (a Meta app has one webhook URL, so dev and preview cannot hold it
  simultaneously). Nothing is ever borrowed from Production.

- **Meta apps** — the live Meta app belongs to Production alone. The Meta
  *test* app belongs to Preview (webhooks + OAuth pointed at the preview
  domain). Development defaults to fake Meta credentials.

- **Development** — the environment on a developer's machine. Backed
  exclusively by the local Supabase Docker stack; touching a hosted database
  from here is an explicit, guarded exception, never the default.

- **Preview** — the deployed rehearsal environment. Vercel Preview deployments
  of the `preview` branch, backed by the dedicated preview Supabase project.
  Exists to test changes against production-shaped infrastructure without
  production data.

- **Production** — the live environment. Vercel Production deployments of the
  `main` branch, backed by Supabase project `fozwkvyydqgpduxxgatm` (the
  original project; it predates the three-environment split and was kept as
  production's own).

- **Inngest environments** — Production and Preview each own a permanent
  cloud Inngest environment (`production`, `preview` — both first-class, not
  branch environments; branch environments go unused). Development's Inngest
  is the local Dev Server; it has no cloud environment at all.

- **Shared-by-choice services** — Sentry and PostHog are deliberately shared
  across environments for now (neither is read by application code yet).
  Everything not on this short list follows the ownership rule.

- **Provisioned** — an environment is provisioned once its own backing
  services exist and its identity is recorded in the environment manifest.
  An unprovisioned environment refuses to boot rather than borrow another
  environment's services.

- **Fail closed** — the response to any environment-integrity problem
  (wrong project, missing variable, schema behind the code) in every
  environment, production included: refuse to boot. Wrong-database is worse
  than downtime. The single escape hatch exists for deliberate
  cross-environment operations (migrations, backfills) — never for seeding.

- **The train** — the only route to production: feature branches merge into
  `preview`, are QA'd on the preview deployment, and `preview` merges into
  `main`. `main` receives direct commits only as emergency hotfixes, which
  merge back into `preview` immediately. Every production deploy is a commit
  Preview has already run.

- **Preview data** — disposable by definition. Seeded on demand with the QA
  fixtures, wiped and reseeded freely, augmented organically via the Meta
  test app. Production data never enters Preview in any form.
