# Onboarding baseline (old checklist flow)

The guided onboarding flow (MED-114) replaces the old five-item checklist. This is the baseline to compare it against, measured from the data the old flow left behind. Funnel events for the new flow are in [accounts-auth-onboarding.md](../features/accounts-auth-onboarding.md#guided-flow) ("Funnel events").

## Method

`scripts/onboarding-funnel.ts` (mode `baseline`) reads the cohort `accounts.onboarding_flow = 'legacy'` with `created_at < --before`. Pass the production release instant as `--before`, so accounts created after the new flow shipped are never mixed in. Everything runs in one `read only` transaction and prints aggregates only: no names, emails or ids. Internal accounts are excluded in SQL: `ADMIN_EMAILS`, `seed@medium.local` and `qa@medium.local`.

"Done" per item is exactly `getOnboardingState` (`lib/onboarding/state.ts`), evaluated now:

| Item | Done when |
|---|---|
| profile | `accounts.name` is not blank |
| whatsapp | an `active` `whatsapp_connections` row exists |
| availability | at least one `availability_rules` row exists |
| services | an active service exists and `services_configured_at` is set |
| testMessage | any `messages` row exists |
| plan (soft) | plan is not `free`, or `plan_step_seen_at` is set. Informational, not part of `complete` |
| complete | the five items above, all done |

Per item the output has: cohort size, done now, ever, how many have a timestamp, p25/p50/p75/p90 hours from `created_at`, and done within 1 hour, 24 hours and 7 days. It also has a per signup ISO week breakdown (accounts and done count per item).

## Timestamps and gaps

| Item | Earliest timestamp available | Gap |
|---|---|---|
| profile | none (no `updated_at`; the signup trigger leaves `name` null) | Count only. Time to complete cannot be reconstructed. |
| whatsapp | `min(whatsapp_connections.connected_at)` over all the account's rows (first-ever connect) | An account that disconnected is not done today, so "ever" (any `connected_at`) is reported next to "done". Deleted rows lose their time. |
| availability | none (rules are replaced wholesale, no timestamp columns) | Count only. |
| services | `services_configured_at` | Overwritten on every confirm, so it is the latest confirm: an upper bound on the first completion. |
| testMessage | `least(min(messages.created_at), min(conversation_days.created_at))` | `messages` is purged after `retention_days` (default 90), so "done" reads false for older accounts. "Ever" is messages OR `conversation_days` (survives the purge and erasure). An outbound-only test message that made no `conversation_day` is lost after the purge. |
| plan | `plan_step_seen_at` | Soft item. A paid plan has no timestamp here. |
| complete | none: profile and availability have no time | The count, plus a lower bound: the latest known item timestamp (whatsapp, services, testMessage). The real completion is at or after it. |
| shown / drop-off per item | none | The old flow stored no views. The `onboarding_skipped` dismissal is a cookie and is not stored. |

Statement for the ticket: time to complete for profile, availability and full completion cannot be reconstructed; the baseline for those is the count, and remaining legacy accounts can be re-measured from release day by re-running the script.

`messages` keeps purging, so run the production baseline before the new flow ships: later runs lose testMessage data.

## Commands

Preview and production need their env pulled first. `--before` is the production release time (ISO, UTC); `--json` is optional.

```
pnpm onboarding:baseline                                    # development (local)
pnpm env:pull:preview && pnpm onboarding:baseline:preview --before <release ISO time>
pnpm env:pull:prod && pnpm onboarding:baseline:prod --before <release ISO time> --json
```

For example `--before 2026-11-01T09:00:00Z`. The other options are `--since <ISO>` (accounts created at or after) and `--json`. The script refuses to run when `DATABASE_URL`/`SUPABASE_URL` do not match the environment (`assertEnvironmentIntegrity`).

## Results

### Development (local seed, not meaningful)

The local database holds only seed and QA accounts, which are excluded, so the cohort is empty. Output of `pnpm onboarding:baseline` on 2026-10-24:

```
onboarding baseline: development (local), generated 2026-10-24T00:25:11.542Z

legacy accounts: 0 (created before 2026-10-24T00:25:11.528Z)

item          cohort  done  ever  with_ts  p25h  p50h  p75h  p90h  <=1h  <=24h  <=7d
------------  ------  ----  ----  -------  ----  ----  ----  ----  ----  -----  ----
profile            0     0     0        0     -     -     -     -     0      0     0
whatsapp           0     0     0        0     -     -     -     -     0      0     0
availability       0     0     0        0     -     -     -     -     0      0     0
services           0     0     0        0     -     -     -     -     0      0     0
testMessage        0     0     0        0     -     -     -     -     0      0     0
plan               0     0     0        0     -     -     -     -     0      0     0
complete           0     0     0        0     -     -     -     -     0      0     0

timestamps and gaps:
  profile: none | gap: no timestamp: only the count; time to complete cannot be reconstructed
  whatsapp: first connected_at over all the account rows | gap: disconnected accounts are not done today (see ever); deleted rows lose their time
  availability: none | gap: no timestamp: only the count; rules are replaced wholesale
  services: services_configured_at (the LATEST confirm, an upper bound) | gap: overwritten on every confirm, so later than the first completion
  testMessage: least(first message, first conversation_day) | gap: messages are purged after retention_days; ever = messages or conversation_days; outbound-only tests that made no conversation_day are lost after the purge
  plan: plan_step_seen_at | gap: soft, informational: not part of complete; a paid plan has no timestamp here
  complete: lower bound: the latest known item timestamp | gap: profile and availability have no time, so the real completion time is at or after this

by signup week (done now):
signup_week  accounts  profile  whatsapp  availability  services  testMessage  complete
-----------  --------  -------  --------  ------------  --------  -----------  --------
```

### Preview

PENDING — KD runs `pnpm env:pull:preview && pnpm onboarding:baseline:preview --before <release ISO time>`

### Production

PENDING — KD runs `pnpm env:pull:prod && pnpm onboarding:baseline:prod --before <release ISO time> --json`
