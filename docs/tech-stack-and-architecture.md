# Tech stack and architecture

This document describes the recommended technical foundation for **Medium** — a multi-tenant SaaS where service businesses (starting with solo physical therapists in Europe) connect their own WhatsApp Business number, an AI autonomously handles patient conversations and bookings, and the business owner oversees everything via a mobile-first PWA.

It is the technical counterpart to the product canvas in `medium-canvas/`.

---

## 1. Purpose and constraints

The stack is optimized for the constraints stated across the canvas documents:

- **Solo developer**, 2–3 hours per day, ~€100/month infrastructure and API budget → favor **managed services** over self-hosted; favor **velocity** over premature optimization.
- **Multi-tenant from day one**, even though the MVP targets 1–3 PTs. Retrofitting multi-tenancy is painful and costly.
- **Channel-agnostic conversation engine** — WhatsApp first, then Instagram, Messenger, SMS. The core must not assume a channel.
- **Event-driven** — domain events (`appointment.booked`, `reminder.sent`, `conversation.escalated`) are first-class so future features (waitlist, analytics, multi-location) subscribe without refactors.
- **WhatsApp Cloud API direct** (not a BSP). Decided in `medium-canvas/blobs/decision-proceed-with-mvp/`.
- **Meta webhook must respond within 20 seconds** → all real work is asynchronous.
- **GDPR, EU residency** — patient data is healthcare-adjacent. Primary app data lives in the EU, tokens and sensitive columns are encrypted at rest, and any non-EU AI processing is explicitly disclosed.
- **PWA, not native** — installable, offline read of cached calendar, web push notifications.
- **Human escalation** is mandatory — WhatsApp terms require it, and PT trust depends on it.

---

## 2. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** end-to-end | One language across PWA, backend, and jobs; best AI SDK surface for a solo dev |
| App framework | **Next.js 15 (App Router)** | PWA + API routes (webhooks) + Server Actions in one repo; first-class PWA story |
| UI | **React + Tailwind + shadcn/ui** | Fast to assemble the mobile-first screens from `pt-admin-pwa-screens.md` |
| Calendar component | **Custom** (`react-day-picker` for month + a CSS grid week view, both driven by `date-fns`) | Keeps the calendar route inside the ≤3 s 3G first-load budget; FullCalendar is reserved for a specific feature that is too painful to build (e.g. drag-to-reschedule with recurring events) |
| Database | **Postgres on Supabase (EU region)** | Row-Level Security enforces tenant isolation at the DB layer; realtime + auth + storage included |
| ORM | **Drizzle** | TypeScript-native, lightweight, edge-compatible, straightforward with raw SQL for RLS policies |
| Auth (PTs) | **Supabase Auth** (email+password, Google OAuth) | Integrates with RLS through `auth.uid()` |
| Background jobs & scheduling | **Inngest** | Delayed jobs (24h reminders), retries, event bus — matches the docs' event-driven principle; generous free tier |
| AI | **OpenRouter + AI SDK**, currently pinned to `meta-llama/llama-3.3-70b-instruct:free` | One model-agnostic API surface with strict privacy routing and a zero-cost MVP guardrail; room to swap models later without changing app-facing abstractions |
| Hosting | **Vercel** (Next.js) + **Supabase EU** (DB/auth/realtime) + **Inngest Cloud** (jobs) | No infrastructure to maintain; all have EU regions |
| Webhook runtime | Next.js Route Handler on the **Node runtime** (not Edge) | Signature verification needs `crypto`; handler just verifies + enqueues and returns 200 |
| Realtime (live calendar/chat) | **Supabase Realtime** (Postgres changefeeds) | No extra infrastructure; scopes naturally to RLS |
| Push notifications | **Web Push** via `web-push` + VAPID keys | Works on an installed PWA; free |
| Service worker / offline | **Serwist** (maintained next-pwa successor) | Offline read of cached data as required by `pt-admin-pwa-screens.md §Offline handling` |
| Error monitoring | **Vercel + Supabase logs** for MVP | Free-tier limits on Sentry are already exhausted; structured platform logs are enough to get the first PT live |
| Logs | **Vercel + Supabase logs**, Axiom optional later | Start simple; add a dedicated log platform only if filtering pain justifies it |
| Product analytics | **Internal events + dashboards** for MVP | Avoid third-party analytics for now; derive booking funnel and escalation rate from app data |
| Secrets | Vercel environment variables; WA access tokens encrypted at rest via **pgcrypto** | Token compromise blast radius + GDPR |

**Estimated fixed monthly cost at MVP (1–3 PTs):**

- Supabase Pro ~€25
- Vercel Hobby €0
- Inngest free tier €0
- OpenRouter usage ~€0 while the current free-model guardrail remains viable
- No dedicated Sentry/PostHog spend in the current MVP plan
- **Total: ~€40–70/month**, leaving headroom within the €100 budget for Meta conversation fees.

---

## 3. Architecture overview

### Shape: modular monolith + event bus + Postgres

A single Next.js app hosts the PWA and all HTTP endpoints. Heavy lifting — AI turns, reminder dispatch, template creation, notification fan-out — is handed off to Inngest functions so webhooks return in under a second. Postgres with RLS is the source of truth for all tenant-scoped data.

This shape fits the constraints:

- **One repo, one deploy** — minimal operational surface for a solo dev.
- **Webhook path is decoupled from slow work** — a slow AI turn or third-party timeout cannot cause Meta to retry.
- **Decomposable later** — if the conversation engine or a channel adapter outgrows the monolith, it extracts cleanly because module boundaries and event contracts already exist.

### Module boundaries

```
app/
  (dashboard)/            — PT PWA UI: calendar, chat, settings, availability, notifications
  api/
    webhooks/whatsapp/    — Meta inbound webhook: verify signature, enqueue message.received
    webhooks/instagram/   — (V2)
    auth/meta-embedded/   — Embedded Signup OAuth callback
lib/
  conversation/           — channel-agnostic engine: turn state, AI orchestration, tool dispatch
  channels/
    whatsapp/             — Graph API client, template submission, 24h-window tracking
    instagram/            — (V2)
  ai/                     — OpenRouter client, system prompts, tool schemas (get_availability,
                            book_appointment, reschedule_appointment, cancel_appointment,
                            escalate_to_human)
  appointments/           — availability resolver, booking, reschedule, cancel, state machine
  reminders/              — schedule logic, template variable binding, response parsing
  tenancy/                — PT context loader, RLS-aware query helpers
  db/                     — Drizzle schema, migrations, typed queries
  events/                 — Inngest function definitions and domain event types
  notifications/          — Web Push dispatch to PT devices
```

The **conversation engine** sees only "an inbound message on conversation X for PT Y." Channel adapters translate WA/Instagram/SMS payloads into this shared shape in both directions. This is the architectural seam that makes adding Instagram a new-adapter change rather than a rewrite.

---

## 4. Data model

All tables storing patient-facing or PT-facing data carry a `pt_id` column and are covered by RLS policies. Tables:

| Table | Purpose |
|---|---|
| `pts` | PT accounts (Supabase Auth user + profile) |
| `whatsapp_connections` | `pt_id`, `phone_number_id`, `waba_id`, `access_token_encrypted`, `tier`, `quality_rating`, `connected_at` |
| `patients` | `pt_id`-scoped patients: name, phone (E.164), channel identifiers, notes |
| `conversations` | One per (patient, channel); tracks `last_inbound_at` for the 24h window, `ai_active` flag, escalation state |
| `messages` | One row per inbound/outbound message; `external_id` unique for idempotency, `role` = patient\|ai\|pt, `channel`, `template_id` if applicable |
| `appointments` | `pt_id`, `patient_id`, `starts_at`, `ends_at`, `service_type`, `status` (pending\|confirmed\|cancelled\|no_show\|completed\|rescheduled), `notes` |
| `availability_rules` | Weekly availability per PT: weekday, start, end |
| `blocked_periods` | Ad-hoc unavailability (holidays, lunch) |
| `message_templates` | Submitted WA templates per PT with approval status from Meta |
| `reminder_jobs` | Durable record of scheduled reminders (pairs with Inngest runs) for dashboard visibility |
| `push_subscriptions` | PT's registered Web Push endpoints |
| `events` | Domain event log (audit + analytics), append-only |
| `audit_log` | Access log for GDPR (who read which patient record, when) |

Every query through `lib/tenancy/` either uses the authenticated PT's session (RLS sets `auth.uid()`) or requires an explicit `pt_id` argument when running under the service role (webhooks, jobs). The helper rejects any call made without a tenant in scope.

---

## 5. Core flows

### 5.1 Patient books an appointment on WhatsApp

1. **Meta → `POST /api/webhooks/whatsapp`.** Handler verifies the Meta signature against the shared secret, inserts the raw payload into `messages` with `external_id` for idempotency, emits an `message.received` event to Inngest, and returns 200 in under a second.
2. **Inngest function `handleInboundMessage`** loads PT context by `phone_number_id` via `whatsapp_connections`, upserts the `patients` row, opens or reuses the `conversations` row, updates `last_inbound_at`, and calls the conversation engine.
3. **Conversation engine** runs an AI SDK turn through OpenRouter with tools: `get_availability`, `book_appointment`, `reschedule_appointment`, `cancel_appointment`, `escalate_to_human`. Tool calls invoke `lib/appointments` and `lib/tenancy` directly (in-process, transactional).
4. **`book_appointment` tool** writes the `appointments` row, emits an `appointment.booked` event, returns a structured confirmation to the AI, which renders the final patient-facing message.
5. **Event subscribers react to `appointment.booked`:**
   - `lib/channels/whatsapp` sends the confirmation back through the Graph API.
   - `lib/reminders` schedules a `sendReminder` Inngest job for `starts_at - 24h`.
   - `lib/notifications` pushes a Web Push notification to the PT's registered devices.
   - Supabase Realtime broadcasts the row insert, and the PT's PWA calendar updates without a refresh.

### 5.2 Reminder dispatch (24 hours before appointment)

1. Inngest fires the scheduled `sendReminder` job. It re-reads the appointment to confirm it is still `pending` or `confirmed` and that the PT's number is still connected.
2. `lib/channels/whatsapp` checks `conversations.last_inbound_at`. Because this is ≥24h after the last patient message, the free-form window is closed — the job uses the approved `appointment_reminder_24h` template with variables populated.
3. If the PT's template is not yet approved, the job is requeued with backoff and the appointment is flagged in the PT dashboard as "Reminder pending — template not yet approved."
4. Patient replies (CONFIRM / CANCEL / RESCHEDULE) flow through the normal webhook path; the conversation engine dispatches to the reminder response handler, which transitions the appointment state and emits `appointment.confirmed` / `appointment.cancelled` / `appointment.rescheduled`.

### 5.3 PT takes over a chat

1. PT opens the chat view in the PWA. UI state subscribes to `messages` via Supabase Realtime for live updates.
2. When PT sends a message, the Server Action marks `conversations.ai_active = false` and calls `lib/channels/whatsapp` to send directly via the Graph API. The AI does not respond to subsequent inbound messages while `ai_active` is false.
3. After 1 hour of PT inactivity (Inngest delayed job), the system offers to resume: either a UI prompt in the PT dashboard or an automatic handoff per the PT's setting.

### 5.4 PT onboarding via Embedded Signup

1. PT signs up in the PWA (Supabase Auth), completes profile (practice name, timezone).
2. PT clicks "Connect WhatsApp." The app opens Meta's Embedded Signup flow with `app_id`, `redirect_uri`, and state token.
3. On callback to `/api/auth/meta-embedded`, the app exchanges the auth code for an access token (server-side), stores the encrypted token, `phone_number_id`, and `waba_id` in `whatsapp_connections`, and subscribes the phone number to the webhook.
4. An Inngest function `bootstrapWaConnection` runs: it creates the `appointment_reminder_24h` template in the PT's WABA, polls Meta for approval status (typically 24–48h), and updates `message_templates` accordingly.
5. The PWA guides the PT through setting availability, configuring the AI's name and greeting, and offering a test message.
6. Error states (Meta rejection, number already in use, PT abandoned flow) follow the handling in `medium-canvas/documents/whatsapp-cloud-api-architecture.md §PT onboarding flow architecture`.

---

## 6. Multi-tenancy and security

- **Database-layer isolation:** every tenant-scoped table has RLS enabled. Policies look like `pt_id = auth.uid()` for authenticated user queries. Service-role queries (webhooks, jobs) bypass RLS but flow through `lib/tenancy/` helpers that require an explicit `pt_id`.
- **App-layer guardrail:** the tenancy helper is the only path to tenant-scoped tables. It refuses to run without a PT in scope. This is defense in depth — any future developer (including future-you at 11pm) cannot accidentally write a cross-tenant query.
- **Token encryption:** WhatsApp access tokens are stored encrypted via pgcrypto with a key loaded from a Vercel env var. Tokens are decrypted only at the call site in `lib/channels/whatsapp` and never logged.
- **Audit log:** every read/write of patient data through `lib/tenancy/` writes to `audit_log` — actor, action, target, timestamp. Required for GDPR subject access requests.
- **Secrets:** no secrets in the repo. All production secrets in Vercel and Supabase; local development uses `.env.local` listed in `.gitignore`.
- **TLS everywhere:** automatic on Vercel and Supabase.

---

## 7. WhatsApp-specific handling

This section translates `medium-canvas/documents/whatsapp-cloud-api-architecture.md` into concrete implementation rules.

- **Signature verification** on every inbound webhook using Meta's shared secret. Reject any request without a valid signature.
- **<20s response budget:** the webhook handler does only four things — verify signature, insert raw message for idempotency, enqueue an Inngest event, return 200. Measured budget: <200 ms at p95.
- **Idempotency:** `messages.external_id` has a unique index. Duplicate webhooks from Meta are absorbed by the constraint.
- **24h conversation window:** `conversations.last_inbound_at` is updated on every inbound message. The outbound sender in `lib/channels/whatsapp` checks the column and refuses to send a free-form message outside the window — it either swaps in an approved template or raises a clear error.
- **Template lifecycle:** templates are created programmatically via the Business Management API in an Inngest function, with approval status tracked in `message_templates`. The reminder scheduler skips a PT whose template is not yet approved and surfaces this in the PT dashboard.
- **Rate tier tracking:** `whatsapp_connections.tier` and a rolling message count drive the reminder dispatcher's throttling. Approaching the tier limit surfaces in the PT dashboard.
- **Quality rating:** polled periodically via the Graph API; a drop in rating alerts the PT.

---

## 8. AI orchestration and cost

**Model selection policy:**

- The current MVP guardrail routes every runtime turn to `meta-llama/llama-3.3-70b-instruct:free` via OpenRouter.
- Keep routing inside the OpenRouter layer so the app can add or swap providers later without rewriting the conversation engine.
- Default production routing uses strict privacy controls: ZDR on, provider data collection denied, and parameter-safe routing.
- Do not silently add alternate or paid models. If the free model proves inadequate, make that a documented planning decision first.

**Structured interaction over free-form parsing:**

- Availability, booking, and state changes happen through **tool use** with well-typed schemas defined in `lib/ai/tools.ts`. The model never writes JSON that the app then parses from prose.
- Tool results are returned to the model so it can render a natural confirmation, but the authoritative state change already happened in the transactional tool call.

**Prompt structure:**

- Each PT's system prompt (AI name, greeting, escalation keyword, PT-specific facts) should stay factored and stable even though the current free-model guardrail does not rely on prompt caching.
- Tool definitions stay in the static prompt section so a caching-capable paid model can be introduced later without a prompt rewrite.

**Cost math per PT per month:**

- Runtime AI spend is effectively **~€0** while the free-model guardrail remains available.
- Still capture token and generation metadata from day one so the cost baseline is ready if a paid model or fallback is introduced later.

---

## 9. PWA delivery

- **Installable:** the app manifest and icon set are generated from Next.js `metadata` and a static `public/manifest.json`. PWA install prompts surface on first meaningful engagement.
- **Offline read:** Serwist service worker caches the app shell, the latest calendar, the latest messages per open conversation, and PT settings. Writes while offline are queued in IndexedDB and replayed when the connection returns. Banner pattern is described in `medium-canvas/documents/pt-admin-pwa-screens.md §Offline handling`.
- **Realtime updates:** Supabase Realtime subscriptions scoped per PT — one each for `appointments`, `messages`, `conversations`. Because RLS is enforced on the channel, a PT can only subscribe to their own rows.
- **Web Push:** PT registers a push subscription on first login (per browser). The `lib/notifications` module sends pushes via `web-push` with VAPID keys for: new bookings, cancellations, reschedules, explicit human-escalation requests, and rule-based alerts (e.g., patient sent a message that requires attention).
- **Performance budget:** ≤3 second first load on 3G, per the PWA requirements. Supports this by using the Next.js App Router's partial hydration and by keeping the calendar custom (no heavy third-party calendar bundle); the calendar route still code-splits on its own chunk.

---

## 10. GDPR

- **EU residency:** Supabase project in Frankfurt (or another EU region). Vercel defaults to edge distribution but origin functions run in Frankfurt. Inngest supports EU processing. OpenRouter is accepted for MVP without guaranteed EU-only inference on the current plan.
- **Encryption at rest:** access tokens via pgcrypto; sensitive patient columns via pgcrypto or Supabase Vault. Transport encryption via TLS (automatic).
- **AI inference and disclosures:** OpenRouter does not retain prompt/response content unless logging or product-use opt-ins are enabled, but it does retain request metadata. Production requests default to ZDR + denied provider data collection, and privacy docs explicitly disclose that AI inference may involve cross-border processing.
- **Retention:** daily Inngest job purges `messages` older than the PT's configured retention window (default 90 days). Aggregate anonymized metrics are kept indefinitely.
- **Right to erasure:** per-patient cascade delete surfaced in the PWA patient detail view. Deleting a patient removes their patient row, their conversations, their messages, and their appointments (completed and future).
- **Data export:** a Server Action generates a JSON bundle of a patient's data or a full PT export on request.
- **Audit log:** every access to patient data is logged via `lib/tenancy/` to `audit_log`. Retained for the minimum period required by GDPR.
- **Controller/processor boundaries:** PT is the data controller (collects patient consent for WhatsApp communication); Medium is the processor (processes under the PT's instructions). Terms reflect this.

---

## 11. Tradeoffs considered

1. **Separate backend (Fastify/Hono) + separate React frontend.** *Rejected:* two deploys, two code paths, more surface for a solo dev. Reopen only if Next.js serverless cold starts cause real webhook problems.
2. **Prisma instead of Drizzle.** *Rejected:* heavier query engine, worse on serverless cold starts, and less flexible for the raw SQL needed for RLS policies.
3. **BullMQ + self-hosted Redis for jobs.** *Rejected:* more infrastructure to maintain; Inngest's delay and retry primitives fit "schedule reminder in 23h 47m" natively.
4. **Python + FastAPI for the backend** (natural home for AI). *Rejected:* forces two languages across PWA and backend, doubling cognitive load on a 2–3h/day project.
5. **Roll our own OAuth and auth service.** *Rejected:* Supabase Auth plus RLS is 1–2 days of setup versus multiple weeks of rolling a secure auth service from scratch.
6. **Skip RLS, rely on app-layer tenancy checks only.** *Rejected:* one missed `WHERE pt_id = ?` in a future query leaks another PT's patients. Unacceptable in a healthcare-adjacent context. RLS is the backstop.
7. **BSP (360dialog, Twilio) instead of direct Meta API.** *Already rejected* in `medium-canvas/blobs/decision-proceed-with-mvp/` on cost grounds; respecting that decision here.

---

## 12. Risks and mitigations

- **Vercel serverless cold start on the webhook approaches Meta's 20s limit.** Mitigation: the webhook handler is small and synchronous (verify + insert + enqueue). If cold starts ever become an issue, move just the webhook handler to a Fly.io always-on process; the rest of the app stays on Vercel. Cost unchanged.
- **Inngest free-tier limits outgrown.** Mitigation: the free tier covers far more than 3 PTs; upgrading is straightforward and the cost rolls into pricing.
- **Supabase vendor lock-in.** Mitigation: it is standard Postgres. Drizzle schemas are portable, RLS policies are plain SQL, Supabase Auth data can be exported. Migration would be work, not a rewrite.
- **Embedded Signup failure modes** (Meta rejects PT's business verification, number already in use, PT abandons the flow). Mitigation: `medium-canvas/documents/whatsapp-cloud-api-architecture.md §9` already enumerates these; surface a clear per-state UI and let the PT retry.
- **Token revocation or expiry in production.** Mitigation: the channel adapter catches auth errors from the Graph API and flags the PT's dashboard with "Reconnect WhatsApp." No reminders attempt to send until reconnected.
- **Template rejected by Meta.** Mitigation: keep a fallback template variant on file and auto-resubmit. Surface approval status in the dashboard so the PT understands why reminders aren't going out.

---

## 13. MVP cut line

**In MVP (must ship for v1):**

- Direct WhatsApp Cloud API integration + Embedded Signup for a single PT per account.
- AI conversation engine handling booking, rescheduling, cancellation, and escalation for WhatsApp only.
- PT PWA: calendar (week/month), appointment detail, chat view, manual takeover, availability settings, settings screen.
- Automated 24h reminder with CONFIRM/CANCEL/RESCHEDULE response handling.
- Web Push notifications for bookings, cancellations, reschedules, and escalation requests.
- GDPR baseline: EU region, token encryption, retention job, per-patient deletion, audit log.
- Basic observability: structured logs + a couple of internal dashboards.

**Deferred, with the architectural seam that enables each:**

- **Instagram channel** → new `lib/channels/instagram` adapter. The conversation engine, appointments, reminders, and PWA are already channel-agnostic.
- **SMS fallback** → same pattern as Instagram; a new channel adapter that calls a Twilio client and tracks cost per channel.
- **Waitlist** → subscribes to `appointment.cancelled` events and matches against a new `waitlist` table.
- **Multi-location** → `locations` table; `availability_rules` gets `location_id`; availability resolver filters on location.
- **Recurring appointments** → `appointments.series_id` and a background job materializing future instances.
- **Service types and pricing** → `service_types` table referenced by `appointments`; availability resolver accounts for per-service duration.
- **Team/clinic scheduling** → introduces a `clinic` layer above `pts`. Requires an RLS-policy pass but does not require re-architecting channels or AI.
- **Analytics dashboards** → subscribers on existing domain events populate a reporting schema; no changes to the write path.
- **Patient-facing portal** → a second frontend on the same API; already possible because the backend is API-first.
- **EMR integrations (Cliniko, Jane App, etc.)** → adapters in `lib/integrations/` that sync appointments in or out. Requires decisions about source of truth per integration.

The common thread: every deferred feature lands through events, adapter modules, or additive tables. None requires reshaping the core.

---

## 14. Setup checklist

Before any product code is shipped:

1. **Meta**
   - Create Meta Business Manager and Developer accounts for the SaaS company.
   - Create WhatsApp Business App (type: Business). Note `app_id` and `app_secret`.
   - Request `whatsapp_business_messaging` and `whatsapp_business_management` permissions; submit for app review.
   - Configure webhook URL (dev: ngrok tunnel; prod: Vercel domain) and subscribe to `messages` and `message_status`.
   - Generate a system-user access token for platform-level calls.

2. **Supabase**
   - Create a project in an EU region (Frankfurt recommended).
   - Enable RLS on every tenant-scoped table as it is created.
   - Configure Auth providers (email+password, Google OAuth).
   - Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` env vars.

3. **Vercel**
   - Create the project, link the repo, set the EU deployment region for serverless functions (Frankfurt).
   - Set env vars: Meta `app_id`, `app_secret`, webhook verify token, Supabase keys, `OPENROUTER_API_KEY`, Inngest keys, `TOKEN_ENCRYPTION_KEY`.

4. **Inngest**
   - Create an app; set the signing key.
   - Configure the Inngest endpoint at `/api/inngest`.
   - Define the core functions: `handleInboundMessage`, `sendReminder`, `bootstrapWaConnection`, `purgeExpiredMessages`, `offerResumeAfterPtInactivity`.

5. **OpenRouter**
   - Create an API key; pin the current runtime guardrail to `meta-llama/llama-3.3-70b-instruct:free`.
   - Leave prompt logging and product-use opt-ins disabled; rely on request-level privacy controls in app code.

6. **Observability and analytics**
   - No dedicated Sentry or PostHog setup is required for the current MVP because those free-tier limits are already exhausted.
   - Use structured Vercel / Supabase logs and internal event-derived dashboards instead.

7. **Local dev loop**
   - `.env.local` mirrors production env var names with dev values.
   - ngrok or Cloudflare Tunnel for local webhook testing with a separate Meta test app.
   - Seed script creates a test PT and a test patient for fast iteration.

Once this is in place, the first production milestone is: one real PT connects via Embedded Signup, receives a real patient message on WhatsApp, and sees the appointment in the PWA. Everything else compounds from there.

---

## 15. Testing

The codebase is multi-tenant and healthcare-adjacent, so testing priorities are inverted from a typical SaaS — the highest-leverage tests are the ones that prove tenant isolation, not the ones that exercise UI flows.

### Runner

**Vitest.** Native ESM and TypeScript, fast cold start, integrates with the `@/*` path alias. Avoids Jest's transform cost on a project that's already TS-first.

- Unit tests: co-located `*.test.ts` next to the file under test.
- Integration tests: `tests/integration/` for cases that need a real database.
- `pnpm test` runs unit tests; `pnpm test:integration` runs the DB-backed suite.

### Database for tests

Local Supabase via `supabase start` (Docker-backed). The integration runner applies the same Drizzle migrations the dev environment uses, so RLS policies are exercised exactly as they will be in production. CI runs the same stack.

### What we test, by priority

1. **RLS isolation** — for every tenant-scoped table, prove that PT A's authenticated session cannot read or mutate PT B's rows. Cases are generated from the schema's tenant-table list, so adding a new table without coverage fails the suite. This is the single most important test surface in the project.
2. **Tenancy helpers** — `getServiceClient()` throws without a `pt_id`; `withAuditLog()` writes one `audit_log` row on success and zero on thrown error.
3. **Idempotency** — duplicate webhooks with the same `external_id` insert one row, not two (Phase 2).
4. **Tool schemas** — Zod schemas reject malformed model outputs (Phase 3).
5. **Conversation engine** — `runTurn` against a stubbed model returns expected tool dispatches (Phase 3).

A CI assertion introspects `pg_class.relrowsecurity` to confirm RLS is enabled on every `pt_id`-bearing table. This catches the "added a tenant table, forgot to enable RLS" failure mode at PR time.

### What we don't test for MVP

- End-to-end browser tests — manual smoke covers this until launch.
- Load tests — irrelevant at 1–3 PTs.
- AI quality evals — deferred to a separate eval harness once a paid-fallback model is in scope.
