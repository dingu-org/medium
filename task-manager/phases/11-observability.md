# Phase 11 — Observability

**Goal.** Runtime failures are visible in structured platform logs, logs are filterable by `pt_id`, internal funnel metrics are available without a third-party analytics tool, and a cost dashboard shows yesterday's AI + Meta spend.

**Source.** Tech doc §2 (observability rows), §8 (cost math).

**Effort.** 2–3 days dedicated, but ramp up incrementally as features ship.

**Prerequisites.** Phase 0 complete.

---

## Tasks

### Runtime logs

- [ ] Server-side instrumentation covering: webhook handler, Inngest functions, Server Actions, OpenRouter calls, and Graph API calls.
- [ ] Error boundaries on each top-level route log enough context for debugging.
- [ ] PII scrubbing rules: redact `phone`, `name`, `body` from structured log payloads.
- [ ] Define a launch-period log review checklist for:
  - error spikes
  - webhook latency problems
  - OpenRouter / upstream provider failures

### Structured logs

- [ ] Pick: Vercel logs + Supabase logs as the MVP baseline; add Axiom only if filtering becomes too painful.
- [ ] Logger wrapper in `lib/log.ts`; emits JSON.
- [ ] Standard log shape: `{ timestamp, level, trace_id, pt_id?, conversation_id?, event_name, message, ...attrs }`.
- [ ] Inject `pt_id` automatically inside `lib/tenancy/` helpers.
- [ ] PII redaction at the logger level (phone, name, message body).
- [ ] Trace IDs generated at the request edge (webhook, Server Action) and propagated through Inngest steps.

### Internal metrics

- [ ] Derive funnel metrics from internal events / database rows rather than PostHog.
- [ ] Events to capture internally:
  - `pt_signed_up`
  - `whatsapp_connected`
  - `template_approved`
  - `first_test_message_sent`
  - `first_real_message_received`
  - `appointment_booked` (props: pt_id, model_used, turns_to_book)
  - `appointment_confirmed`
  - `appointment_cancelled`
  - `conversation_escalated`
  - `pt_took_over_conversation`
  - `pwa_installed`
  - `push_subscribed`
- [ ] Funnel dashboard: signed_up → connected → first_message → first_booking.
- [ ] Cohort view: PTs who completed onboarding within 24 h.
- [ ] **Web Push delivery rate** (deferred here from Phase 9). The Phase 9 dispatcher already returns per-event `{ sent, removed }` counts as the Inngest step output (`lib/notifications/push-dispatch.ts`) and warns when a PT's subscriptions were all stale, but nothing persists them. Aggregate delivered-vs-attempted per PT (and stale-subscription churn) so silent Web Push failures are visible — Web Push drops silently and there's otherwise no signal.

### Cost dashboards

- [ ] Daily aggregation job (Inngest cron):
  - Sum persisted `messages.ai_cost_microusd` and `cached_tokens`; these fields are populated from OpenRouter usage accounting across every step in an AI turn.
  - Estimate Meta conversation cost from `conversations` (each new patient conversation in 24 h window = one paid conversation).
- [ ] Insert into a `cost_daily` rollup table.
- [ ] Simple admin-only dashboard (server-rendered): yesterday's spend, monthly burn.
- [ ] OpenRouter dashboard / Activity view validated against sampled requests so local spend reporting can be spot-checked.

### Booking funnel surfaces in app

- [ ] PT dashboard widget: "This week — 12 messages, 5 bookings, 1 escalation".
- [ ] This is the primary operator-facing funnel surface for MVP.

### Performance budgets

- [ ] Track first-contentful-paint, time-to-interactive, and calendar-render-time in internal logs or a lightweight rollup table.
- [ ] Document a manual threshold for launch review if calendar-render-time exceeds 2 s p95.

---

## Acceptance criteria

- [ ] A thrown error in a Server Action is visible in platform logs with trace ID and no PII.
- [ ] Filtering the chosen log sink by `pt_id` shows only that PT's logs.
- [ ] Internal metrics capture `pt_signed_up` and `appointment_booked` with correct properties.
- [ ] Funnel dashboard shows yesterday's signups → connections → bookings.
- [ ] Cost dashboard shows yesterday's AI + Meta spend per PT.
- [ ] Trace IDs propagate from webhook through Inngest to outbound send (verified by searching one trace_id across Axiom).

---

## Notes

- Don't go overboard on dashboards. Two are enough for MVP: funnel + cost. Build more once you can name a question they'd answer.
- OpenRouter usage accounting returns token counts, cached-token details, and total request cost. Phase 3 persists these on AI message rows; prefer those fields over hand-maintained price tables.
- If the AI SDK provider does not expose all cost fields cleanly, persist the generation ID and reconcile via OpenRouter's generation metadata API.
- The Meta cost model has changed multiple times; keep the calculator in `lib/billing/meta.ts` so it's easy to update.
- Trace IDs are easy to forget when an Inngest run handles a non-trace-tagged event. Add a default trace ID = run ID when none is provided.
