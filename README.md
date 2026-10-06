# Medium

**Medium** is a multi-tenant appointment-booking product for small service businesses. An AI assistant answers customers in Albanian on the business's own WhatsApp number and books, reschedules, and cancels against the business's availability; the owner supervises everything from a mobile-first PWA.

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

Each business is one **account** (one login, one tenant); the people it books are **customers**. Every table is keyed on `account_id` (`lib/db/schema.ts`).

- **WhatsApp channel**: Meta Embedded Signup, including coexistence with an existing WhatsApp Business app number, plus the inbound webhook (`app/api/webhooks/whatsapp`).
- **Assistant**: a conversation engine that runs one AI turn per inbound message through the Vercel AI SDK and OpenRouter, and hands a thread to the owner when it can't help (`lib/conversation`, `lib/ai`).
- **Appointments**: availability computed in the account's timezone, collision-free booking, and WhatsApp reminders (`lib/appointments`, `lib/reminders`).
- **Owner app**: a PWA with Today, Calendar, Chat, Clients, and Settings, offline mutation replay, and Web Push notifications (`app/(dashboard)`, `app/sw.ts`).
- **Billing**: plan limits, conversation-day metering, and POK checkout (`lib/billing`, `app/api/webhooks/pok`).
- **Background jobs**: Inngest functions for inbound messages, reminders, WhatsApp sync and health, billing, and retention (`lib/inngest`, `app/api/inngest`).
- **Privacy**: GDPR export, erasure, and retention (`lib/gdpr`).

The stack is Next.js 15 App Router, Tailwind 4 with shadcn/ui, Supabase (Postgres and Auth) through Drizzle, and Inngest.

## Reference docs

- [Docs index](docs/README.md): every document under `docs/`, grouped by the question it answers
- [Product overview](docs/product/overview.md): actors, vocabulary, and the booking loop
- [Environments](docs/environments.md): development, preview, and production, migrations, and rollbacks
- [`CONTEXT.md`](CONTEXT.md): environment glossary

## Commands

```bash
pnpm dev                 # Next.js dev server
pnpm dev:test            # dev server on port 3105 for browser QA with seed:qa data
pnpm build               # production build
pnpm lint                # ESLint
pnpm typecheck           # tsc --noEmit
pnpm test                # Vitest unit suite
pnpm test:integration    # Vitest integration suite (requires local Supabase)
pnpm test:all            # both suites
pnpm db:generate         # Drizzle: generate a migration from lib/db/schema.ts
pnpm db:migrate          # Drizzle: apply migrations to $DATABASE_URL
pnpm db:studio           # Drizzle Studio
pnpm seed                # seed the local database (seed:reset, seed:qa also exist)
pnpm check:env           # verify .env against the variable contract
pnpm check:migrations    # fail if the database is behind the committed migrations
pnpm tunnel              # Cloudflare quick tunnel to the dev server, for Meta webhooks
```

Environment-specific variants (`*:preview`, `*:prod`, `env:pull:*`) and the smoke scripts (`ai:smoke`, `push:smoke`, `smoke:pok`) are listed in `package.json`; [Environments](docs/environments.md) explains when to use them.

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
- Planning and task tracking live in Jira project MED and Confluence space MED (dingu.atlassian.net); product/architecture docs are under `docs/`.
