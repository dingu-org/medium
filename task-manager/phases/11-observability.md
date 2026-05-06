# Phase 11 — Observability

**Goal.** Errors land in Sentry with useful stacks, structured logs are filterable by `pt_id`, PostHog tracks the booking funnel + escalation rate, and a cost dashboard shows yesterday's AI + Meta spend.

**Source.** Tech doc §2 (observability rows), §8 (cost math).

**Effort.** 2–3 days dedicated, but ramp up incrementally as features ship.

**Prerequisites.** Phase 0 (Sentry installed).

---

## Tasks

### Sentry — refine

- [ ] Server-side instrumentation covering: webhook handler, Inngest functions, Server Actions, OpenRouter calls, Graph API calls.
- [ ] Client-side instrumentation: error boundaries on each top-level route.
- [ ] Source map upload verified — stack traces show original code, not minified.
- [ ] Release tagging per Vercel deploy (auto via Sentry CLI in CI).
- [ ] PII scrubbing rules: redact `phone`, `name`, `body` from event payloads before sending to Sentry.
- [ ] Alert rules:
  - Error rate > 1 % over 5 min → email.
  - Webhook handler 95th percentile > 2 s → email.
  - OpenRouter / upstream provider error rate > 5 % over 5 min → email.

### Structured logs

- [ ] Pick: Axiom (preferred — structured + easy filtering) or Supabase logs.
- [ ] Logger wrapper in `lib/log.ts`; emits JSON.
- [ ] Standard log shape: `{ timestamp, level, trace_id, pt_id?, conversation_id?, event_name, message, ...attrs }`.
- [ ] Inject `pt_id` automatically inside `lib/tenancy/` helpers.
- [ ] PII redaction at the logger level (phone, name, message body).
- [ ] Trace IDs generated at the request edge (webhook, Server Action) and propagated through Inngest steps.

### PostHog

- [ ] PostHog EU project set up; browser SDK in PWA.
- [ ] Server-side capture for events that don't originate in the browser (e.g., AI booking).
- [ ] Identify the user as the PT on signup; treat patients as anonymous events keyed to a hashed phone.
- [ ] Events to capture:
  - `pt_signed_up`
  - `whatsapp_connected`
  - `template_approved`
  - `first_test_message_sent`
  - `first_real_message_received`
  - `appointment_booked` (server-side; props: pt_id, model_used, turns_to_book)
  - `appointment_confirmed`
  - `appointment_cancelled`
  - `conversation_escalated`
  - `pt_took_over_conversation`
  - `pwa_installed`
  - `push_subscribed`
- [ ] Funnel dashboard: signed_up → connected → first_message → first_booking.
- [ ] Cohort: PTs who completed onboarding within 24 h.

### Cost dashboards

- [ ] Daily aggregation job (Inngest cron):
  - Use OpenRouter usage accounting or generation metadata as the source of truth for per-turn AI cost and cached-token usage.
  - Estimate Meta conversation cost from `conversations` (each new patient conversation in 24 h window = one paid conversation).
- [ ] Insert into a `cost_daily` rollup table.
- [ ] Simple admin-only dashboard (server-rendered): yesterday's spend, monthly burn.
- [ ] OpenRouter dashboard / Activity view validated against sampled requests so local spend reporting can be spot-checked.

### Booking funnel surfaces in app

- [ ] PT dashboard widget: "This week — 12 messages, 5 bookings, 1 escalation".
- [ ] Reduces dependence on PostHog for the PT's own view.

### Performance budgets

- [ ] Track first-contentful-paint, time-to-interactive, calendar-render-time in PostHog.
- [ ] Alert if calendar-render-time > 2 s p95.

---

## Acceptance criteria

- [ ] A thrown error in a Server Action lands in Sentry with a readable stack and no PII.
- [ ] Filtering Axiom by `pt_id` shows only that PT's logs.
- [ ] PostHog records `pt_signed_up` and `appointment_booked` with correct properties.
- [ ] Funnel dashboard shows yesterday's signups → connections → bookings.
- [ ] Cost dashboard shows yesterday's AI + Meta spend per PT.
- [ ] Sentry alert rule fires on a synthetic error spike.
- [ ] Trace IDs propagate from webhook through Inngest to outbound send (verified by searching one trace_id across Axiom).

---

## Notes

- Don't go overboard on dashboards. Two are enough for MVP: error rate and cost. Build more once you can name a question they'd answer.
- OpenRouter usage accounting returns token counts, cached-token details, and total request cost. Prefer that over hand-maintained price tables.
- If the AI SDK provider does not expose all cost fields cleanly, persist the generation ID and reconcile via OpenRouter's generation metadata API.
- The Meta cost model has changed multiple times; keep the calculator in `lib/billing/meta.ts` so it's easy to update.
- Trace IDs are easy to forget when an Inngest run handles a non-trace-tagged event. Add a default trace ID = run ID when none is provided.
