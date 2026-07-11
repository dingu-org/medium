# Subprocessors

Medium uses the following subprocessors to deliver the product. This list
should be kept current and referenced from the DPA (`dpa-template.md`) and the
public privacy policy.

| Subprocessor | Role | Processing location | Notes |
|---|---|---|---|
| **Supabase** | Postgres database (system of record), Auth | Frankfurt, Germany (`eu-central-1`) | All patient data, appointments, messages, and audit logs live here. |
| **Vercel** | Application hosting (Next.js, Server Actions, API routes) | `fra1` (Frankfurt) | Compute region for the deployed app; no independent data store of patient data beyond in-flight request processing. |
| **Inngest** | Background job orchestration (reminders, retention purge, webhook fan-out) | EU | Durable event/step execution for scheduled and event-driven jobs; payloads mirror the `events`/`event_outbox` tables, which are kept PII-minimal by design. |
| **OpenRouter** | AI model routing for the conversational assistant | Routes to upstream model providers; **does not itself guarantee EU-only inference** on non-Enterprise plans | Configured for Zero Data Retention (ZDR) and denied provider-side data collection. See "AI processing" below for the actual production upstream. |
| **OpenAI** | Upstream AI model provider (via OpenRouter) — **the production inference backend** | US-based, cross-border processing | Production model is `openai/gpt-4.1-mini`, routed through OpenRouter with ZDR + denied data collection. This is a documented cross-border transfer; system-of-record data (patient records, messages, appointments) is not stored by OpenAI — only per-turn prompt content is transmitted for inference. |
| **Meta (WhatsApp Business Platform)** | Messaging channel — inbound/outbound WhatsApp messages | Meta-operated infrastructure (not EU-exclusive) | The patient-facing communication channel; message content transits Meta's Cloud API / Business Platform per Meta's own data processing terms. |

## AI processing detail

- Development and production both route through OpenRouter (`lib/ai/`),
  which is configured to require Zero Data Retention (ZDR) and denied
  provider-side data collection on every request.
- The **production** model is `openai/gpt-4.1-mini` — OpenAI is the actual
  upstream inference provider today, and is named explicitly here (rather than
  only "whichever provider OpenRouter selects") because that is the accurate,
  current routing.
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
