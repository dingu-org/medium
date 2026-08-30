# Events and background jobs

Every side effect in Medium starts as a row in `events` and `event_outbox`, written in the same transaction as the change it describes. A minute cron publishes those rows to Inngest, where 17 functions — 8 event-triggered and 9 cron-triggered — do the asynchronous work. This page is the catalogue: what each event is, who emits it, who consumes it, and how each function is configured. For what an event means to the product, follow the feature links under the catalogue.

## Writing an event

An event is appended inside the caller's transaction, so a change and its event either both commit or neither does. `appendStoredEvent` in `lib/events/store.ts` inserts one `events` row and one `event_outbox` row that references it.

Two typed wrappers call it, and both validate the payload with zod before writing:

| Wrapper                  | File                         | Covers                       |
| ------------------------ | ---------------------------- | ---------------------------- |
| `appendAppointmentEvent` | `lib/events/appointments.ts` | the 6 `appointment.*` events |
| `appendBackgroundEvent`  | `lib/events/background.ts`   | the 26 background events     |

The zod schema is the payload contract. Every schema requires `accountId` and declares an optional `traceId`; `z.object().parse()` strips undeclared keys, so a field that is not in the schema never reaches a consumer. `lib/inngest/events.ts` derives the Inngest event map from the same two schema records, so the job runner's types and the database's payloads cannot drift apart.

Some events never take this path. They are sent straight to Inngest with `step.sendEvent`, or handed straight to the push dispatcher, and so have no `events` row. The catalogue below marks each one.

## Publishing an event to Inngest

Publication is separate from writing, so an unreachable Inngest never rolls back a booking. `lib/events/outbox.ts` owns both paths.

After the transaction commits, the emitter calls `tryPublishOutboxEvent(eventId)`, a best-effort attempt that swallows any transport error and logs `outbox.immediate_publish_unavailable`. Independently, the `publish-event-outbox` cron calls `publishDueOutboxEvents(50)` every minute, which is what actually guarantees delivery.

A publish run claims rows with `FOR UPDATE SKIP LOCKED`, ordered by `available_at, created_at`, taking only rows where `published_at IS NULL`, `available_at <= now()`, and the 5-minute lease on `locked_at` has expired. Claiming increments `attempts`.

The publisher is the trust boundary between the table and the job runner, because consumers treat the event name and payload as trusted input. `rejectionReason` refuses a row whose `event_type` is not one of the known schema keys (`unknown_event_type`), whose payload is not a JSON object (`payload_not_object`), or whose `payload.accountId` differs from the row's own `account_id` (`payload_account_id_mismatch`).

Each claimed row ends in exactly one of four outcomes, which the run returns as separate counts so a healthy run that dropped a forged row does not look like an outage:

| Outcome       | What happens to the row                                                                           | Log event                      |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| `published`   | `published_at` stamped, `locked_at` cleared, `last_error` cleared                                 | —                              |
| `rejected`    | stamped published with `last_error = rejected: <reason>` so it drains instead of retrying forever | `outbox.publish_rejected`      |
| `failed`      | `available_at` pushed out by `min(60, 2^(attempts - 1))` minutes                                  | `outbox.publish_failed`        |
| `dead_letter` | at `MAX_PUBLISH_ATTEMPTS` (25) the row is stamped published with a `dead_letter:` error prefix    | `outbox.publish_dead_lettered` |

The capped backoff means 25 attempts span roughly a day, so a long Inngest outage still drains once it ends.

The Inngest event is sent with `id` set to the `events` row id. That id is also what most functions use as their idempotency key, so a republished row cannot run a function twice.

## Event catalogue

The table lists every event name in the two schema records. The stored column says whether the event gets a row in the `events` table; only stored events can reach the notification bell, which filters `events` by `NOTIFICATION_TYPES`. The consumers column lists Inngest function ids, plus `bell` and `push` where the owner sees the event.

| Event                         | Emitted by                                                                                       | Stored | Consumers                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| `appointment.booked`          | `lib/appointments/book.ts`                                                                       | yes    | `handle-appointment-event`, `send-reminder`, bell                           |
| `appointment.confirmed`       | `lib/appointments/state.ts`                                                                      | yes    | bell                                                                        |
| `appointment.cancelled`       | `lib/appointments/state.ts`, `lib/customers/erase.ts`                                            | yes    | `handle-appointment-event`, cancels `send-reminder`, bell                   |
| `appointment.rescheduled`     | `lib/appointments/reschedule.ts`                                                                 | yes    | `handle-appointment-event`, `send-reminder` (triggers and cancels), bell    |
| `appointment.completed`       | `lib/appointments/state.ts`                                                                      | yes    | none                                                                        |
| `appointment.no_show`         | `lib/appointments/state.ts`                                                                      | yes    | none                                                                        |
| `message.received`            | `app/api/webhooks/whatsapp/route.ts`                                                             | yes    | `handle-inbound-message`                                                    |
| `wa.connection.created`       | `app/api/auth/meta-embedded/route.ts`                                                            | yes    | `bootstrap-wa-connection`, `sync-whatsapp-coexistence`                      |
| `wa.connection.revoked`       | `lib/channels/whatsapp/client.ts` (`markRevoked`)                                                | yes    | `dispatch-push-notification`, bell                                          |
| `wa.connection.expiring`      | `lib/inngest/functions/poll-whatsapp-health.ts`                                                  | yes    | none                                                                        |
| `wa.quality_warning`          | `lib/inngest/functions/poll-whatsapp-health.ts`                                                  | yes    | none                                                                        |
| `wa.template.approved`        | `lib/inngest/functions/bootstrap-wa-connection.ts`                                               | no     | none                                                                        |
| `wa.template.rejected`        | `lib/inngest/functions/bootstrap-wa-connection.ts`                                               | no     | none                                                                        |
| `wa.template.timed_out`       | `lib/inngest/functions/bootstrap-wa-connection.ts`                                               | no     | none                                                                        |
| `conversation.escalated`      | `lib/conversation/escalation.ts`                                                                 | yes    | `dispatch-push-notification`, `offer-resume-after-account-inactivity`, bell |
| `conversation.failed`         | `lib/inngest/functions/handle-inbound-message.ts`, `lib/inngest/functions/appointment-events.ts` | yes    | bell                                                                        |
| `conversation.taken_over`     | `app/(dashboard)/chat/actions.ts`, `app/api/pwa/mutations/message/route.ts`                      | yes    | `offer-resume-after-account-inactivity`                                     |
| `conversation.resume_offered` | `lib/inngest/functions/offer-resume.ts`                                                          | no     | `dispatch-push-notification`                                                |
| `conversation.ai_paused`      | `app/api/webhooks/whatsapp/route.ts`                                                             | yes    | `resume-business-app-ai`                                                    |
| `conversation.needs_reply`    | `lib/inngest/functions/handle-inbound-message.ts`, `lib/billing/cap-handoff.ts`                  | no     | push (dispatched directly, never published)                                 |
| `notification.requested`      | `lib/inngest/functions/appointment-events.ts`                                                    | no     | `dispatch-push-notification`                                                |
| `reminder.failed`             | `lib/inngest/functions/send-reminder.ts`, `app/api/webhooks/whatsapp/route.ts`                   | yes    | `dispatch-push-notification`, bell                                          |
| `reminder.skipped`            | `lib/inngest/functions/send-reminder.ts`                                                         | no     | none                                                                        |
| `billing.limit_warning`       | `lib/billing/usage.ts`                                                                           | yes    | `dispatch-push-notification`, bell                                          |
| `billing.limit_reached`       | `lib/billing/usage.ts`                                                                           | yes    | `dispatch-push-notification`, bell                                          |
| `billing.payment_received`    | `lib/billing/payments.ts`                                                                        | yes    | bell                                                                        |
| `billing.renewal_due`         | `lib/inngest/functions/billing-renewal-monitor.ts`                                               | yes    | `dispatch-push-notification`, bell                                          |
| `billing.grace_started`       | `lib/inngest/functions/billing-renewal-monitor.ts`                                               | yes    | `dispatch-push-notification`, bell                                          |
| `billing.downgraded`          | `lib/inngest/functions/billing-renewal-monitor.ts`                                               | yes    | `dispatch-push-notification`, bell                                          |
| `pwa.installed`               | `app/(dashboard)/pwa-install-actions.ts`                                                         | yes    | none                                                                        |
| `push.subscribed`             | `app/(dashboard)/settings/push-actions.ts`                                                       | yes    | none                                                                        |
| `push.dispatched`             | `lib/notifications/push-dispatch.ts`                                                             | yes    | none                                                                        |

For what each family means, see [WhatsApp connection](./whatsapp-connection.md) for `wa.*`, [assistant and conversation engine](./assistant-conversation-engine.md) for `message.received` and `conversation.*`, [appointments and availability](./appointments-availability.md) for `appointment.*`, [reminders](./reminders.md) for `reminder.*`, [billing and plans](./billing-and-plans.md) for `billing.*`, and [notifications](./notifications.md) for how the bell and push columns are produced.

## Events with no consumer

Eleven event names have no Inngest subscriber and no bell or push destination. Three of them are metrics by design: `pwa.installed`, `push.subscribed` and `push.dispatched` have their outbox rows drain into a no-op, and their `events` rows feed the admin funnel and push-delivery aggregates described in [observability and admin](./observability-and-admin.md).

For the other eight, nothing reads the event itself:

| Event                                               | Stored | Where the information lives instead                                  |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `wa.connection.expiring`                            | yes    | nowhere the owner sees — the token expiry is not surfaced in the app |
| `wa.quality_warning`                                | yes    | nowhere the owner sees — the quality drop is not surfaced in the app |
| `appointment.completed`                             | yes    | the appointment's own `status` on **Calendar**                       |
| `appointment.no_show`                               | yes    | the appointment's own `status` on **Calendar**                       |
| `wa.template.approved` / `.rejected` / `.timed_out` | no     | `message_templates.status` and the Inngest run history               |
| `reminder.skipped`                                  | no     | `reminder_jobs.skipped_reason` and the reminder badge                |

## Inngest functions

All 17 functions are registered in `lib/inngest/functions.ts` and served from `app/api/inngest/route.ts`, which pins `maxDuration = 60` because every step body runs inside one request to that route. The Inngest app id is `medium` (`lib/inngest/client.ts`).

| Function id                             | Trigger                                                                                                                                                                                                                                               | File                                                    | Side effects                                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrap-wa-connection`               | `wa.connection.created`                                                                                                                                                                                                                               | `lib/inngest/functions/bootstrap-wa-connection.ts`      | submits the reminder template to Meta, polls status hourly up to 72 times, falls back to a second template on rejection; emits `wa.template.approved`, `.rejected`, `.timed_out` |
| `sync-whatsapp-coexistence`             | `wa.connection.created`                                                                                                                                                                                                                               | `lib/inngest/functions/sync-whatsapp-coexistence.ts`    | on coexistence connections only, requests contact and history sync from Meta and moves `coexistence_sync_status` to `syncing` or `failed`                                        |
| `handle-inbound-message`                | `message.received`                                                                                                                                                                                                                                    | `lib/inngest/functions/handle-inbound-message.ts`       | chooses and sends the single reply to an inbound message; may emit `conversation.failed` and push `conversation.needs_reply`                                                     |
| `handle-appointment-event`              | `appointment.booked`, `appointment.cancelled`, `appointment.rescheduled`                                                                                                                                                                              | `lib/inngest/functions/appointment-events.ts`           | cancels the reminder row on cancellation, emits `notification.requested`, sends and persists the deterministic customer confirmation                                             |
| `send-reminder`                         | `appointment.booked`, `appointment.rescheduled`                                                                                                                                                                                                       | `lib/inngest/functions/send-reminder.ts`                | writes the `reminder_jobs` row, sleeps until due, sends the template with up to 3 attempts; emits `reminder.skipped`, `reminder.failed`, `billing.limit_reached`                 |
| `offer-resume-after-account-inactivity` | `conversation.taken_over`, `conversation.escalated`                                                                                                                                                                                                   | `lib/inngest/functions/offer-resume.ts`                 | sleeps 1 h, re-arms up to 12 times while the owner is active, then emits `conversation.resume_offered`                                                                           |
| `resume-business-app-ai`                | `conversation.ai_paused`                                                                                                                                                                                                                              | `lib/inngest/functions/resume-business-app-ai.ts`       | sleeps until `pausedUntil`, then clears the echo pause if it is still the current one                                                                                            |
| `dispatch-push-notification`            | `notification.requested`, `conversation.escalated`, `conversation.resume_offered`, `wa.connection.revoked`, `reminder.failed`, `billing.limit_warning`, `billing.limit_reached`, `billing.renewal_due`, `billing.grace_started`, `billing.downgraded` | `lib/inngest/functions/dispatch-push.ts`                | sends Web Push to the account's subscriptions, prunes dead endpoints, appends `push.dispatched`                                                                                  |
| `publish-event-outbox`                  | cron `* * * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/publish-event-outbox.ts`         | drains up to 50 due outbox rows per run                                                                                                                                          |
| `daily-cost-rollup`                     | cron `0 2 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/daily-cost-rollup.ts`            | upserts `cost_daily` per account-day over a 3-day lookback                                                                                                                       |
| `purge-expired-messages`                | cron `0 3 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/purge-expired-messages.ts`       | deletes expired `messages` and `events` per account at the effective retention window, and `audit_log` rows past 730 days                                                        |
| `poll-whatsapp-quality-rating`          | cron `0 4 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/poll-whatsapp-health.ts`         | stores quality rating and messaging tier per active connection; emits `wa.quality_warning` on a transition into `YELLOW` or `RED`                                                |
| `monitor-wa-token-expiry`               | cron `0 5 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/poll-whatsapp-health.ts`         | claims a one-shot `expiry_warning_sent_at` stamp per connection expiring within 7 days; emits `wa.connection.expiring`                                                           |
| `reconcile-albanian-reminder-templates` | cron `30 5 * * *`                                                                                                                                                                                                                                     | `lib/inngest/functions/reconcile-reminder-templates.ts` | repairs rejected reminder templates on every active connection                                                                                                                   |
| `billing-usage-monitor`                 | cron `0 6 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/billing-usage-monitor.ts`        | re-emits `billing.limit_warning` and `billing.limit_reached` for crossed thresholds, including the predictive reminder warning                                                   |
| `billing-renewal-monitor`               | cron `0 7 * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/billing-renewal-monitor.ts`      | emits `billing.renewal_due` and `billing.grace_started`, and runs the downgrade transaction that emits `billing.downgraded`                                                      |
| `reconcile-pok-orders`                  | cron `0 * * * *`                                                                                                                                                                                                                                      | `lib/inngest/functions/reconcile-pok-orders.ts`         | re-polls open POK orders in one step; a settle emits `billing.payment_received`                                                                                                  |

## Inngest run controls

Retries, idempotency, concurrency, cancellation and failure handlers are declared in each `createFunction` config. A blank cell means the option is not set.

| Function id                             | Retries | Idempotency            | Concurrency                       | Cancels on                                                                  | `onFailure`                 |
| --------------------------------------- | ------- | ---------------------- | --------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| `bootstrap-wa-connection`               | 2       | `event.id`             |                                   |                                                                             |                             |
| `sync-whatsapp-coexistence`             | 3       | `event.id`             |                                   |                                                                             |                             |
| `handle-inbound-message`                | 2       | `event.data.messageId` | 1 per `event.data.conversationId` |                                                                             | `recoverFailedInbound`      |
| `handle-appointment-event`              | 2       | `event.id`             |                                   |                                                                             | `recordConfirmationFailure` |
| `send-reminder`                         | 2       | `event.id`             |                                   | `appointment.cancelled`, `appointment.rescheduled` matching `appointmentId` | `recordReminderFailure`     |
| `offer-resume-after-account-inactivity` | 2       | `event.id`             |                                   |                                                                             |                             |
| `resume-business-app-ai`                | 2       | `event.id`             | 1 per `event.data.conversationId` |                                                                             |                             |
| `dispatch-push-notification`            | 2       | `event.id`             |                                   |                                                                             |                             |
| `publish-event-outbox`                  | 2       |                        | 1                                 |                                                                             |                             |
| `daily-cost-rollup`                     | 2       |                        | 1                                 |                                                                             |                             |
| `purge-expired-messages`                | 2       |                        | 1                                 |                                                                             |                             |
| `poll-whatsapp-quality-rating`          | 2       |                        | 1                                 |                                                                             |                             |
| `monitor-wa-token-expiry`               | 2       |                        | 1                                 |                                                                             |                             |
| `reconcile-albanian-reminder-templates` | 2       |                        | 1                                 |                                                                             |                             |
| `billing-usage-monitor`                 | 2       |                        | 1                                 |                                                                             |                             |
| `billing-renewal-monitor`               | 2       |                        | 1                                 |                                                                             |                             |
| `reconcile-pok-orders`                  | 2       |                        | 1                                 |                                                                             |                             |

Concurrency bounds parallelism only. Inngest does not promise that queued runs execute in arrival order, so anything order-sensitive settles the order from the rows themselves — `optStateSuperseded` in `lib/reminders/response-handler.ts` is the worked example.

## Cron schedule

All crons are UTC. The daily jobs are spread across the early morning so they never contend for the same connection pool.

| Cron         | Function id                             |
| ------------ | --------------------------------------- |
| `* * * * *`  | `publish-event-outbox`                  |
| `0 * * * *`  | `reconcile-pok-orders`                  |
| `0 2 * * *`  | `daily-cost-rollup`                     |
| `0 3 * * *`  | `purge-expired-messages`                |
| `0 4 * * *`  | `poll-whatsapp-quality-rating`          |
| `0 5 * * *`  | `monitor-wa-token-expiry`               |
| `30 5 * * *` | `reconcile-albanian-reminder-templates` |
| `0 6 * * *`  | `billing-usage-monitor`                 |
| `0 7 * * *`  | `billing-renewal-monitor`               |

## Trace propagation

Every event schema declares an optional `traceId`, which is what ties a webhook request to the job it starts and the outbound send that job makes. The field is optional so events written before it existed still validate, and it is declared explicitly because an undeclared key would be stripped by `parse()`.

The WhatsApp and POK webhook routes take the trace from the `x-request-id` request header, falling back to `newTraceId()` in `lib/log.ts`. Cron-emitted events mint their own with `newTraceId()`. In `handle-inbound-message` the run id stands in when the event carries no trace, so every log line from that run still shares one `trace_id`. See [observability and admin](./observability-and-admin.md) for the log envelope.

## Advisory locks

`withAdvisoryLock(key, fn)` in `lib/db/advisory-lock.ts` takes a `pg_advisory_xact_lock` on a hash of the key, on a second postgres-js pool of 10 connections reserved for locking. Locks are reentrant per transaction: a nested call with the same or a different key piggybacks on the enclosing transaction instead of reserving a second connection, which is what keeps an AI turn holding `ai-turn:<id>` from deadlocking on the `appointments:<accountId>` its tool calls take.

Waiters are bounded by `LOCK_TIMEOUT_MS` (30 s), set as `SET LOCAL lock_timeout` on the lock transaction, because Postgres otherwise waits on an advisory lock forever. A caller that must fail faster passes `options.timeoutMs`; a reentrant call inherits the enclosing bound.

| Key                                    | Taken by                                       | Serialises                                            |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `ai-turn:<messageId>`                  | `lib/conversation/engine.ts`                   | one AI turn per inbound message                       |
| `reminder-response:<messageId>`        | `lib/reminders/response-handler.ts`            | one deterministic reminder answer per inbound message |
| `appointments:<accountId>`             | `lib/appointments/lock.ts`                     | booking, rescheduling and transitions for one account |
| `usage:conv:<accountId>`               | `lib/billing/usage.ts`                         | the conversation-day insert and cap check             |
| `usage:services:<accountId>`           | `app/(dashboard)/settings/services/actions.ts` | the active-services plan cap                          |
| `manual-customer:<accountId>:<digits>` | `lib/clients/mutations.ts`                     | duplicate-phone check on manual customer creation     |
| `reminder:<conversationId>`            | `app/(dashboard)/chat/actions.ts`              | the manual "send reminder" action per thread          |
| `reminder-quota:<accountId>`           | `app/(dashboard)/chat/actions.ts`              | the reminder quota check behind a manual send         |

## Inngest environments

Each app environment has its own Inngest environment, keyed by `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`. Both are marked `mustDiffer` in `lib/env/env-vars.ts`, because sharing a key merges preview and production runs into one event stream. See [environments](../environments.md) for how the keys are set per deployment and [runbook](../runbook.md) for what to do when the outbox stops draining.
