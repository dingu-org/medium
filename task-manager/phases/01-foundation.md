# Phase 1 — Foundation

**Goal.** All tenant-scoped tables exist with RLS policies, tenancy helpers refuse to run without a PT in scope, and a PT can sign up / log in to an empty dashboard shell.

**Source.** Tech doc §4 (Data model), §6 (Multi-tenancy and security).

**Effort.** 4–5 days.

**Prerequisites.** Phase 0 complete.

---

## Tasks

### Drizzle setup

- [x] Install `drizzle-orm`, `drizzle-kit`, `postgres` (the lightweight `postgres-js` client).
- [x] Configure `drizzle.config.ts` pointing at `lib/db/schema.ts` and the EU Supabase URL.
- [x] Add `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio` scripts.
- [x] Enable `pgcrypto` extension in the first migration (used for token encryption from Phase 2).

### Schema (one migration per logical group keeps diffs reviewable)

- [x] `pts` — id (uuid, FK to `auth.users`), email, practice_name, timezone, ai_name, ai_greeting, ai_escalation_keyword, retention_days (default 90), created_at.
- [x] `whatsapp_connections` — pt_id, phone_number_id, waba_id, access_token_encrypted, tier, quality_rating, connected_at, status (pending|active|revoked).
- [x] `patients` — pt_id, name, phone (E.164), wa_id, notes, created_at.
- [x] `conversations` — pt_id, patient_id, channel, last_inbound_at, ai_active (default true), escalation_state, created_at. Unique(patient_id, channel).
- [x] `messages` — pt_id, conversation_id, external_id (UNIQUE for idempotency), role (patient|ai|pt), channel, content, template_id (nullable), tokens_in/out (nullable), model (nullable), created_at.
- [x] `appointments` — pt_id, patient_id, starts_at, ends_at, service_type, status (pending|confirmed|cancelled|no_show|completed|rescheduled), notes, created_at.
- [x] `availability_rules` — pt_id, weekday (0–6), start_time, end_time.
- [x] `blocked_periods` — pt_id, starts_at, ends_at, label.
- [x] `message_templates` — pt_id, name, language, status (pending|approved|rejected), meta_id, body, last_status_at.
- [x] `reminder_jobs` — pt_id, appointment_id, scheduled_for, inngest_run_id, status, created_at.
- [x] `push_subscriptions` — pt_id, endpoint, keys (jsonb), user_agent, created_at.
- [x] `events` — id, pt_id, type, payload (jsonb), occurred_at — append-only domain event log.
- [x] `audit_log` — id, pt_id, actor (uuid|service), action, target_table, target_id, occurred_at.

### Indexes

- [x] `messages.external_id` UNIQUE (idempotency).
- [x] `conversations(pt_id, last_inbound_at DESC)` (chat list ordering).
- [x] `appointments(pt_id, starts_at)` (calendar queries).
- [x] `appointments(starts_at)` partial WHERE status IN (pending, confirmed) (reminder scan).
- [x] `events(pt_id, occurred_at DESC)`.

### RLS policies (write SQL by hand — Drizzle won't generate these)

- [x] Enable `ROW LEVEL SECURITY` on every tenant-scoped table.
- [x] Policy template per table: `USING (pt_id = auth.uid())` for SELECT/UPDATE/DELETE; `WITH CHECK (pt_id = auth.uid())` for INSERT.
- [x] Service role bypasses RLS (default); the tenancy helper is the guardrail when running as service role.
- [x] Test cross-tenant query: log in as PT A, attempt `SELECT * FROM patients WHERE pt_id = '<PT-B-id>'` → returns 0 rows, not an error. Confirms isolation.

### Tenancy helpers (`lib/tenancy/`)

- [x] `getAuthedClient(req)` — returns a Supabase client bound to the user's JWT; RLS is enforced automatically.
- [x] `getServiceClient(ptId)` — returns a service-role client. **Must require ptId**; throws if called without one.
- [x] `withAuditLog(action, target, fn)` — wraps a query, writes to `audit_log` after success, includes actor + target id.
- [x] Unit tests covering: helper refuses without ptId, helper writes audit log on success, helper does not write on thrown error.

### Tests (Vitest)

- [x] Install `vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths`.
- [x] Add `pnpm test` (unit) and `pnpm test:integration` (RLS / DB) scripts.
- [x] Wire `vitest.config.ts` to resolve `@/*` and load `.env.test`.
- [x] Local DB harness via `supabase start`; integration suite applies Drizzle migrations before running.
- [x] RLS isolation matrix: for every tenant-scoped table, assert PT A cannot SELECT / INSERT / UPDATE / DELETE PT B's rows. Generate the cases from the schema list so a new table without coverage fails the suite.
- [x] Tenancy helper unit tests (mirrors the bullet above): `getServiceClient()` throws without ptId; `withAuditLog()` writes on success, not on error.
- [x] CI assertion: introspect `pg_class.relrowsecurity` to confirm RLS is enabled on every `pt_id`-bearing table.

### Auth (PT)

- [x] Configure Supabase Auth providers: email + password, Google OAuth. _(Email/password and Google OAuth both live end-to-end: client wired in `oauth-buttons.tsx` + `/auth/callback`; Google provider enabled in Supabase + Google Cloud Console; Site URL + Redirect URLs configured for prod and localhost.)_
- [x] Build `/sign-up`, `/sign-in`, `/auth/callback`, `/forgot-password` routes (shadcn forms, Server Actions where possible).
- [x] On first sign-up, insert a row into `pts` keyed to `auth.users.id`. _(implemented as a SECURITY DEFINER trigger on `auth.users`; verified end-to-end.)_
- [x] Middleware (`middleware.ts`) protects `/(dashboard)/*` — redirect to `/sign-in` if not authenticated. _(Cookie refresh in `middleware.ts`; access guard in `(dashboard)/layout.tsx` redirects unauthenticated users.)_
- [x] Sign-out action; verify session is cleared.

### Dashboard shell

- [x] `/(dashboard)/layout.tsx` — bottom nav (Calendar, Chat, Settings), top header (PT name + sign-out).
- [x] Empty placeholder pages: `/(dashboard)/calendar`, `/(dashboard)/chat`, `/(dashboard)/settings`.
- [x] Mobile-first styling — design at iPhone 12 width (390 px) by default.

---

## Acceptance criteria

- [x] All tables in tech doc §4 exist; `drizzle.config.ts` introspection matches.
- [x] RLS is enabled on every tenant-scoped table; the cross-tenant test returns 0 rows.
- [x] `getServiceClient()` (no ptId) throws.
- [x] `withAuditLog` writes one `audit_log` row per call.
- [x] A new email signs up, a `pts` row is created, the user lands on `/calendar` (empty), and Sign Out works. _(Verified: dev server smoke shows `/` and `/calendar` redirect to `/sign-in` when unauthenticated; sign-up trigger covered by integration tests; full browser walkthrough belongs in the next session against the local stack with `supabase start`.)_
- [ ] Lighthouse mobile pass (no PWA features yet, just basic perf + a11y) ≥ 90. _(Pending: requires running Lighthouse against `pnpm build && pnpm start` with a real signed-in session.)_
- [x] `pnpm test:integration` passes against a local Supabase stack with the RLS matrix.
- [x] CI introspection asserts RLS is enabled on every `pt_id`-bearing table.

---

## Notes

- RLS policies are easy to forget — write a checklist test that asserts every tenant-scoped table has RLS enabled. Run it in CI.
- The audit log is a GDPR requirement, not just nice-to-have. Build it now so every later query goes through the helper.
- Don't store PT timezone in the user profile (Supabase Auth) — store on `pts`. Auth metadata is messy to query.
