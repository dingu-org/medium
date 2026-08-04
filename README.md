# Medium

Bootstrap scaffold for **Medium**: a multi-tenant SaaS that lets solo physical therapists run patient bookings over WhatsApp with an AI assistant and oversee everything from a mobile-first PWA.

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy the env template (works as-is — local-stack values):

```bash
cp .env.example .env
```

3. Start the app:

```bash
pnpm dev
```

Open `http://localhost:3000`.

## Current scope

- Next.js App Router scaffold
- Tailwind 4 + shadcn/ui baseline
- Placeholder API routes for WhatsApp webhook, Meta embedded auth, and Inngest
- Bootstrap env contract for later external service wiring

External accounts and live credentials are still required before Phase 0 is fully complete.

## Reference docs

- [Task manager](task-manager/README.md)
- [Project plan](task-manager/project-plan.md)
- [Phase 0 checklist](task-manager/phases/00-bootstrap.md)
- [Tech stack and architecture](docs/tech-stack-and-architecture.md)

## Commands

```bash
pnpm dev          # Next.js dev server
pnpm lint
pnpm typecheck
pnpm db:generate  # Drizzle: generate migration from lib/db/schema.ts
pnpm db:migrate   # Drizzle: apply migrations to $DATABASE_URL
pnpm db:studio    # Drizzle Studio
pnpm test         # Vitest unit suite
pnpm test:integration  # Vitest integration suite (requires local Supabase)
```

## Local Supabase stack

Integration tests and end-to-end auth smokes run against a local Supabase
stack (Postgres + GoTrue) brought up by the Supabase CLI.

```bash
brew install supabase/tap/supabase   # one-time
supabase start                        # boot the local stack (Docker required)
supabase status                       # confirm keys + URLs
pnpm test:integration                 # runs against the local stack via .env
```

Stop with `supabase stop`. Inbucket (test email inbox) at
http://127.0.0.1:54324; Studio at http://127.0.0.1:54323.

## Notes

- `.env` is gitignored; `.env.example` is a working copy of it. Deployed
  credentials are never kept locally except as pulled, git-ignored
  `.env.vercel.*` files (see `docs/environments.md`).
- The repo also contains planning docs under `task-manager/` and product/architecture docs under `docs/`.
