# Data model

Medium's schema is 23 tables and 12 enums in one Postgres database, defined in `lib/db/schema.ts` and migrated by the SQL files in `drizzle/migrations/`. Twenty-one tables carry an `account_id` foreign key to `accounts`; `accounts` is keyed on the Supabase auth user id, and `erasure_archive` deliberately holds a bare uuid instead. The application reads and writes exclusively through the owner connection, which bypasses row-level security, so RLS exists to bound what a tenant can reach over PostgREST and Realtime — everywhere else, tenancy is a `WHERE account_id = …` discipline in the query. This page is the reference for all of it.

## Tenancy model

One login is one `accounts` row is one tenant. `accounts.id` is a foreign key to `auth.users.id` with `ON DELETE CASCADE` (`drizzle/migrations/0003_pts_signup_trigger.sql`), and the `handle_new_user` trigger in the same migration mirrors every new auth user into `accounts` with `timezone = 'Europe/Berlin'` and `retention_days = 90`. Deleting the auth user is what deletes the account, and the cascade down `account_id` is what deletes everything it owns.

Three mechanisms enforce tenancy, and only one of them is RLS:

| Mechanism                     | Where                                          | What it actually guarantees                                                                                             |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Query discipline              | every query in `lib/**` and `app/**`           | the real isolation: each statement filters on `account_id`, because the connection it runs on bypasses RLS              |
| Row-level security            | `drizzle/migrations/` — `0002`, `0024`, `0027` | a tenant holding their own access token can read only their own rows over PostgREST and Realtime, and can write nothing |
| `getServiceClient(accountId)` | `lib/tenancy/service-client.ts`                | validates that the caller has a UUID-shaped account id before handing back a handle                                     |

`getServiceClient` is a guard, not a scoped connection. It throws a `TenancyError` on a missing or malformed account id and otherwise returns `{ db, accountId }` where `db` is the same owner connection from `lib/db/index.ts` that every other query uses. It narrows nothing at the database level, so a query that forgets its `account_id` predicate is not caught by it.

`withAuditLog` in `lib/tenancy/audit.ts` wraps a call and writes one `audit_log` row after it succeeds, recording actor, action, target table and target id. Its callers are the AI reads and tool calls, takeover, token issue, erasure and the retention purge; see [privacy and GDPR](./privacy-and-gdpr.md).

## Row-level security

Every table in `public` has RLS enabled and exactly one policy, named `<table>_tenant_isolation` on all but the two tables the rename left behind. The policies started as `FOR ALL TO authenticated` with a symmetric `WITH CHECK` (`0002_rls_policies.sql`), which combined with a schema-wide `GRANT ALL` to let a tenant write their own rows straight through PostgREST — enough to self-grant a plan, raise their own retention window, or forge `event_outbox` rows the publisher would republish as trusted events.

`0024_tenant_read_only_rls.sql` closed that. It revokes `INSERT`, `UPDATE`, `DELETE` and `TRUNCATE` from `anon` and `authenticated` schema-wide, adds the matching `ALTER DEFAULT PRIVILEGES`, and recreates every policy as `FOR SELECT`, keeping the same per-tenant `USING` predicate so Realtime keeps delivering. `0027_revoke_reference_and_trigger_grants.sql` then revokes `REFERENCES`, `TRIGGER` and — guarded on `server_version_num >= 170000` — `MAINTAIN`, which `GRANT ALL` had also handed out on four tables.

The convention for any new table follows from that: `GRANT SELECT ON TABLE "x" TO anon, authenticated`, never `GRANT ALL`. Selecting rather than denying outright means a blocked read returns zero rows instead of a `42501` error. `scripts/db-reset.ts` re-grants the same way after migrating.

Two policy shapes exist:

- **Read-own** — `USING (account_id = auth.uid())`, or `USING (id = auth.uid())` on `accounts`. Twenty tables.
- **Deny-all** — `USING (false)`. Three tables: `wa_message_statuses`, `reminder_deliveries` and `erasure_archive`, all operator or compliance records rather than owner-facing data.

`tests/rls/coverage.integration.test.ts` enumerates the tables from `pg_class` rather than deriving them from a column name, so a new table cannot ship with RLS off and still pass; it asserts every table's policy classifies as tenant or deny-all and that `anon` and `authenticated` hold no write privilege. `tests/rls/isolation.integration.test.ts` proves one tenant cannot read another's rows.

## Tables

Every table's tenant column is `account_id` unless noted, and the RLS column gives the policy shape from the section above.

| Table                  | Purpose                                                              | Tenant column                   | RLS      |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------- | -------- |
| `accounts`             | the tenant: one business, one login, one row                         | `id` (= `auth.users.id`)        | read-own |
| `whatsapp_connections` | one Meta phone number linked to an account, with its encrypted token | `account_id`                    | read-own |
| `whatsapp_contacts`    | address book synced from a coexistence connection                    | `account_id`                    | read-own |
| `customers`            | the person being booked                                              | `account_id`                    | read-own |
| `services`             | the bookable service catalogue with durations and prices             | `account_id`                    | read-own |
| `conversations`        | one customer's thread on one channel, plus its handling state        | `account_id`                    | read-own |
| `messages`             | every message in a thread, plus per-turn AI cost telemetry           | `account_id`                    | read-own |
| `appointments`         | booked time, its status and its cancellation record                  | `account_id`                    | read-own |
| `availability_rules`   | the weekly opening hours a slot grid is built from                   | `account_id`                    | read-own |
| `blocked_periods`      | one-off busy ranges subtracted from availability                     | `account_id`                    | read-own |
| `message_templates`    | the account's Meta template registry and approval state              | `account_id`                    | read-own |
| `reminder_jobs`        | one row per appointment's reminder cycle and its response            | `account_id`                    | read-own |
| `reminder_deliveries`  | billing fact: one Meta-confirmed template delivery per wamid         | `account_id`                    | deny-all |
| `push_subscriptions`   | one Web Push endpoint per browser                                    | `account_id`                    | read-own |
| `pwa_mutations`        | server-side ledger for mutations replayed from the offline queue     | `account_id`                    | read-own |
| `events`               | the domain event log, and the source of the notification bell feed   | `account_id`                    | read-own |
| `event_outbox`         | the publication queue in front of Inngest                            | `account_id`                    | read-own |
| `cost_daily`           | per-account per-day AI and Meta cost rollup                          | `account_id`                    | read-own |
| `wa_message_statuses`  | Meta delivery truth per outbound message, with pricing metadata      | `account_id`                    | deny-all |
| `conversation_days`    | billing fact: one active customer-day in the account's timezone      | `account_id`                    | read-own |
| `billing_orders`       | the POK one-off payment ledger and settle outcome                    | `account_id`                    | read-own |
| `audit_log`            | actor, action and target for privileged operations                   | `account_id`                    | read-own |
| `erasure_archive`      | compliance record of an erasure, outliving the account it describes  | `account_id` (bare uuid, no FK) | deny-all |

## Key columns and constraints

The rules a table enforces for itself live in its constraints and partial indexes. This table lists the ones that carry behaviour; the full column list is in `lib/db/schema.ts`.

| Table                  | Columns, indexes and constraints that carry rules                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`             | `timezone` (default `Europe/Berlin`) drives all slot math; `retention_days` (default 90) drives the purge; `plan`, `plan_expires_at`, `plan_lifetime`, `plan_downgraded_at` are the whole billing state — there is no subscription state machine; `assistant_paused` is the global assistant kill switch; `notification_prefs` is jsonb, null meaning defaults; `notifications_seen_at` is the bell's unread watermark                                                                  |
| `whatsapp_connections` | `whatsapp_connections_phone_number_id_uq` makes a number map to exactly one account, which is what lets the webhook resolve a tenant and the signup callback detect a duplicate connect; `access_token_encrypted` is `bytea`; `coexistence_*` columns hold sync request ids, progress, deadline and last error; `expiry_warning_sent_at` is the one-shot claim stamp for the expiry warning                                                                                             |
| `whatsapp_contacts`    | unique on `(account_id, phone)`; a second unique on `(account_id, wa_id)` partial to `wa_id IS NOT NULL`; `deleted_at` marks a contact removed upstream                                                                                                                                                                                                                                                                                                                                 |
| `customers`            | unique on `(account_id, wa_id)`. There is deliberately no unique on `(account_id, phone)`: two customers may share a number, which is why the data export withholds shared contacts. `reminder_opted_out_at` is set and cleared only by the customer                                                                                                                                                                                                                                    |
| `services`             | check `length(btrim(name)) > 0`; check `duration_min BETWEEN 5 AND 480`; check `price_lek > 0`; unique on `(account_id, lower(btrim(name)))`; index on `(account_id, active, created_at)`                                                                                                                                                                                                                                                                                               |
| `conversations`        | unique on `(customer_id, channel)`; `handoff_offer_message_id` is an anchor, not a foreign key, so a purged message makes the offer lapse rather than dangle; `ai_paused_until` has a partial index for the pause sweep; `last_inbound_at` has two composite indexes for the chat list                                                                                                                                                                                                  |
| `messages`             | `messages_external_id_uq` dedupes the inbound webhook and the outbound send; `messages_ai_reply_to_uq` is partial to `role = 'ai' AND reply_to_message_id IS NOT NULL`, which is what makes one AI reply per inbound message a database fact; `messages_source_event_id_uq` does the same for one confirmation per appointment event; `reply_to_message_id` self-references with `ON DELETE SET NULL`; `template_id` is a bare uuid by design                                           |
| `appointments`         | check `ends_at > starts_at`; `appointments_active_idempotency_uq` on `(account_id, customer_id, starts_at)` partial to `status IN ('pending','confirmed')` makes a replayed booking idempotent; `appointments_no_active_overlap` is an `EXCLUDE USING gist` over `account_id` and `tstzrange(starts_at, ends_at, '[)')` on the same active statuses — the last line against double-booking                                                                                              |
| `availability_rules`   | check `weekday BETWEEN 0 AND 6`, Sunday-first; check `end_time > start_time`; `time` columns, so the wall clock moves with the account's timezone                                                                                                                                                                                                                                                                                                                                       |
| `blocked_periods`      | check `ends_at > starts_at`; `label` is free text                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `message_templates`    | no unique index; `status` tracks Meta's approval, `meta_id` is Meta's own template id, `last_status_at` the last poll                                                                                                                                                                                                                                                                                                                                                                   |
| `reminder_jobs`        | `reminder_jobs_appointment_id_uq` means one job row per appointment, re-armed on reschedule; `reminder_jobs_response_message_id_uq` is partial to non-null; `delivered_at` is a latest-cycle convenience for the badge only — the billed fact is a `reminder_deliveries` row; `message_id` and `response_message_id` are `ON DELETE SET NULL`                                                                                                                                           |
| `reminder_deliveries`  | `reminder_deliveries_external_id_uq` makes a redelivered `delivered` webhook count once; `appointment_id` is `ON DELETE SET NULL` so erasure strips the link without deleting the billed fact; `external_id` is the one customer-linked field, so erasure rewrites it to `erased:<row id>`                                                                                                                                                                                              |
| `push_subscriptions`   | `push_subscriptions_endpoint_uq` makes re-subscribing an upsert instead of a pile of rows for one device; `keys` is jsonb                                                                                                                                                                                                                                                                                                                                                               |
| `pwa_mutations`        | unique on `(account_id, client_mutation_id)` is the offline queue's idempotency key; `status` moves `processing → sent → success` or `failed`; `result` stashes the response for a replay to return                                                                                                                                                                                                                                                                                     |
| `events`               | index on `(account_id, occurred_at DESC)` for the bell; index on `(type, occurred_at)` for the cross-tenant admin aggregates                                                                                                                                                                                                                                                                                                                                                            |
| `event_outbox`         | `event_outbox_event_id_uq` means one outbox row per event; index on `available_at` partial to `published_at IS NULL` serves the claim query; there is no status column — `available_at`, `locked_at` and `published_at` are the lifecycle                                                                                                                                                                                                                                               |
| `cost_daily`           | unique on `(account_id, day)` makes the rollup an idempotent upsert; `meta_cost_source` records whether the Meta figure came from the rate card or the estimate                                                                                                                                                                                                                                                                                                                         |
| `wa_message_statuses`  | unique on `external_id`; `last_status` is monotonic by rank (`sent` 1, `delivered` and `failed` 2, `read` 3) so an out-of-order webhook cannot downgrade it; the four `*_at` columns are stamped independently and first-write-wins, so `delivered_at` — the billing signal — survives a late `failed`; `billable` and `pricing_*` mirror Meta's pricing object with no amount                                                                                                          |
| `conversation_days`    | unique on `(account_id, customer_id, local_day)`; index on `(account_id, month_key)` is what the monthly count reads; `customer_id` and `conversation_id` are `ON DELETE SET NULL` and `first_message_id` is a bare uuid, so erasure anonymises the row instead of removing metered usage. NULLs are distinct, so a customer erased and re-contacting on the same local day produces a second fact for one real day — bounded, and always against the account rather than in its favour |
| `billing_orders`       | unique on `pok_order_id`; index on `created_at` partial to `status = 'created'` serves the reconcile scan; `previous_expires_at` and `new_expires_at` snapshot the extension a settle applied; `pok_payload` is a PII-free order snapshot                                                                                                                                                                                                                                               |
| `audit_log`            | no unique constraint; `actor` is `ai`, `account` or `system`, `action` is a dotted name such as `ai.tool.book_appointment` or `messages.retention_purge`                                                                                                                                                                                                                                                                                                                                |
| `erasure_archive`      | check `scope in ('customer','account')`; `before_state_hash` is a key-sorted SHA-256 of the erased row, so the record is tamper-evident without holding the data                                                                                                                                                                                                                                                                                                                        |

## Enums

Twelve Postgres enums are declared at the top of `lib/db/schema.ts`. Two carry a value nothing writes.

| Enum                       | Values                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connection_status`        | `pending`, `active`, `revoked`. `pending` is the column default and is never persisted — the signup callback inserts and updates rows as `active`, and `markRevoked` writes `revoked`                           |
| `whatsapp_connection_mode` | `cloud_api`, `coexistence`                                                                                                                                                                                      |
| `coexistence_sync_status`  | `not_applicable`, `pending`, `syncing`, `complete`, `failed`, `history_declined`                                                                                                                                |
| `message_role`             | `customer`, `ai`, `account`                                                                                                                                                                                     |
| `appointment_status`       | `pending`, `confirmed`, `cancelled`, `no_show`, `completed`, `rescheduled`. `rescheduled` is never written — a reschedule keeps the appointment's current status — and `transitionEvent` throws if asked for it |
| `cancellation_actor`       | `customer`, `account`, `ai`                                                                                                                                                                                     |
| `template_status`          | `pending`, `approved`, `rejected`                                                                                                                                                                               |
| `reminder_status`          | `scheduled`, `requeued`, `sent`, `skipped`, `failed`, `cancelled`                                                                                                                                               |
| `reminder_response_type`   | `confirm`, `cancel`, `reschedule_requested`, `opt_out`                                                                                                                                                          |
| `plan`                     | `free`, `solo`                                                                                                                                                                                                  |
| `billing_period`           | `monthly`, `yearly`                                                                                                                                                                                             |
| `billing_order_status`     | `created`, `paid`, `failed`, `expired`                                                                                                                                                                          |

## Text-typed state columns

Some state is `text` rather than an enum. The values below are the complete set the code writes.

| Column                                                                                | Values                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `conversations.escalation_state`                                                      | `idle` (default), `requested`                         |
| `conversations.ai_pause_reason`                                                       | `whatsapp_business_app_echo`, or null when not paused |
| `conversations.channel`, `messages.channel`                                           | `whatsapp`                                            |
| `pwa_mutations.status`                                                                | `processing` (default), `sent`, `success`, `failed`   |
| `wa_message_statuses.last_status`                                                     | `sent`, `delivered`, `read`, `failed`                 |
| `cost_daily.meta_cost_source`                                                         | `estimated` (default), `actual`                       |
| `erasure_archive.scope`                                                               | `customer`, `account` (enforced by check constraint)  |
| `reminder_jobs.skipped_reason`, `reminder_jobs.last_error`, `event_outbox.last_error` | free text, not a closed set                           |

## Foreign keys and delete behaviour

Cascade direction is what makes account deletion and customer erasure single-statement operations. `SET NULL` is what lets a billing fact outlive the personal data it was derived from.

| Foreign key                                              | On delete |
| -------------------------------------------------------- | --------- |
| `accounts.id` → `auth.users.id`                          | cascade   |
| `account_id` on 21 tables → `accounts.id`                | cascade   |
| `conversations.customer_id` → `customers.id`             | cascade   |
| `appointments.customer_id` → `customers.id`              | cascade   |
| `messages.conversation_id` → `conversations.id`          | cascade   |
| `reminder_jobs.appointment_id` → `appointments.id`       | cascade   |
| `event_outbox.event_id` → `events.id`                    | cascade   |
| `messages.reply_to_message_id` → `messages.id`           | set null  |
| `reminder_jobs.message_id` → `messages.id`               | set null  |
| `reminder_jobs.response_message_id` → `messages.id`      | set null  |
| `reminder_deliveries.appointment_id` → `appointments.id` | set null  |
| `conversation_days.customer_id` → `customers.id`         | set null  |
| `conversation_days.conversation_id` → `conversations.id` | set null  |

Five references are deliberately not foreign keys, because a dangling value is the correct outcome once retention or erasure removes the target: `messages.source_event_id`, `messages.template_id`, `conversations.handoff_offer_message_id`, `conversation_days.first_message_id`, and `erasure_archive.account_id`.

## What survives erasure, deletion and purge

Three operations remove data, and they remove different things. Customer erasure runs `eraseCustomer` in `lib/customers/erase.ts`; account deletion deletes the Supabase auth user and lets the cascade run; the retention purge is the `purge-expired-messages` cron. See [privacy and GDPR](./privacy-and-gdpr.md) for the surrounding obligations.

| Table                  | Customer erasure                                                            | Account deletion                             | Retention purge                                                                              |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `accounts`             | kept                                                                        | deleted                                      | kept                                                                                         |
| `whatsapp_connections` | kept                                                                        | deleted                                      | kept                                                                                         |
| `whatsapp_contacts`    | the customer's contacts deleted                                             | deleted                                      | kept                                                                                         |
| `customers`            | deleted                                                                     | deleted                                      | kept                                                                                         |
| `services`             | kept                                                                        | deleted                                      | kept                                                                                         |
| `conversations`        | deleted by cascade                                                          | deleted                                      | kept                                                                                         |
| `messages`             | deleted by cascade                                                          | deleted                                      | deleted past the window, except a message tied to an active appointment's reminder           |
| `appointments`         | active ones cancelled, then all deleted by cascade                          | deleted                                      | kept                                                                                         |
| `availability_rules`   | kept                                                                        | deleted                                      | kept                                                                                         |
| `blocked_periods`      | kept                                                                        | deleted                                      | kept                                                                                         |
| `message_templates`    | kept                                                                        | deleted                                      | kept                                                                                         |
| `reminder_jobs`        | deleted by cascade from `appointments`                                      | deleted                                      | kept                                                                                         |
| `reminder_deliveries`  | kept; `external_id` rewritten to `erased:<row id>`, `appointment_id` nulled | deleted                                      | kept                                                                                         |
| `push_subscriptions`   | kept                                                                        | deleted                                      | kept                                                                                         |
| `pwa_mutations`        | kept                                                                        | deleted                                      | kept                                                                                         |
| `events`               | kept                                                                        | deleted                                      | deleted past the window, except `billing.*` rows and any row whose outbox row is unpublished |
| `event_outbox`         | kept                                                                        | deleted                                      | deleted with its event                                                                       |
| `cost_daily`           | kept                                                                        | deleted                                      | kept                                                                                         |
| `wa_message_statuses`  | kept                                                                        | deleted                                      | kept                                                                                         |
| `conversation_days`    | kept; `customer_id`, `conversation_id` and `first_message_id` nulled        | deleted                                      | kept                                                                                         |
| `billing_orders`       | kept                                                                        | deleted                                      | kept                                                                                         |
| `audit_log`            | kept, plus one `erasure` row                                                | deleted                                      | deleted past 730 days, globally                                                              |
| `erasure_archive`      | kept, plus one `customer`-scope row                                         | **kept** — no FK, so it outlives the account | kept                                                                                         |

The two carve-outs in the `events` purge exist for different reasons: an unpublished outbox row is still owed to a consumer, and `billing.*` rows are themselves the once-per-month dedupe key for limit warnings.

## Migrations

Migrations are plain SQL in `drizzle/migrations/`, generated by `pnpm db:generate` and applied by `drizzle-kit migrate`. RLS blocks and grants are hand-appended, because drizzle-kit emits neither. `drizzle/migrations/meta/_journal.json` is the ordered record of what exists.

| Command                   | Target                                                |
| ------------------------- | ----------------------------------------------------- |
| `pnpm db:migrate`         | the local development database                        |
| `pnpm db:migrate:preview` | preview, via `.env.vercel.preview`                    |
| `pnpm db:migrate:prod`    | production, via `.env.vercel.production`              |
| `pnpm check:migrations`   | asserts the target database is not behind the journal |

`vercel.json` sets `buildCommand` to `pnpm check:migrations && pnpm build`, so a merge whose migration was never applied fails the deploy instead of crashing at runtime. Direction matters: a database ahead of the code passes, because the documented order is migrate first and merge second. `scripts/check-migrations.ts` runs the same environment-integrity assertion the app boots with before it checks anything, so a misconfigured deploy fails for the real reason. See [environments](../environments.md) for the promotion order.

Migrations `0002` through `0030` speak the old vocabulary — `pts`, `patients`, `pt_id`, `practice_name`. `0031_rename_pts_to_accounts.sql` renames the tables and columns to `accounts`, `customers`, `account_id` and `name`; nothing is added, dropped or retyped, and every policy qual, index predicate and FK target follows automatically because Postgres stores them as parse trees. The policy names read `pts_tenant_isolation` and `patients_tenant_isolation`.

## Connection pools

Two postgres-js pools connect to the same `DATABASE_URL` as the table owner, and both bypass RLS.

| Pool       | File                      | Configuration                                                                                               |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Query pool | `lib/db/index.ts`         | drizzle over postgres-js; `prepare: false`, `idle_timeout: 20`, `max_lifetime: 1800`, `connect_timeout: 10` |
| Lock pool  | `lib/db/advisory-lock.ts` | `max: 10`, otherwise the same settings                                                                      |

The timeouts exist because Supabase's pooler silently drops idle TCP sockets, and postgres-js would keep a dead socket pooled and hang on it with no timeout. The advisory-lock pool is separate because each lock reserves a whole connection for its transaction's lifetime and locks nest; see [events and background jobs](./events-and-background-jobs.md) for the key namespaces. Both modules cache their client on `globalThis` outside production, so a dev recompile does not leak a pool per HMR cycle.

`getPostgresErrorCode` in `lib/db/postgres-errors.ts` walks up to six `cause` links to find a `SQLSTATE`, which is how `23505` (unique violation) and `23P01` (exclusion violation) become a `conflict` result rather than a crash.

## Token encryption at rest

Meta access tokens are the only encrypted column. `lib/db/crypto.ts` wraps pgcrypto's `pgp_sym_encrypt` and `pgp_sym_decrypt` with `TOKEN_ENCRYPTION_KEY`, storing ciphertext in `whatsapp_connections.access_token_encrypted` as `bytea`. Decryption happens only inside the channel client. For the rotation procedure, see [key rotation](../gdpr/key-rotation.md); for how a connection is created and revoked, see [WhatsApp connection](./whatsapp-connection.md).
