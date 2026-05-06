# Medium

Bootstrap scaffold for **Medium**: a multi-tenant SaaS that lets solo physical therapists run patient bookings over WhatsApp with an AI assistant and oversee everything from a mobile-first PWA.

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Copy the env template and fill the unresolved values:

```bash
cp .env.example .env.local
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
pnpm dev
pnpm lint
pnpm typecheck
```

## Notes

- `.env.local` is gitignored.
- The repo also contains planning docs under `task-manager/` and product/architecture docs under `docs/`.
