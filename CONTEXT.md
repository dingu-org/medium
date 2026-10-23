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

## Services and where they happen

- **Service mode** — where a single service takes place: at the business's
  own place, at the client's place, or online. Every service has exactly one
  mode. Offering the same thing in two modes means two services, which is
  why a free account (one active service) can offer only one mode. A
  business has no mode of its own; what it offers is the set of its
  services' modes.

- **Service area** — the free-text description of where a business will come
  to the client ("Tiranë dhe rrethinat"). It is words, not a map or a radius.
  The assistant uses it to say whether a client is covered, and records the
  client's own address, as text, on the appointment.

- **Business type** — what kind of business an account is, picked from a
  closed list that Medium defines (never free text). Each type has its own
  assistant behaviour, so adding a type means defining how the assistant
  works for it. Not the same as a service: a business has one type and
  offers several services.

## Onboarding

- **Onboarding flow** — which setup an account goes through: the **legacy**
  flow (the checklist) or the **guided** flow (one linear path, one step at a
  time). It is fixed when the account is created: accounts that existed when
  the guided flow shipped stay legacy, every account created afterwards is
  guided, and an account is never moved from one to the other.
