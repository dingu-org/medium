# Medium — project plan

A phased build plan for shipping the Medium MVP: one solo PT per account, WhatsApp-only, AI handles bookings, PT oversees from a PWA.

> Source of truth: `docs/tech-stack-and-architecture.md`. Every phase below maps to one or more sections of that doc; references are noted inline.

---

## Constraints recap

- **Solo dev, 2–3 h/day, ~€100/mo budget** → favour managed services and velocity over premature optimisation.
- **Multi-tenant from day one** → RLS + tenancy helpers from Phase 1.
- **Channel-agnostic engine** → adapter pattern; WhatsApp is the first adapter, not the only one assumed.
- **Webhook responds in <20 s** → all real work goes to Inngest.
- **GDPR / EU residency** → Supabase EU, encrypted tokens, retention job, audit log.
- **PWA (not native)** → installable, offline-read, Web Push.

---

## Build sequence

Work the phases in order. Acceptance criteria for each phase must be green before starting the next, except where noted that two phases can run in parallel.

| # | Phase | Outcome | Rough effort | Depends on |
|---|---|---|---|---|
| 0 | [Bootstrap](phases/00-bootstrap.md) | Next.js skeleton + accounts + first preview deploy | 1–2 days | — |
| 1 | [Foundation](phases/01-foundation.md) | Schema, RLS, tenancy helpers, PT auth | 4–5 days | 0 |
| 2 | [WhatsApp integration](phases/02-whatsapp-integration.md) | Embedded Signup, webhook, channel adapter | 5–7 days | 1 |
| 3 | [AI conversation engine](phases/03-ai-conversation-engine.md) | OpenRouter-routed Claude turns with tools, prompt caching, Haiku→Sonnet escalation | 4–5 days | 1 (can overlap with 2) |
| 4 | [Appointments & availability](phases/04-appointments-availability.md) | Availability resolver, transactional booking, state machine, domain events | 3–4 days | 1 (can overlap with 2/3) |
| 5 | [Background jobs](phases/05-background-jobs.md) | Inngest functions wired to events; inbound message → AI → outbound | 3–4 days | 2, 3, 4 |
| 6 | [Reminders system](phases/06-reminders-system.md) | 24 h reminder, template lifecycle, CONFIRM/CANCEL/RESCHEDULE | 2–3 days | 5 |
| 7 | [PT PWA UI](phases/07-pt-pwa-ui.md) | Calendar, chat, availability, settings, onboarding | 7–10 days | 1 (can overlap with 2–6) |
| 8 | [PWA features](phases/08-pwa-features.md) | Manifest, Serwist service worker, offline read, install prompt | 3–4 days | 7 |
| 9 | [Notifications](phases/09-notifications.md) | Web Push for booking / cancel / reschedule / escalation | 1–2 days | 7 |
| 10 | [GDPR & security](phases/10-gdpr-security.md) | Retention job, erasure cascade, export, audit-log polish | 2–3 days | 1 (can overlap throughout) |
| 11 | [Observability](phases/11-observability.md) | Sentry, structured logs, PostHog funnels, cost dashboards | 2–3 days | 0 (can overlap throughout) |
| 12 | [Pre-launch](phases/12-pre-launch.md) | Seed script, end-to-end smoke test, first real-PT onboarding | 3–5 days | 6, 7, 8, 9, 10, 11 |

**Total: ~40–57 working days.** At 2–3 h/day ≈ **3–5 calendar months** to a real-PT MVP.

### Suggested parallelism

A solo dev can't really parallelise, but the dependency graph has a few "pick what you feel like today" beats:

- After Phase 1, **Phase 7 (UI)** can be developed against fixtures while Phases 2–6 (backend) progress. Use whichever you have the energy for.
- **Phase 11 (Observability)** is best added incrementally as features ship — Sentry from Phase 0, structured logs from Phase 5, PostHog from Phase 7. The dedicated phase is for polish + dashboards.
- **Phase 10 (GDPR)** has small obligations sprinkled across earlier phases (audit log writes from Phase 1, encryption from Phase 2). The dedicated phase is for retention, erasure, export.

---

## MVP cut line (from tech-doc §13)

**In MVP — must ship:**

- Direct WhatsApp Cloud API + Embedded Signup, single PT per account.
- AI handles booking, reschedule, cancel, escalate — WhatsApp only.
- PWA: calendar (week + month), appointment detail, chat, manual takeover, availability, settings.
- 24 h reminder with CONFIRM / CANCEL / RESCHEDULE.
- Web Push for new booking, cancellation, reschedule, escalation.
- GDPR baseline: EU region, token encryption, retention job, per-patient erasure, audit log.
- Basic observability: Sentry + logs + a couple of dashboards.

**Deferred (architectural seams already in place):**

Instagram/SMS channels, waitlist, multi-location, recurring appointments, service-type pricing, team scheduling, analytics dashboards, patient-facing portal, EMR integrations. Each lands as an adapter, an event subscriber, or an additive table — not a rewrite.

---

## Definition of "MVP done"

> One real PT connects via Embedded Signup, receives a real patient message on WhatsApp, the AI books an appointment, the PT sees it in their PWA, the 24 h reminder fires, and the patient confirms — all with no manual intervention from the developer.

This is the goal of [Phase 12](phases/12-pre-launch.md).

---

## Risks tracked at the program level

| Risk | Mitigation | Phase |
|---|---|---|
| Vercel cold start approaches Meta's 20 s webhook limit | Webhook handler is small + synchronous (verify, insert, enqueue, return 200). Move to Fly.io always-on if observed. | 2, 5 |
| Inngest free tier outgrown | Free tier covers far more than 3 PTs; upgrade if needed. | 5, 6 |
| Supabase lock-in | Plain Postgres + Drizzle + RLS in SQL. Migration would be work, not a rewrite. | 1 |
| Embedded Signup failure modes (rejection, duplicate number, abandoned) | Per-state UI per `medium-canvas/documents/whatsapp-cloud-api-architecture.md §9`. | 2 |
| Token revocation in production | Channel adapter catches Graph API auth errors, flags PT dashboard "Reconnect WhatsApp". | 2, 7 |
| Template rejected by Meta | Fallback variant + auto-resubmit; surface status in dashboard. | 6 |
| AI cost overruns | OpenRouter usage accounting and dashboard checks; default model is Haiku; cache static prompt sections. | 3, 11 |
| OpenRouter may route AI inference outside the EU on non-Enterprise plans | Accept for MVP with minimized prompt content, ZDR/data-collection-deny defaults, and explicit privacy/subprocessor disclosures. | 3, 10 |
| GDPR slip (cross-tenant leak) | RLS as DB-layer backstop + tenancy helper as app-layer guardrail; both required. | 1, 10 |

---

## How to update this plan

The plan is a working artefact, not a contract. When reality diverges:

1. Update the affected phase file (tasks, acceptance criteria).
2. If a phase's scope changes materially, note it in `progress.md` under "Decisions".
3. If a new risk surfaces, add it to the table above.
4. If a phase ends up not needed, mark it skipped in `progress.md` with the reason.

Keep the source-of-truth tech doc in sync if structural decisions shift — but do that explicitly, not implicitly.
