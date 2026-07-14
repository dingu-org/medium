# Phase 16 — Monetization

Subscriptions: Free + Solo (2,500 ALL/mo · 25,000 ALL/yr, VAT-inclusive), Dual/Multi "coming soon". All-at-once launch, built in chunks.

Source of truth (Notion):
- Product decisions: "Phase 16 — Monetization" — https://app.notion.com/p/39c0e1f4dd108035b7c5cc58ca9d4e66
- Technical architecture: "Phase 16 — Technical Architecture" — https://app.notion.com/p/39c0e1f4dd1081a7991ee97db98ac4dd
- Designer brief: "Phase 16 — Designer Brief" — https://app.notion.com/p/39c0e1f4dd1081998220c26cf4ff7a94
- Task list with full descriptions: Notion Tasks Tracker, tasks prefixed "Phase 16 ·"

Key invariants (do not violate — details in the architecture doc):
- No internal subscription state machine: plan + expiry on `pts`, prepaid via POK one-off payments; `TODO(pok-subscriptions)` seam in `lib/billing/payments.ts`.
- Conversation = active patient-day (PT timezone); metered via `conversation_days` fact table; reminders counted only on Meta delivery confirmation.
- Hard stop at 100% with one static handoff message; PT inbox/manual chat never blocked; capped reminders flag the appointment; nothing fails silently.
- All limits/prices/models in `lib/billing/plans.ts` config (env override escape hatch), never scattered.
- One model all plans: haiku-4.5 + gpt-5-mini fallback, low reasoning, ZDR + data_collection:deny preserved.
- Downgrade deletes nothing: services beyond limit deactivate (oldest active stays; PT can swap), retention clamps after 30-day grace.

## Chunks (dependency order)

- [x] C1 Entitlements foundation — plans.ts, entitlements.ts, migration 0020, per-plan model seam, plan threading; pilots → lifetime via SQL
- [x] C2 Conversation metering & gate — usage.ts, cap-handoff, gate step in handle-inbound-message, limit events + push/bell, chat cap banner (depends C1)
- [x] C3 Delivery truth & reminder gate — statuses webhook handler, migration 0021, reminder quota gate, billing-usage-monitor cron (predictive warn), failed-delivery flagging (depends C1; parallel with C2)
- [x] C4 Meta cost rollup — rate card by pricing category, actual-first rollup + admin live cost, €0.06 placeholder → fallback only (depends C3). ⚠ marketing/authentication rates ship as €0 `⚠ CONFIRM` placeholders (only utility €0.021 + service €0 confirmed) — pre-launch Meta-pricing task must fill them or set `META_RATE_CARD_OVERRIDES`.
- [x] C5 POK payments — pok client + payments boundary, migration 0022 billing_orders, webhook route + reconcile cron, smoke script (depends C1 + POK credentials [BLOCKED ON YOU]). ⚠ Staging spike auth-BLOCKED (delivered creds rejected) → `ALL_MINOR_FACTOR=100` UNCONFIRMED, `TODO(spike)` in payments.ts; no real charge until valid creds + `pnpm smoke:pok` confirm the factor.
- [ ] C6 Billing lifecycle & surfaces — renewal-monitor cron (renew/grace/downgrade), retention clamp, identity/services guards, /settings/billing UI, onboarding plan step, landing pricing section, i18n (depends C2+C5 + designs [BLOCKED ON YOU])
  - C6 copy decision: free-plan assistant display name — "Medium" (product doc) vs current prompt fallback "asistenti i rezervimeve".
- [ ] C7 Admin metrics — existing task "Phase 16 · Monetization success metrics in admin dashboard" (depends C5+C6)
- [ ] C8 Polish & QA — Albanian copy, /help, ToS integration, POK-staging E2E, visual QA (depends all)
  - Model cutover (pre-launch): remove `OPENROUTER_DEV_MODEL`/`OPENROUTER_PROD_MODEL` (and any `OPENROUTER_MODEL_OVERRIDE`) so plan config (haiku-4.5 + gpt-5-mini fallback, low reasoning) becomes live; verify via `scripts/smoke-ai.ts` and one real turn before launch.

## C1 pilot flip (run manually, do not automate)

Grant lifetime Solo to pilot PTs after 0020 is deployed — documented here, not
executed by any code path:

```sql
-- Replace with the actual pilot emails before running.
UPDATE pts SET plan_lifetime = true WHERE email IN ('<pilot-1>', '<pilot-2>');
```

## External blockers ([BLOCKED ON YOU] tasks in Notion)

- POK merchant onboarding (credentials) — gates C5
- Designer briefed, designs delivered — gates C6
- Accountant: VAT/fiscalization answers — gates first real charge, not development
- Pre-launch: Meta AI-provider policy re-check; ToS/privacy sign-off
