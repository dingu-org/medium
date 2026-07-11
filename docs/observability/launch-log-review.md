# Launch-period log review checklist

Structured JSON logs (Vercel + Supabase logs, no dedicated log platform for
MVP — see `docs/tech-stack-and-architecture.md` §2). Every line has the shape
`{ timestamp, level, trace_id?, pt_id?, conversation_id?, event_name, message, ...attrs }`
(`lib/log.ts`). PII (`phone`, `name`, `body`, `content`, `notes`, `email`,
tokens/keys/auth) is redacted at the logger before it's ever written — do not
add ad-hoc `console.log`s that bypass `lib/log.ts` for anything that touches
patient data.

Run this checklist daily during the first two weeks after a real PT connects,
then weekly.

## 1. Error spikes

Filter: `level=error`.

- `action.error` — a Server Action threw (`lib/actions/instrument.ts` wraps
  every exported action in the 7 `app/**/actions.ts` files). Attrs include
  `trace_id`, `action` (e.g. `chat.sendPtMessage`), `errorName`,
  `errorMessage`. A `redirect()`/`notFound()` control-flow throw is passed
  through un-logged — only real failures show up here.
- `conversation.turn_failed` — an AI turn or reminder turn failed inside
  `lib/conversation/engine.ts`. Carries `pt_id`, `conversation_id`,
  `message_id`, `model`, `error_code`.
  > Naming note: this checklist's acceptance vocabulary originally called for
  > `ai.turn_failed`. The engine's actual failure event is
  > `conversation.turn_failed` (`lib/conversation/engine.ts`); the AI
  > tool-dispatch failure event is `ai.tool_failed`
  > (`lib/ai/dispatcher.ts`). Filter on `conversation.turn_failed` for
  > model/turn failures until the two names are reconciled — do not search for
  > a literal `ai.turn_failed` line, it doesn't exist.
- `graph.api_error` — a WhatsApp Graph API call returned non-2xx
  (`lib/channels/whatsapp/graph.ts`). Never carries the token or the request
  URL; look at `status`/`code`/`subcode` and cross-reference Meta's own
  status-code docs.
- `route.error_boundary` / `route.global_error` — a route segment or the root
  layout threw client-side (`app/error.tsx` / `app/global-error.tsx`). Only
  `digest` + `errorName` are logged client-side (never `error.message`, which
  can echo server data) — pair the `digest` with the corresponding
  server-side log line to see the real error.

A spike in any of the above within a short window is the primary "something
is on fire" signal for a 1–3 PT MVP.

## 2. Webhook latency / delivery problems

Every inbound WhatsApp webhook call gets a `trace_id` (from the
`x-request-id` header if Meta ever sends one, otherwise a fresh UUID) at the
top of `app/api/webhooks/whatsapp/route.ts POST`. Filter
`event_name=webhook.message_accepted` to see accepted inbound messages
(`pt_id`, `conversation_id`, `message_id`, no message body). Compare the
webhook-accepted timestamp against the corresponding
`inbound.processing`/`inbound.reply_sent` lines from
`lib/inngest/functions/handle-inbound-message.ts` (same `trace_id`) to see
webhook → Inngest → outbound-send latency end to end.

Rejections short-circuit before any DB write and log as `warn`, not `error`
— they're expected noise (retries, bad actors probing the endpoint, stale
history syncs), not launch-blocking:
`webhook.bad_signature`, `webhook.invalid_json`, `webhook.schema_mismatch`,
`webhook.missing_phone_number_id`, `webhook.unknown_phone_number_id`,
`webhook.unsupported_coexistence_request`,
`webhook.skipping_non_text_message`, `webhook.skipping_non_text_message_echo`.
A sustained run of `webhook.unknown_phone_number_id` for one `phone_number_id`
usually means a connection was revoked without the PT noticing — check
`whatsapp_connections.status` for that number.

## 3. OpenRouter / upstream provider failures

- `ai.turn_completed` (info, `lib/conversation/engine.ts`) — logged after
  every successful AI turn: `model`, `provider`, `tokensIn`, `tokensOut`,
  `cachedTokens`, `costMicrousd`, `steps`, `durationMs`. Useful both for spend
  sanity-checking and for spotting a provider quietly getting slower
  (rising `durationMs`) before it starts erroring outright.
- `conversation.turn_failed` (error) — see §1.
- `ai.tool_failed` (error, `lib/ai/dispatcher.ts`) — a tool call inside an AI
  turn failed; the turn itself may still have completed via a fallback path,
  so check both this and `ai.turn_completed`/`conversation.turn_failed` for
  the same `conversation_id` to see the outcome.
- Cross-check against OpenRouter's own **Activity** dashboard
  (openrouter.ai/activity) for a handful of recent `trace_id`s: pick a request
  window, confirm the request count and per-request cost roughly match what
  `ai.turn_completed`'s `costMicrousd` sums to for the same window. This is
  the manual spot-check the tech doc asks for — it's a sanity check, not a
  reconciliation job; a few percent drift is expected (currency/timing).

## 4. Push delivery

- `push.dispatched` (an `events` row written by
  `lib/notifications/push-dispatch.ts`, not a log line) — `sent`/`removed`
  counts per dispatch, surfaced in the admin dashboard
  (`app/(dashboard)/admin/page.tsx`) as a 7-day rollup + delivery rate.
- `push.dispatch_no_live_subscriptions` (warn) — every subscription for a PT
  was stale (404/410) at dispatch time. Repeated occurrences for the same
  `pt_id` mean their browser(s) are no longer subscribed — the in-app push
  prompt should reappear for them naturally, but it's worth a manual check
  during early launch.
- `push.send_failed` (warn, `lib/notifications/push.ts`) — an individual
  subscription's send failed with a non-404/410 status; the subscription is
  kept (it might be transient). Repeated failures for one `subscription_id`
  are worth investigating.

## 5. Filtering logs by `pt_id` / `trace_id`

In Vercel's log viewer (or `vercel logs`), search is a plain text/JSON
substring match — since every line is single-line JSON, searching
`"pt_id":"<uuid>"` or `"trace_id":"<uuid>"` isolates exactly one PT or one
request's full lifecycle (webhook → Inngest → outbound send, or Server
Action → error). Supabase's Postgres logs cover DB-level errors (constraint
violations, connection issues) separately — cross-reference by timestamp when
an `action.error`/`conversation.turn_failed` line coincides with a DB error.

## 6. Performance budgets

No dedicated RUM tool for MVP — `components/web-vitals-reporter.tsx` samples
25% of page loads and beacons `LCP`/`CLS`/`FCP`/`TTFB`/`INP`/`FID` to
`/api/metrics/vitals`, which logs one `web_vitals` line per sampled metric
(`metric`, `value`, `path`). Filter `event_name=web_vitals` and look at the
distribution per `path`.

**Manual threshold for launch review**: if calendar-render time (the
`/calendar` route's `LCP`, as a proxy — there's no dedicated
calendar-render-time metric in MVP) exceeds **2s at p95**, investigate before
onboarding more PTs. There is no automated alert for this in MVP; it's a
manual weekly check against the `web_vitals` log lines.
