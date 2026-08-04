# Environments

Three environments, each owning its backing services. The glossary is in
`CONTEXT.md`; the machine-readable variable contract is `lib/env/env-vars.ts`;
the identity manifest (which Supabase project each environment may touch) is
`lib/env/environments.ts`. This document is the operational side: what each
environment is, how configuration is verified, and the runbooks.

|                | Development                | Preview                          | Production                  |
| -------------- | -------------------------- | -------------------------------- | --------------------------- |
| Runs           | `pnpm dev` on your machine | Vercel Preview, `preview` branch | Vercel Production, `main`   |
| URL            | `http://localhost:3000`    | `medium-preview.dingu.org`       | `medium.dingu.org`          |
| Supabase       | local stack (`supabase start`) | `medium-preview` project     | `fozwkvyydqgpduxxgatm`      |
| Inngest        | local Dev Server           | cloud env `preview` (custom)     | cloud env `production`      |
| Meta           | fake creds (may borrow the test app) | owns the **test app**  | live app, exclusively       |
| POK            | staging                    | staging                          | production                  |
| AI model       | `OPENROUTER_DEV_MODEL` (free) | `OPENROUTER_DEV_MODEL` (free) | `claude-haiku-4.5`, high effort (plans.ts) |
| Sentry/PostHog | shared (dormant)           | shared                           | shared                      |
| Push (VAPID)   | throwaway committed pair   | own pair                         | own pair                    |

Other git branches do not deploy at all (`scripts/vercel-ignore-build.sh`).

## Design rationale

- **`NODE_ENV` cannot distinguish the environments** — Vercel builds and runs
  Preview with `NODE_ENV=production`. Identity questions (which database,
  which Meta app, which model tier) key on `appEnv()`
  (`lib/env/app-env.ts`), resolved from `APP_ENV` → `NEXT_PUBLIC_APP_ENV` →
  `VERCEL_ENV` → default `development`. `NODE_ENV` remains for genuine
  build-mode concerns (secure cookies, HMR caches, the service worker).
- **Fail closed, production included.** At server start (`instrumentation.ts`)
  the guard verifies every Supabase pointer resolves to the project the
  manifest declares for this environment, and that all required variables are
  set. A wrong database is worse than downtime. `ALLOW_ENV_MISMATCH=1`
  downgrades the failure to a loud warning — use it only for deliberate
  cross-environment operations (migrations, backfills). Seeding refuses
  production even with it.
- **Migrations backstop.** Vercel's build command runs
  `pnpm check:migrations` before `next build`: if the target database is
  missing any migration the repo ships, the deploy goes red instead of
  drifting. The database being *ahead* is fine — the documented order is
  migrate first, merge second.
- **The train.** Feature branches merge into `preview`; QA happens on the
  preview deployment; `preview` merges into `main`. Direct commits to `main`
  are emergency hotfixes only and merge back into `preview` immediately.

## Verifying configuration

```sh
pnpm check:env          # is THIS process pointed at the right world?
pnpm check:env:vercel   # does the Vercel project keep Preview/Production separate?
pnpm check:migrations   # is the target database up to date with the repo?
```

`check:env:vercel` fails when any variable marked `mustDiffer` in
`lib/env/env-vars.ts` is served by a single entry targeting both Preview and
Production — the configuration state that caused the original shared-database
defect.

## Provisioning Preview (one-time checklist)

Preview fails closed until this is done — that is intended.

1. **Supabase**: create project `medium-preview` (region `eu-central-1`, same
   as prod). Record: project ref, DB password, anon + service-role keys.
2. **Manifest**: set `ENVIRONMENTS.preview.supabaseProjectRef` in
   `lib/env/environments.ts` to the new ref.
3. **Inngest**: confirm the custom environment `preview` exists (create it if
   not); record its event key and signing key.
4. **Mint preview-only secrets** (never reuse production's):

   ```sh
   openssl rand -base64 32                 # TOKEN_ENCRYPTION_KEY
   npx web-push generate-vapid-keys        # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
   openssl rand -hex 24                    # META_WEBHOOK_VERIFY_TOKEN
   ```

5. **Vercel variables**: delete every entry that targets both Preview and
   Production; re-add each variable twice — a Production-only entry (values
   from `.env.local.pre-split.bak`, i.e. today's live values) and a
   Preview-only entry (new project's URLs/keys, the minted secrets, the Meta
   **test app** ids, `NEXT_PUBLIC_APP_URL=https://medium-preview.dingu.org`,
   `POK_ENV=staging`, Inngest `preview` keys). Store them **plain, not
   Sensitive** (see §Sensitive above) so `vercel env pull` works. The full
   required/differs matrix is `lib/env/env-vars.ts`. Then:
   `pnpm check:env:vercel` → green.
6. **Meta test app**: point the WhatsApp webhook callback, Embedded Signup
   redirect, and allowed domains at `https://medium-preview.dingu.org`, with
   the preview `META_WEBHOOK_VERIFY_TOKEN`.
7. **Schema + data**:

   ```sh
   pnpm env:pull:preview      # → .env.vercel.preview (git-ignored)
   pnpm db:migrate:preview
   pnpm seed:qa:preview       # qa@medium.local / qa-medium-1234
   ```

8. **Deploy**: push `preview`; the build passes `check:migrations`, the boot
   guard passes, and `medium-preview.dingu.org` serves the QA fixture.
   Redeploy `main` once to confirm Production is green under the re-entered
   variables.

## Sensitive variables and `vercel env pull`

Variables stored as **Sensitive** in Vercel cannot be read back:
`vercel env pull` writes the literal placeholder `[SENSITIVE]` instead of the
value, and the guard rejects such a file by name. Two workable postures:

- **Store deployed variables as plain (encrypted) rather than Sensitive.**
  Then `pnpm env:pull:preview` / `env:pull:prod` produce usable files and the
  `db:migrate:*` / `seed:*:preview` scripts work as documented. This is the
  recommended posture for this solo project.
- **Keep them Sensitive** and maintain the local env files by hand
  (`.env.vercel.preview` / `.env.vercel.production` are git-ignored either
  way). You become the sync mechanism; `pnpm check:env` at least verifies the
  file you maintain points at the right project.

Until the per-environment re-entry is done, production's real values live in
`.env.local.pre-split.bak`, so production-targeting commands take
`ENV_FILE=.env.local.pre-split.bak` (e.g.
`APP_ENV=production ENV_FILE=.env.local.pre-split.bak pnpm exec drizzle-kit migrate`).

## Runbooks

### Schema change

1. Edit `lib/db/schema.ts` (+ RLS in the migration), `pnpm db:generate`.
2. Apply locally (the test setup migrates automatically; `pnpm db:migrate`
   for the dev stack).
3. Merge to `preview` → `pnpm env:pull:preview && pnpm db:migrate:preview`
   **before** the deploy finishes (order within the minute doesn't matter —
   a too-early deploy just goes red and the next push goes green).
4. After QA, merge `preview` → `main` → `pnpm env:pull:prod &&
   pnpm db:migrate:prod`.

The drizzle config asserts the target's project ref before migrating, so
`db:migrate:preview` with production credentials refuses to run.

### Reseeding preview

`pnpm seed:qa:preview` (idempotent-ish; wipes and recreates the QA PT) or
`pnpm seed:reset:preview`. Seeds refuse production unconditionally — there is
no override. Wiping *all* users (`db:reset:test`, the vitest setup) remains
local-only by design.

### Borrowing the Meta test app for local E2E

See the borrow block at the bottom of `.env`. Short version: tunnel, repoint the test app's
webhook at the tunnel, QA, **repoint it back at the preview domain** —
preview's WhatsApp is broken while you hold the borrow.

### Hotfix

Commit to `main` (or cherry-pick), deploy, then immediately
`git checkout preview && git merge main` so the branches cannot drift.

### Rollback

`vercel rollback` (or promote a previous deployment from the dashboard).
Manual deploys always build — the ignore script only filters git branches. If
the bad deploy included a migration, roll the schema decision explicitly —
never by re-deploying older code against a newer schema without checking
`pnpm check:migrations` semantics (older code with extra columns is usually
fine; dropped/renamed columns are not).

## Escape hatch

`ALLOW_ENV_MISMATCH=1` turns the boot guard's failure into a warning, in every
environment alike. Legitimate uses: running a one-off backfill from a laptop
against a deployed database (`APP_ENV=preview tsx --env-file=.env.vercel.preview …`
already passes the guard properly, so even then you rarely need it). It does
not unlock seeding.
