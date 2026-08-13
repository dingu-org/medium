export const meta = {
  name: 'medium-prod-readiness-audit',
  description: 'Fan out independent auditors across the Medium codebase to produce a ranked production-readiness backlog',
  phases: [
    { title: 'Audit', detail: 'independent auditors, one per dimension' },
    { title: 'Synthesize', detail: 'dedupe, rank, and cut the wave plan' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'findings', 'coverage_note'],
  properties: {
    dimension: { type: 'string', minLength: 3 },
    coverage_note: {
      type: 'string',
      minLength: 80,
      description: 'What you actually read/ran, and explicitly what you could NOT check and why.',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'files', 'evidence', 'impact', 'fix_sketch', 'effort', 'externally_blocked'],
        properties: {
          title: { type: 'string', minLength: 12, maxLength: 120 },
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
          files: { type: 'array', items: { type: 'string' }, minItems: 1 },
          evidence: {
            type: 'string',
            minLength: 120,
            description: 'Concrete: quote the code or name the exact line and say what it does. No hand-waving.',
          },
          impact: {
            type: 'string',
            minLength: 80,
            description: 'What actually goes wrong in production, for whom, under what input or state.',
          },
          fix_sketch: { type: 'string', minLength: 60 },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          externally_blocked: {
            type: 'boolean',
            description: 'True only if the fix cannot be completed without an external account, credential, approval, or physical device.',
          },
        },
      },
    },
  },
}

const CONTEXT = `
Project: "Medium" — a multi-tenant SaaS that lets solo physical therapists (PTs) in Albania run
patient bookings over WhatsApp with an AI assistant, and oversee everything from a mobile-first PWA.
Repo root: ${REPO}. Read AGENTS.md and CLAUDE.md first.

Stack: Next.js 15 App Router (stable 15.5.16), TypeScript, Drizzle ORM over Supabase Postgres with
RLS, Inngest for background jobs, OpenRouter for AI inference, WhatsApp Cloud API via Meta Graph,
Serwist service worker + Web Push, POK for payments (Albania — Stripe is unavailable there),
Vercel hosting, Tailwind 4 + shadcn/ui, Vitest.

Three environments — development (local Supabase Docker), preview (own Supabase project, \`preview\`
branch), production (\`main\` branch). They never share stateful services. See CONTEXT.md for the
ubiquitous language and docs/environments.md for the mechanics.

Status: phases 0-16 are essentially code-complete. task-manager/progress.md has a status table,
a blockers list, and a long decisions log. The product is pre-launch: no real PT is onboarded yet.

There IS a prebuilt knowledge graph at .ua/knowledge-graph.json (built 2026-07-31) — you may query
it, but it predates the last two weeks of commits, so trust the code over the graph.

YOUR JOB: audit ONE dimension, hard and honestly, and report defects that would hurt a real
production launch. Rules:
- Report only what you can point at in the code. Every finding must quote or cite a real line.
- Do NOT report style opinions, hypothetical futures, or "consider adding" wishes.
- Do NOT report something as broken without checking whether a test or a guard already covers it —
  this repo has 600+ tests and several deliberate, documented trade-offs. Read the decisions log in
  task-manager/progress.md before calling something a bug; several "obvious" issues there were
  considered and consciously accepted, and re-reporting them wastes the run.
- Severity "blocker" means: a real PT or patient is harmed, data leaks across tenants, money is
  wrong, or the product cannot launch. Use it sparingly and only with proof.
- If you find nothing severe in your dimension, say so and return few findings. An honest empty
  report is worth more than padding.
- Prefer running the repo's own tooling to confirm (\`pnpm typecheck\`, \`pnpm lint\`,
  \`pnpm test\`). Do NOT run \`pnpm test:integration\` (it needs a Docker Supabase stack) and do NOT
  start dev servers, deploy, or mutate any database.
`

const DIMENSIONS = [
  {
    key: 'esu-v4',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: WhatsApp Embedded Signup v3 -> v4 migration (DEADLINE-CRITICAL).

task-manager/progress.md records a hard external deadline: **2026-10-15, Meta retires Embedded
Signup v2 and the migration target is v4.** Today is 2026-08-13. The client currently sends
\`sessionInfoVersion: '3'\` at app/(dashboard)/settings/connect-whatsapp.tsx:187.

Do this:
1. Research Meta's CURRENT official documentation for WhatsApp Embedded Signup — use WebSearch and
   WebFetch against developers.facebook.com. Find out precisely what \`sessionInfoVersion\` values
   mean, what the actual deprecation timetable is, what the v4 / latest session-info payload shape
   is, and what changes on the callback/exchange side.
   Cite the exact doc URLs you used. If Meta's docs contradict the repo's note, say so plainly —
   the repo note may be wrong or stale.
2. Read the whole signup path in this repo: the client component, the OAuth/exchange route under
   app/api/, the token storage and encryption, the coexistence handling, and anything under
   lib/channels/ that touches Graph API versions. Find every place a Graph API version string or a
   session-info version is pinned.
3. Report exactly what must change, and what breaks on 2026-10-15 if it does not.
4. Also check: is the pinned Graph API version itself near end-of-life? Meta deprecates Graph
   versions on a ~2-year cadence, and an expired version is the same class of outage.

Return findings for every concrete change required. Include one finding per distinct code change.`,
  },
  {
    key: 'failing-tests',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: known-failing tests and test-suite health.

The decisions log for 2026-08-05 says: "integration 63/64 files pass (the same 8 pre-existing
\`sendUpcomingReminderTemplate\` failures, re-verified against a clean stash baseline — unchanged
and unrelated)". Eight failing tests have been carried as "pre-existing and unrelated" — that is
exactly the kind of thing that hides a real defect before a launch.

Do this:
1. Find those tests and the code under test (search for \`sendUpcomingReminderTemplate\`, look under
   lib/reminders/, lib/channels/, and the integration test project — see vitest.config.ts for how
   the unit and integration projects are split).
2. Determine, from the code, WHY they fail. You cannot run the integration project (no Docker
   Supabase here), so diagnose statically and by running the unit project. Read the test bodies and
   the implementation and work out the actual mismatch.
3. Decide honestly: is this a broken test, or a broken implementation? Say which, with evidence.
   If the implementation is wrong, that is a production defect in the reminder path — the single
   most patient-visible feature in the product.
4. Separately: run \`pnpm test\` (the unit project only) and report anything failing, flaky, or
   skipped. Search the codebase for \`.skip\`, \`.todo\`, \`.only\` and report any test that is
   silently disabled.

Return one finding per distinct defect.`,
  },
  {
    key: 'security-tenancy',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: security and multi-tenant isolation.

This is a multi-tenant medical-adjacent product. A cross-tenant leak is existential.

Audit:
1. RLS. Read every migration under drizzle/ and every policy. For each table: is RLS enabled, and
   is there a policy that actually constrains rows to the owning PT? Look specifically for tables
   added late (billing_orders, conversation_days, pwa_mutations, push_subscriptions, cost_daily,
   erasure_archive) — late tables are where RLS is forgotten.
2. The app-layer tenancy helper in lib/tenancy/. Find every query path that bypasses it. Look hard
   at anything using a service-role / admin Supabase client, and at Inngest functions, which run
   without a user session and therefore without RLS — every one of them is a place where tenant
   scoping must be explicit in the query.
3. Server Actions: every one is a public HTTP endpoint. Check authentication and authorization on
   each, and check that IDs coming from the client are re-scoped to the caller's PT rather than
   trusted. Look under lib/actions/ and any \`'use server'\` file.
4. API routes under app/api/: the WhatsApp webhook (signature verification — is it constant-time?
   is it enforced in every environment?), the Meta OAuth callback (state/CSRF), the POK payment
   webhook (signature/authenticity — an unauthenticated payment webhook means free subscriptions),
   the Inngest route, and the admin surface (gated on ADMIN_EMAILS — check how).
5. Secrets: token encryption at rest, key rotation, whether any secret can reach a client bundle
   (anything \`NEXT_PUBLIC_\`), and whether tokens or endpoints can reach logs. lib/log.ts claims
   redaction — verify the redaction actually covers what it claims.
6. middleware.ts: what it protects and what it does not.

Report proven holes only, with the exact file and line.`,
  },
  {
    key: 'billing',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: billing, entitlements, and metering correctness (Phase 16).

Money being wrong is a launch blocker. Read task-manager/phases/16-monetization.md first — it
records the invariants and several explicit warnings.

Audit lib/billing/ (plans.ts, entitlements.ts, usage.ts, payments.ts and neighbours), the POK
webhook route, the reconcile and renewal-monitor Inngest crons, and the /settings/billing UI.

Specifically:
1. The \`ALL_MINOR_FACTOR = 100\` marked UNCONFIRMED with a \`TODO(spike)\` — trace every place an
   amount is converted, compared, or displayed. If the factor is wrong, what exactly breaks, and is
   there anywhere the wrong factor could cause a real charge or a wrong entitlement rather than
   just a wrong display? \`LIVE_PAYMENTS_ENABLED=false\` supposedly gates checkout — verify that
   gate is airtight and covers every path to a charge.
2. The Meta rate card: marketing/authentication rates ship as €0 \`⚠ CONFIRM\` placeholders. Trace
   what consumes them. Does a €0 rate silently make COGS look free, or corrupt a cap/limit
   decision? Distinguish "wrong dashboard number" from "wrong product behaviour".
3. Conversation metering: a conversation is an active patient-day in the PT's timezone, counted via
   \`conversation_days\`. Check the timezone handling at day boundaries, and check idempotency —
   can one patient-day be double-counted, or missed, under retries or concurrent messages?
4. The cap: hard stop at 100% with one static handoff message; PT inbox and manual chat must NEVER
   be blocked; capped reminders flag the appointment; nothing fails silently. Verify each clause.
5. Renewal, grace, downgrade: downgrade must delete nothing; services beyond the limit deactivate
   (oldest active stays); retention clamps after a 30-day grace. Verify the ordering and check what
   happens if a cron misses a run or runs twice.
6. \`BILLING_PLAN_OVERRIDES\` — the 2026-08-05 decisions-log entry says this env override can still
   reintroduce the reasoning/\`maxOutputTokens\` pairing that caused a live production outage, and
   that a load-time guard was "considered and deliberately not built". Assess that residual risk
   concretely and propose the guard.

Report one finding per distinct defect.`,
  },
  {
    key: 'reliability',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: reliability of the message pipeline and background jobs.

The core loop is: Meta webhook -> insert + enqueue -> Inngest -> AI turn -> outbound WhatsApp send.
Meta requires the webhook to answer in under 20s. Failures here are patient-visible.

Audit:
1. app/api/ WhatsApp webhook: is it genuinely small and synchronous? What happens if the enqueue
   fails after the DB insert, or the insert fails after Meta considers it delivered? Is inbound
   message handling idempotent against Meta's at-least-once redelivery?
2. lib/inngest/ — every function. For each: retry policy, idempotency key, what happens on partial
   failure mid-function, and whether a retried step can double-send a WhatsApp message or
   double-book an appointment. Inngest steps are memoized on retry — check that side effects are
   inside \`step.run\` and not in the function body where a retry would re-execute them.
3. The outbox: durable delivery of domain events. Check ordering guarantees, poison-message
   handling (does one permanently failing row block the queue?), and whether anything can sit in
   the outbox forever with no alarm.
4. The AI turn: concurrent-turn serialization, reply idempotency, and the failure handoff. The
   2026-08-05 outage shows the failure path is real — when the model returns nothing, the patient
   gets a technical-failure message and the thread escalates. Is every failure mode routed to a
   human, and can any failure mode leave the patient with silence?
5. Appointment booking: transactional correctness. Two patients racing for the last slot — what
   actually prevents a double-book? Point at the constraint or the lock, not at the intent.
6. Reminders: the 24h reminder scheduling, and what happens when an appointment moves or is
   cancelled after a reminder is scheduled. The decisions log says cancellation cancels scheduled
   reminders in-transaction — verify it, including for reschedule.
7. External-call resilience: timeouts, retries, and circuit-breaking on Graph API, OpenRouter, and
   POK. An unbounded fetch with no timeout inside a webhook path is a finding.

Report one finding per distinct defect.`,
  },
  {
    key: 'observability',
    model: 'sonnet',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: observability and operability.

Context that matters: on 2026-08-05 a live production outage (every AI turn failing, patients
getting a technical-failure message) had to be diagnosed from a *reconstructed request body*
because production logs showed only \`tokensOut: [REDACTED]\`. The redaction was too aggressive and
the logs did not carry \`finishReason\` or \`reasoningTokens\`. That is the failure mode to hunt.

Audit:
1. lib/log.ts: the redaction allowlist. Find fields that are redacted but are not actually secret
   and whose absence would blind an operator (token COUNTS are not secrets; token VALUES are).
   Find the inverse too: anything genuinely sensitive that is NOT redacted.
2. Coverage: which failure paths log nothing at all? Walk the Inngest functions, the webhook, the
   outbox, the push dispatcher, and the payment webhook, and find catch blocks that swallow.
3. Alerting: is there ANY mechanism that would tell the operator that production is broken, other
   than a patient complaining? Sentry is wired (instrumentation.ts) — check what actually reports
   to it, whether server-side errors in Inngest reach it, and whether there are alerts vs just
   passive capture. The 2026-08-05 outage failed three Inngest attempts per message, repeatedly —
   would anything have paged?
4. The /admin metrics surface: are the numbers it shows actually correct, and is it gated safely?
5. Correlation: \`traceId\` is described as "optional, propagated webhook -> Inngest". Find where
   the chain breaks.
6. docs/runbook.md: read it and judge whether an operator could actually use it during an incident.
   Report concrete gaps, not vibes.

Report one finding per distinct gap.`,
  },
  {
    key: 'performance',
    model: 'sonnet',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: performance and Core Web Vitals.

Target users are solo PTs in Albania on mid-range Android phones over mobile data. The app is a
PWA. Past Lighthouse mobile runs scored 100/100 signed-in, but that predates Phases 14-16.

Audit statically (do NOT start a dev server or run Lighthouse):
1. Bundle: find client components that should be server components. Look for \`'use client'\` at the
   top of large trees, heavy imports pulled into client bundles (date libraries, icon sets, chart
   code), and anything importing from a barrel file that defeats tree-shaking. Run \`pnpm build\`
   and read the route-size table it prints — report the routes with the largest First Load JS and
   what is in them.
2. Data fetching: N+1 queries, sequential awaits that should be parallel, and queries missing an
   index. Cross-check hot query shapes against the indexes actually declared in drizzle/ migrations
   — a query filtering on a column with no index is a real finding on a growing table.
3. Rendering: any route accidentally forced dynamic that could be static or cached; \`await\` in a
   layout that blocks every child; missing Suspense boundaries around slow data.
4. Realtime: the Supabase realtime hooks — check for subscription leaks, re-subscribe storms, and
   whether they are lazily loaded as claimed.
5. Images and fonts: next/image usage, and how Manrope is loaded (a non-\`next/font\` webfont is a
   CLS and LCP finding).
6. The service worker: caching strategy correctness, and whether a stale precache can pin users to
   an old build after a deploy.

Report one finding per distinct issue, with the file and what to change.`,
  },
  {
    key: 'accessibility',
    model: 'sonnet',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: accessibility and mobile UX correctness.

The UI is Albanian-only, mobile-first, shadcn/ui + Tailwind 4, re-skinned in Phase 14 to a custom
visual language (Manrope, royal blue #3B5BFE, borderless cards, a black pill dock) and again in
Phase 15 for settings. Custom re-skins are exactly where semantics get replaced by divs.

Audit the components under app/(dashboard)/ and components/:
1. Interactive elements that are not buttons/links: \`onClick\` on a \`div\` or \`span\` with no role,
   no tabIndex, and no key handler. The pill dock and the FAB are prime suspects.
2. Forms: inputs without labels, error messages not associated via aria-describedby, and required
   fields with no programmatic indication. The onboarding flow and the availability editor matter
   most — a PT cannot use the product without completing them.
3. Dialogs and sheets: focus trapping, focus restoration, escape handling, and whether the
   appointment detail sheet and the settings sub-screens announce themselves.
4. Colour contrast: check the actual token values in app/globals.css against WCAG AA (4.5:1 for
   body text, 3:1 for large text and UI boundaries). Compute the ratios — do not eyeball them.
   Check both light and dark if dark exists.
5. Live regions: the chat thread, the sync indicator, and the notification bell — does a screen
   reader learn that something arrived?
6. Touch targets under 44x44 CSS px.
7. Language: is \`<html lang>\` set to Albanian? A wrong lang attribute makes every screen reader
   mispronounce the entire product.

Report one finding per distinct issue, with the file and the fix.`,
  },
  {
    key: 'test-coverage',
    model: 'sonnet',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: test coverage gaps that matter.

The repo has ~600+ tests across unit and integration projects (see vitest.config.ts). Volume is not
the question — the question is whether the tests cover the paths where a production failure would
actually hurt, and whether they would have caught the failures this project has already had.

Do this:
1. Read the decisions log in task-manager/progress.md and pick out the real defects that reached
   production or near-production (the 2026-08-05 reasoning/maxOutputTokens outage, the duplicate
   patient-message bug from 2026-08-01, the 60 defects from the 2026-07-30 audit). For each, ask:
   does a test now exist that would catch a regression? Name the test or report its absence.
2. Map the critical paths and find the untested ones: money (POK webhook, entitlement changes,
   cap enforcement), tenant isolation, the booking transaction under concurrency, reminder
   scheduling/cancellation, token encryption and rotation, GDPR erasure cascade, and the webhook
   signature check.
3. Find tests that assert nothing meaningful — tests that mock the unit under test, assert only
   that a function was called, or would pass if the implementation were deleted. Report the worst
   offenders specifically; do not editorialise about testing philosophy.
4. Check the integration/unit split: is anything critical only covered in the integration project,
   which cannot run without Docker and therefore does not run in practice? There is no CI in this
   repo, so a test that needs Docker is a test that mostly does not run.

Report one finding per distinct gap, prioritised by what would actually break.`,
  },
  {
    key: 'prod-config',
    model: 'opus',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: production configuration, deployment, and launch readiness of the infrastructure.

Audit:
1. lib/env/ and scripts/check-env.ts: the fail-closed environment guard. Does it actually cover
   every variable the code reads at runtime? Find any \`process.env.X\` read anywhere in the repo
   that is NOT in the env contract — that is a variable that can be missing in production and fail
   at request time instead of boot time, which defeats the whole fail-closed design.
2. Migration state: scripts/check-migrations.ts and scripts/verify-schema.ts. Is production's
   schema knowably in sync? Migrations 0020, 0021, 0022 were added for Phase 16 — progress.md
   records several as "applied to hosted dev" but I need to know what is claimed for PRODUCTION.
   Report what is unverifiable from here and exactly what command would verify it.
3. vercel.json, next.config.ts, middleware.ts: security headers (HSTS is claimed — verify CSP,
   X-Frame-Options, Referrer-Policy, Permissions-Policy), function region (must be EU for GDPR),
   function timeouts vs Meta's 20s webhook requirement, and cron definitions.
4. Inngest: the production environment's function registration and signing keys, and whether a
   deploy can leave functions unregistered silently.
5. Backups and recovery: is there any documented or configured backup of the production Supabase
   project, and a tested restore path? For a medical-adjacent product this is a launch gate.
6. Rate limiting and abuse: the webhook and any public endpoint. Vercel BotID/WAF is available and
   unused as far as I know — assess whether an unauthenticated endpoint can be abused to burn
   OpenRouter or Meta spend.
7. \`.env.example\` vs \`.env\` vs the Vercel-pulled files: drift, and any secret that appears to be
   committed. Check git history for leaked secrets too.

Report one finding per distinct gap.`,
  },
  {
    key: 'gdpr',
    model: 'sonnet',
    effort: 'high',
    prompt: `${CONTEXT}

DIMENSION: GDPR, privacy, and legal readiness.

The product handles health-adjacent personal data about patients in the EU, on behalf of PTs. The
PT is the controller; Medium is the processor. Phase 10 is marked complete — verify it rather than
trusting it. Read docs/gdpr/ and the legal pages under app/(legal)/.

Audit:
1. Erasure: \`erasePatient\` cascade — walk every table that stores patient data and confirm each is
   covered. Find any table added AFTER Phase 10 shipped (Phase 16 added conversation_days,
   billing_orders; Phase 9 added push_subscriptions) and check whether the cascade knows about it.
   A table added after the erasure function is written is the classic GDPR hole.
2. Retention: the retention job — what it deletes, on what clock, and whether it can run twice or
   miss. Check that WhatsApp message content actually ages out.
3. Export/DSAR: completeness of the export against the same table walk.
4. Data residency: Supabase EU is claimed. OpenRouter is acknowledged as possibly routing outside
   the EU, accepted for MVP with disclosures — verify the disclosure actually exists in the privacy
   policy and names the subprocessors, and verify the ZDR / data_collection:deny settings are
   actually sent on every request including the fallback model path.
5. Consent and lawful basis: patient re-opt-in, the STOP opt-out, and whether a patient who never
   consented can be messaged. Check the first-contact path specifically.
6. The legal pages: task-manager/phases/16-monetization.md says ToS/privacy edits are "DRAFT
   (English, pending sign-off)" while the product is Albanian-only. Report the concrete state: are
   the live legal pages Albanian, are they consistent with what the code does, and do they cover
   payments/subscriptions at all?
7. Audit log: what is recorded, whether it is tamper-evident, and whether it itself leaks personal
   data.

Report one finding per distinct gap.`,
  },
]

phase('Audit')
const reports = await parallel(
  DIMENSIONS.map((d) => () =>
    agent(d.prompt, {
      label: `audit:${d.key}`,
      phase: 'Audit',
      schema: FINDING_SCHEMA,
      model: d.model,
      effort: d.effort,
    }),
  ),
)

const good = reports.filter(Boolean)
const all = good.flatMap((r) => (r.findings || []).map((f) => ({ ...f, dimension: r.dimension })))
log(`${good.length}/${DIMENSIONS.length} auditors reported; ${all.length} raw findings`)

phase('Synthesize')
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blockers', 'waves', 'dropped', 'headline'],
  properties: {
    headline: {
      type: 'string',
      minLength: 200,
      description: 'Straight answer to: how far is this from production, and what is genuinely in the way?',
    },
    blockers: {
      type: 'array',
      description: 'Findings that must be fixed before a first real PT goes live.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'dimension', 'severity', 'files', 'why_blocker', 'fix_sketch', 'effort', 'externally_blocked'],
        properties: {
          title: { type: 'string', minLength: 12 },
          dimension: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
          files: { type: 'array', items: { type: 'string' }, minItems: 1 },
          why_blocker: { type: 'string', minLength: 80 },
          fix_sketch: { type: 'string', minLength: 60 },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          externally_blocked: { type: 'boolean' },
        },
      },
    },
    waves: {
      type: 'array',
      minItems: 3,
      description: 'Ordered implementation waves. Each wave must be independently shippable and verifiable.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['wave', 'title', 'rationale', 'items'],
        properties: {
          wave: { type: 'integer' },
          title: { type: 'string', minLength: 8 },
          rationale: { type: 'string', minLength: 80 },
          items: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'files', 'what_to_do', 'how_to_verify', 'effort'],
              properties: {
                title: { type: 'string', minLength: 12 },
                files: { type: 'array', items: { type: 'string' }, minItems: 1 },
                what_to_do: { type: 'string', minLength: 100 },
                how_to_verify: { type: 'string', minLength: 60 },
                effort: { type: 'string', enum: ['S', 'M', 'L'] },
              },
            },
          },
        },
      },
    },
    dropped: {
      type: 'array',
      description: 'Findings you deliberately rejected, with the reason. Be specific — this is the audit trail.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'reason'],
        properties: {
          title: { type: 'string' },
          reason: { type: 'string', minLength: 40 },
        },
      },
    },
  },
}

const synthesis = await agent(
  `${CONTEXT}

You are the technical lead. ${DIMENSIONS.length} independent auditors just swept this codebase.
Below are their raw findings as JSON. Your job is to turn them into a plan someone can execute.

RAW FINDINGS:
${JSON.stringify(good, null, 1)}

Do this, in order:

1. VERIFY BEFORE YOU TRUST. The auditors worked in isolation and some will be wrong. For every
   finding you intend to promote to "blocker", open the cited file and confirm the claim yourself.
   Read task-manager/progress.md's decisions log — this project has consciously accepted several
   trade-offs, and re-litigating a documented decision is a waste. Drop anything you cannot confirm,
   and record it in \`dropped\` with the reason.

2. DEDUPE. Several auditors will have found the same thing from different angles (e.g. the
   reasoning/maxOutputTokens risk will show up under billing, reliability, and observability).
   Merge them into one item that names all the affected files.

3. RANK. \`blockers\` = must be fixed before a first real PT goes live. Be strict: this is a
   pre-launch product with no users yet, so "no users are currently harmed" is never the test —
   the test is "would this harm the first real PT or their patients". Note that a deadline
   (Embedded Signup, 2026-10-15) is a blocker for the business even if the code works today.

4. SEQUENCE into waves. The operator's stated wave plan is:
     1) deadline-critical + known defects   2) security/tenancy/GDPR
     3) reliability + observability          4) performance + accessibility
     5) launch-readiness dossier
   Follow that shape unless the findings genuinely argue otherwise — if they do, say so in the
   rationale and reorder. Within each wave, order items so that independent ones can run in
   parallel and dependent ones are sequenced. Every item needs a concrete \`how_to_verify\` using
   this repo's actual tooling (\`pnpm typecheck\`, \`pnpm lint\`, \`pnpm test\`, \`pnpm build\`,
   \`pnpm test:integration\` where Docker is available).

5. SEPARATE externally-blocked work. Items needing Meta Business Verification, POK credentials, a
   physical device, or a real PT cannot be finished here — but the CODE for them usually can be.
   Mark them \`externally_blocked: true\` and describe the part that CAN be built now.

6. Write \`headline\` as a straight, unhedged answer: how far is this product from production, and
   what is actually in the way? The reader is the product owner. No cheerleading, no padding.`,
  { label: 'synthesize:plan', phase: 'Synthesize', schema: PLAN_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { raw: good, plan: synthesis }
