# Phase 2 — WhatsApp integration

**Goal.** A real WhatsApp number connects via Meta's Embedded Signup, the webhook receives signed messages and persists them idempotently, and the channel adapter can send free-form and template messages through the Graph API.

**Source.** Tech doc §5.1 (booking flow), §5.4 (onboarding), §7 (WhatsApp-specific handling); product spec `docs/medium-canvas/documents/whatsapp-cloud-api-architecture.md`.

**Effort.** 5–7 days.

**Prerequisites.** Phase 1 complete. For the dev path, keep testing limited to app-role users / Meta test assets with the Meta dashboard preflight from Phase 0 complete. For the production onboarding path, Business Verification plus App Review / advanced access must be complete before external PTs can grant the needed permissions.

---

## Foundation already in place (2026-05-14)

- Inngest client + typed event schemas — `lib/inngest/{events,client,functions}.ts` and `lib/events/`.
- `serve({ client, functions })` exposed at `app/api/inngest/route.ts` (GET / POST / PUT, Node runtime); the Phase 5 function registry is now populated.
- Phase 5 update: the registry now contains 9 functions; the local endpoint reports 11 handlers including two generated failure handlers.

The remaining task lists below assume this wiring exists — any task that emits an event will `import { inngest } from '@/lib/inngest/client'` and call `inngest.send(...)`.

---

## Tasks

### Webhook handler — `app/api/webhooks/whatsapp/route.ts`

- [x] `GET` handler for Meta's webhook verification challenge (`hub.challenge`).
- [x] `POST` handler:
  - [x] Read raw body for signature verification (`request.text()` then `JSON.parse`).
  - [x] Verify `x-hub-signature-256` against `META_APP_SECRET` using HMAC-SHA256 + `timingSafeEqual` (extracted to `lib/channels/whatsapp/signature.ts`). Reject 401 on mismatch.
  - [x] For each message: idempotent upsert chain (patient → conversation → message) in a per-message transaction; message insert uses `ON CONFLICT (external_id) DO NOTHING RETURNING id` and only emits when `returning()` is non-empty.
  - [x] Conversation upsert keyed on `(patient_id, channel)` bumps `last_inbound_at` to `now()`.
  - [x] Append `message.received` to the durable event/outbox transaction only when the message was newly persisted, then attempt immediate delivery.
  - [x] Coexistence webhooks:
    - [x] `history` updates sync progress/errors only; historical messages are intentionally not persisted.
    - [x] `smb_app_state_sync` stores Business-app contacts in `whatsapp_contacts` without creating conversations.
    - [x] `smb_message_echoes` mirrors Business-app PT replies as `messages.role = 'pt'`, creates patient/conversation rows when needed, does not emit `message.received`, and resets a guarded 2-hour AI pause.
    - [x] `account_update` / `PARTNER_REMOVED` marks the connection revoked and emits `wa.connection.revoked`.
    - [x] Unsupported coexistence error `131060` is acknowledged without writes.
  - [x] Return 200 immediately (`EVENT_RECEIVED`).
- [x] Force Node runtime (`export const runtime = 'nodejs'`); needed for `crypto.createHmac` + `timingSafeEqual`.
- [x] Log every rejected signature as a structured warning (also: unknown `phone_number_id`, non-text message types, Inngest dispatch failures).

### Embedded Signup — `app/api/auth/meta-embedded/route.ts`

Implemented via Meta's current JS-SDK popup flow (2026-05-22 decision log), which diverges from the legacy redirect/`state` wording the items below were written against.

- [x] "Connect WhatsApp Business app" button on `/settings` — runs `FB.login({ config_id, response_type:'code', override_default_response_type:true, extras:{ featureType:'whatsapp_business_app_onboarding', sessionInfoVersion:'3' } })`, captures `phone_number_id` when present plus `waba_id` from the `WA_EMBEDDED_SIGNUP` postMessage, POSTs `{ code, phoneNumberId?, wabaId, mode:'coexistence' }` (`app/(dashboard)/settings/connect-whatsapp.tsx`).
- [x] Callback handler (`POST`):
  - [x] CSRF via same-origin Origin check + authenticated session (replaces the signed `state` token — the JS-SDK flow has no redirect round-trip).
  - [x] Exchange auth code for the business token — single `GET /<v>/oauth/access_token` (no separate short→long swap; that's the legacy user-token path).
  - [x] Coexistence payloads may only include `waba_id`; backend resolves a unique `phone_number_id` via `/<waba_id>/phone_numbers`.
  - [x] Encrypt token via `encryptToken` (`pgp_sym_encrypt`).
  - [x] Insert `whatsapp_connections` row via `getServiceClient` with `mode` + coexistence sync status fields (duplicate number → 409; same-PT reconnect → update).
  - [x] Subscribe WABA to webhook (`POST /<wabaId>/subscribed_apps`); skip `/<phoneNumberId>/register` for coexistence because the Business-app number is already registered.
  - [x] Append `wa.connection.created` to the durable event/outbox transaction and attempt immediate delivery.
- [x] Error UI per spec doc §9 — rejection / duplicate number / abandoned flow (toast keyed on the typed error kind; abandoned = no `authResponse`).
- [x] Unique index on `whatsapp_connections.phone_number_id` (migration `0005`) backs the 409 path + the unambiguous webhook lookup.

### Channel adapter — `lib/channels/whatsapp/`

Shared plumbing landed too: `constants.ts` (`GRAPH_VERSION = v25.0`), `graph.ts` (`graphUrl` + `graphFetch` → typed `GraphApiError`), `errors.ts`.

- [x] `client.ts` — Graph API client; reads + decrypts token at call site only, never logs it.
  - [x] `sendFreeForm(connectionId, to, body)` — refuses if `last_inbound_at` is older than 24 h.
  - [x] `sendTemplate(connectionId, to, templateName, language, variables)` — used outside the 24 h window; refuses if no approved template.
  - [x] `submitTemplate(connectionId, name, language, body, variables)` — Business Management API.
  - [x] `getTemplateStatus(connectionId, templateId)` — for polling (consumed in Phase 5).
  - [x] `getQualityRating(connectionId)` — quality rating + messaging-tier API consumed by the Phase 5 daily poll.
  - [x] `requestCoexistenceSync(connectionId, syncType)` — calls `/<phone_number_id>/smb_app_data` for `smb_app_state_sync` and `history`.
- [x] Auth-error handler: on 401/403 from Graph API, mark `whatsapp_connections.status = 'revoked'`, emit `wa.connection.revoked`. The PWA picks this up and shows "Reconnect WhatsApp".
- [x] Rate-limit awareness: Phase 5 reminders read `whatsapp_connections.tier` and use the rolling 24 h delivered-template count, stopping at 95% of the tier.

### Token encryption helpers

- [x] `lib/db/crypto.ts` — wraps `pgp_sym_encrypt` / `pgp_sym_decrypt`; `TOKEN_ENCRYPTION_KEY` captured at module init; two async functions (`encryptToken` / `decryptToken`).
- [x] Migration: `access_token_encrypted` is `bytea` — already in place from `drizzle/migrations/0001_init_schema.sql:137` (no new migration needed).
- [x] Test: round-trip encrypt → decrypt yields the original plaintext (`lib/db/__tests__/crypto.integration.test.ts`); also asserts non-deterministic ciphertext + unit test covering the env-guard.

### Bootstrap connection (Inngest function — first real function; polling in Phase 5)

- `bootstrapWaConnection` registered on `wa.connection.created` (`lib/inngest/functions/bootstrap-wa-connection.ts`):
  - [x] Creates `appointment_reminder_24h` template via Graph API (`submitTemplate`) + writes a `pending` `message_templates` row (idempotent on reconnect).
  - [x] Polls approval status every hour for up to 72 h.
  - [x] Updates `message_templates.status` accordingly.
  - [x] Emits approved, rejected, or timed-out template lifecycle events.
- `syncWhatsappCoexistence` registered on `wa.connection.created` (`lib/inngest/functions/sync-whatsapp-coexistence.ts`):
  - [x] Skips non-coexistence connections.
  - [x] Requests `smb_app_state_sync` and `history` via `smb_app_data`.
  - [x] Persists Meta request IDs and sync state idempotently.
- `resumeBusinessAppAi` registered on `conversation.ai_paused` (`lib/inngest/functions/resume-business-app-ai.ts`):
  - [x] Sleeps until the exact `pausedUntil`.
  - [x] Re-enables AI only if the Business-app echo pause is still current and not superseded by a newer echo or manual takeover.

---

## Acceptance criteria

- [ ] A real PT can complete coexistence Embedded Signup with an existing WhatsApp Business app number and a `whatsapp_connections` row is written with an encrypted token. _(Backend done + integration-tested; full E2E needs a live Meta run — see Notes.)_
- [x] A test message sent to that number appears in `messages` within seconds; webhook handler returns 200 in <500 ms locally.
- [x] A forged-signature request is rejected with 401.
- [x] Two duplicate webhooks for the same Meta `id` produce exactly one `messages` row.
- [x] Coexistence `history` webhook updates sync state without importing historical messages.
- [x] Coexistence `smb_app_state_sync` stores contacts without creating conversations.
- [x] Coexistence `smb_message_echoes` mirrors a Business-app PT reply and pauses AI for 2 hours.
- [x] `sendFreeForm` outside the 24 h window refuses cleanly with a typed error.
- [x] `sendTemplate` for an unapproved template refuses cleanly.
- [x] Decrypting a token never logs the plaintext (audit by grep + automated test).

---

## Notes

- For local dev, use ngrok or Cloudflare Tunnel pointing at `localhost:3000/api/webhooks/whatsapp`. Configure a separate Meta test app so prod isn't routed through your laptop.
- Embedded Signup dev testing: the backend (token exchange → encrypt → persist → `wa.connection.created`) and the adapter guards are fully covered by mocked-`fetch` integration tests — that's the iteration loop. The interactive `FB.login` popup can only be exercised against a public HTTPS origin (Vercel preview or a tunnel) registered in the test app's Allowed Domains + Valid OAuth Redirect URIs, signed in as an app-role user, using the Meta test WABA + test number. The popup handshake itself can't be automated.
- Meta's current coexistence Embedded Signup flow requires the app-role dev path to be wired before coding is useful: Facebook Login for Business settings, WhatsApp use case, allowed domains, valid redirect URIs, a saved `config_id`, and webhook subscriptions for `messages`, `account_update`, `history`, `smb_app_state_sync`, and `smb_message_echoes`.
- Live coexistence E2E checklist: connect a number already active in the WhatsApp Business app and not connected to another API provider; keep the app open during sync; confirm Medium writes `mode='coexistence'`, requests both `smb_app_data` sync types, records contact/history progress, receives patient inbound messages, mirrors Business-app replies as PT messages, and keeps AI paused for exactly 2 hours after each app reply.
- The 24 h window is checked at _send_ time, not receive time, because by the time the Inngest job runs the window may have closed.
- Quality rating is polled, not pushed — schedule in Phase 5.
- Don't use a queue here for inbound persistence. Insert + emit is fast enough; Inngest does the heavy lifting downstream.
