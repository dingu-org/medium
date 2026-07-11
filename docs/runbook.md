# Runbook

One-page reference for the most likely launch-week incidents. See
`docs/observability/launch-log-review.md` for the full log-review checklist
and `lib/log.ts` for the structured log line shape.

## Incidents

### 1. Token revoked / expired

- **Symptom**: the PT's dashboard shows a "Reconnect" CTA; outbound sends
  throw a `GraphApiError` with `isAuthError` true (401/403,
  `lib/channels/whatsapp/errors.ts`); a sustained run of
  `event_name=webhook.unknown_phone_number_id` (warn) for one
  `phone_number_id`.
- **Where to look**: filter `event_name=graph.api_error` with `status` 401 or
  403; check `whatsapp_connections.status` for that phone number.
- **Remedy**: the PT re-runs Embedded Signup (the "Reconnect" button in
  Settings). The connection flips from `revoked` back to `active`.

### 2. Template rejected

- **Symptom**: a reminder send throws `TemplateNotApprovedError`; the
  dashboard's WhatsApp status card shows a rejection reason
  (`connect-whatsapp.tsx`'s `errorStatus('rejected')`).
- **Where to look**: `message_templates.status = 'rejected'` and
  `lastStatusAt`.
- **Remedy**: resubmit a corrected `appointment_reminder_24h` template.
  Approval typically takes 24–48h, on the PT's clock.

### 3. Inngest function failing

- **Symptom**: retries/failures visible in the Inngest dashboard;
  `event_name=conversation.turn_failed` (error) or `outbox.publish_failed`; a
  gap between `inbound.processing` and `inbound.reply_sent` for the same
  `trace_id`.
- **Where to look**: Inngest dashboard run history, cross-referenced with
  matching `trace_id` log lines.
- **Remedy**: inspect the failing payload; once the cause is fixed, replay
  the run from the Inngest dashboard.

### 4. OpenRouter outage / rate-limit

- **Symptom**: `conversation.turn_failed` (error) together with
  `ai.tool_failed`; rising `durationMs` on `ai.turn_completed` before hard
  failures start.
- **Where to look**: `event_name=ai.turn_completed` for latency trends; the
  OpenRouter Activity dashboard (openrouter.ai/activity).
- **Remedy**: confirm the API key and account credit. Transient failures are
  covered by Inngest's own retries; a sustained outage should be
  communicated to the PT out-of-band.

### 5. Webhook signature failures

- **Symptom**: `event_name=webhook.bad_signature` (warn).
- **Where to look**: the rate of that event over time.
- **Remedy**: a low, steady rate is expected background noise (bots/probes).
  Only act if it spikes right after a `META_APP_SECRET` rotation — resync
  the secret in the Vercel environment.

### 6. Realtime subscription dropping

- **Symptom**: the PT's dashboard stops updating live (new messages,
  appointments).
- **Where to look**: Supabase Realtime logs/quotas; the browser console for
  reconnect errors.
- **Remedy**: the client auto-reconnects on refocus (`useOnlineStatus`). If
  it persists, check Supabase Realtime status and connection caps.

## Launch-week monitoring routine

Check Vercel logs, Supabase logs, and the operator dashboards several times
a day for the first two weeks after a real PT connects, then weekly. Follow
`docs/observability/launch-log-review.md` section by section.

## First-PT SLA

Respond to the first PT within 4 business hours during business hours, and
within 24 hours otherwise.

## Rollback plan

If something goes badly wrong, disconnect the PT's WhatsApp connection from
the Settings danger zone (`disconnectWhatsApp` server action,
`app/(dashboard)/settings/actions.ts`) — this sets
`whatsapp_connections.status = 'revoked'` — then message the PT out-of-band
to explain what happened and next steps.

## Local HTTPS dev loop (`.env.local.dev`)

Meta test-app credentials for local Embedded Signup live in the git-ignored
`.env.local.dev` file (template: `.env.local.dev.example`). Run `pnpm tunnel`
to expose `localhost:3000` over a Cloudflare quick tunnel HTTPS URL, then
point `META_REDIRECT_URI` / `NEXT_PUBLIC_APP_URL` at that URL.

## Operational rehearsal — existing coverage

Phase 12's operational-rehearsal checklist maps onto existing automated
coverage as follows:

| Rehearsal item | Coverage |
|---|---|
| Delete a patient → cascade + audit-log entry | Phase 10 patient-erase tests (`lib/patients/erase.ts`, `lib/gdpr/*` test suites) |
| Export a patient → JSON valid + complete | Phase 10 export tests (`app/(dashboard)/settings/export-data.tsx` + export lib tests) |
| Revoke token → adapter catches auth error → connection `revoked` → reconnect CTA | Phase 2/5 WhatsApp client tests (`lib/channels/whatsapp/__tests__/client.integration.test.ts`, `GraphApiError.isAuthError`) + `connect-whatsapp.tsx` reconnect UI |
| Bad template → rejection surfaces in dashboard | Phase 5/6 template tests + `errorStatus('rejected')` status card |
| Disconnect WhatsApp → "Reconnect" CTA | `disconnectWhatsApp` action test |
| Force a reminder run early (28h-out appointment) | Manual step — no automated coverage; walk this by hand during the E2E smoke test |
