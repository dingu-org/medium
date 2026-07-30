# Subprocessors

Medium uses the following subprocessors to deliver the product. This list
should be kept current and referenced from the DPA (`dpa-template.md`) and the
public privacy policy.

| Subprocessor | Role | Processing location | Notes |
|---|---|---|---|
| **Supabase** | Postgres database (system of record), Auth | Frankfurt, Germany (`eu-central-1`) | All patient data, appointments, messages, and audit logs live here. |
| **Vercel** | Application hosting (Next.js, Server Actions, API routes) | `fra1` (Frankfurt) | Compute region for the deployed app; no independent data store of patient data beyond in-flight request processing. |
| **Inngest** | Background job orchestration (reminders, retention purge, webhook fan-out) | EU | Durable event/step execution for scheduled and event-driven jobs; payloads mirror the `events`/`event_outbox` tables, which are kept PII-minimal by design. |
| **OpenRouter** | AI model routing for the conversational assistant | Routes to upstream model providers; **does not itself guarantee EU-only inference** on non-Enterprise plans | Configured for Zero Data Retention (ZDR) and denied provider-side data collection. See "AI processing" below for the actual production upstreams. |
| **Anthropic** | Upstream AI model provider (via OpenRouter) — **the production inference backend** | US-based, cross-border processing | Production model is `anthropic/claude-haiku-4.5`, routed through OpenRouter with ZDR + denied data collection. This is a documented cross-border transfer; system-of-record data (patient records, messages, appointments) is not stored by Anthropic — only per-turn prompt content is transmitted for inference. |
| **OpenAI** | Upstream AI model provider (via OpenRouter) — **fallback inference backend** | US-based, cross-border processing | Fallback model is `openai/gpt-5-mini`, used when the primary model is unavailable, under the same ZDR + denied-data-collection routing and the same transfer basis as the primary. |
| **Meta (WhatsApp Business Platform)** | Messaging channel — inbound/outbound WhatsApp messages | Meta-operated infrastructure (not EU-exclusive) | The patient-facing communication channel; message content transits Meta's Cloud API / Business Platform per Meta's own data processing terms. |

## AI processing detail

- Development and production both route through OpenRouter (`lib/ai/`),
  which is configured to require Zero Data Retention (ZDR) and denied
  provider-side data collection on every request.
- The **production** model is `anthropic/claude-haiku-4.5` with
  `openai/gpt-5-mini` as the fallback (`lib/billing/plans.ts`). Both upstream
  providers are named explicitly here (rather than only "whichever provider
  OpenRouter selects") because that is the accurate, current routing, and a
  guard test (`app/(legal)/privacy/__tests__/ai-providers.test.ts`) fails if a
  model change introduces a provider this annex, the privacy policy, or the
  terms of service do not name.
- The deployment-time escape hatches (`OPENROUTER_MODEL_OVERRIDE`,
  `OPENROUTER_PROD_MODEL`, `OPENROUTER_DEV_MODEL`) pin inference to a single
  model while set and bypass the plan config, so an override must stay within
  the upstream providers named above — otherwise this annex, the privacy policy
  and the terms of service have to be updated before it is deployed.
- Non-Enterprise OpenRouter plans do not contractually guarantee EU-only
  inference infrastructure. This is accepted for the current MVP (see the
  2026-05-06 decisions log entry), with system-of-record data kept in EU
  services and prompt payloads minimized (no patient-controlled display names
  enter the system prompt; see the 2026-06-10 hardening entry).

## Keeping this list current

Update this file whenever a new subprocessor is introduced, an existing one's
processing region changes, or the production AI model/provider changes —
then reflect the change in the privacy policy (`/privacy`) and notify PT
customers per the DPA's subprocessor-change clause.
