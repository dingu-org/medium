# Phase 2 — WhatsApp integration

**Goal.** A real WhatsApp number connects via Meta's Embedded Signup, the webhook receives signed messages and persists them idempotently, and the channel adapter can send free-form and template messages through the Graph API.

**Source.** Tech doc §5.1 (booking flow), §5.4 (onboarding), §7 (WhatsApp-specific handling); product spec `docs/medium-canvas/documents/whatsapp-cloud-api-architecture.md`.

**Effort.** 5–7 days.

**Prerequisites.** Phase 1 complete; Meta App Review passed (or test app for dev).

---

## Tasks

### Webhook handler — `app/api/webhooks/whatsapp/route.ts`

- [ ] `GET` handler for Meta's webhook verification challenge (`hub.challenge`).
- [ ] `POST` handler:
  - [ ] Read raw body for signature verification (Next.js `request.text()` then JSON parse).
  - [ ] Verify `x-hub-signature-256` against `app_secret` using HMAC-SHA256. Reject 401 on mismatch.
  - [ ] For each message in the payload: insert into `messages` with `external_id` = Meta's `id`. Conflict on UNIQUE → swallow (idempotent).
  - [ ] Update `conversations.last_inbound_at` to `now()` for the affected conversation (upsert if new).
  - [ ] Emit `message.received` Inngest event with `{ messageId, ptId, conversationId }`.
  - [ ] Return 200 immediately (target p95 <200 ms).
- [ ] Force Node runtime (`export const runtime = 'nodejs'`); Edge runtime can't do `crypto` reliably at the time the doc was written.
- [ ] Log every rejected signature to Sentry as a warning (sign of misconfiguration or attack).

### Embedded Signup — `app/api/auth/meta-embedded/route.ts`

- [ ] Frontend "Connect WhatsApp" button on settings page that opens Meta's Embedded Signup with `app_id`, `redirect_uri`, `state` (signed CSRF token tied to the PT session).
- [ ] Callback handler:
  - [ ] Verify state token.
  - [ ] Exchange auth code for short-lived token (server-side fetch).
  - [ ] Exchange short-lived for long-lived token.
  - [ ] Call Graph API to retrieve `phone_number_id`, `waba_id`.
  - [ ] Encrypt token via `pgp_sym_encrypt(token, env.TOKEN_ENCRYPTION_KEY)`.
  - [ ] Insert `whatsapp_connections` row.
  - [ ] Subscribe phone number to webhook (Graph API call).
  - [ ] Emit `wa.connection.created` event.
- [ ] Error UI per spec doc §9 — rejection, duplicate number, abandoned flow.

### Channel adapter — `lib/channels/whatsapp/`

- [ ] `client.ts` — Graph API client; reads + decrypts token at call site only, never logs it.
  - [ ] `sendFreeForm(connectionId, to, body)` — refuses if `last_inbound_at` is older than 24 h.
  - [ ] `sendTemplate(connectionId, to, templateName, language, variables)` — used outside the 24 h window.
  - [ ] `submitTemplate(connectionId, name, language, body, variables)` — Business Management API.
  - [ ] `getTemplateStatus(connectionId, templateId)` — for polling.
  - [ ] `getQualityRating(connectionId)` — periodic poll.
- [ ] Auth-error handler: on 401/403 from Graph API, mark `whatsapp_connections.status = 'revoked'`, emit `wa.connection.revoked`. The PWA picks this up and shows "Reconnect WhatsApp".
- [ ] Rate-limit awareness: read `whatsapp_connections.tier` and a rolling 24h count from `messages` to throttle outbound sends.

### Token encryption helpers

- [ ] `lib/db/crypto.ts` — wrap `pgp_sym_encrypt` / `pgp_sym_decrypt` calls; key from env.
- [ ] Migration: ensure `access_token_encrypted` is `bytea` (not text).
- [ ] Test: round-trip a token (encrypt, decrypt) returns the original.

### Bootstrap connection (Inngest function — placeholder; full wiring in Phase 5)

- [ ] Stub `bootstrapWaConnection` that:
  - [ ] Creates `appointment_reminder_24h` template via Graph API.
  - [ ] Polls approval status every hour for up to 72 h.
  - [ ] Updates `message_templates.status` accordingly.
  - [ ] On approval, emit `wa.template.approved`.

---

## Acceptance criteria

- [ ] A real PT can complete Embedded Signup and a `whatsapp_connections` row is written with an encrypted token.
- [ ] A test message sent to that number appears in `messages` within seconds; webhook handler returns 200 in <500 ms locally.
- [ ] A forged-signature request is rejected with 401.
- [ ] Two duplicate webhooks for the same Meta `id` produce exactly one `messages` row.
- [ ] `sendFreeForm` outside the 24 h window refuses cleanly with a typed error.
- [ ] `sendTemplate` for an unapproved template refuses cleanly.
- [ ] Decrypting a token never logs the plaintext (audit by grep).

---

## Notes

- For local dev, use ngrok or Cloudflare Tunnel pointing at `localhost:3000/api/webhooks/whatsapp`. Configure a separate Meta test app so prod isn't routed through your laptop.
- The 24 h window is checked at *send* time, not receive time, because by the time the Inngest job runs the window may have closed.
- Quality rating is polled, not pushed — schedule in Phase 5.
- Don't use a queue here for inbound persistence. Insert + emit is fast enough; Inngest does the heavy lifting downstream.
