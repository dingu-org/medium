export const meta = {
  name: 'medium-audit-verification',
  description: 'Adversarially verify the 2026-08-13 audit claims, recover the lost prod-config dimension, and cut a ranked wave plan',
  phases: [
    { title: 'Verify', detail: 'refute-first verification of every blocker/high claim' },
    { title: 'Recover', detail: 'the lost prod-config auditor + an independent security second opinion' },
    { title: 'Plan', detail: 'rank the survivors into executable waves' },
  ],
}

const REPO = '/Users/kd/Projects/personal/medium'
const REPORT = 'task-manager/audits/2026-08-13-production-readiness.md'

const CONTEXT = `
Project "Medium": multi-tenant SaaS letting solo physical therapists in Albania run patient
bookings over WhatsApp with an AI assistant, overseen from a mobile-first PWA. Repo: ${REPO}.
Read AGENTS.md first. Pre-launch — no real PT is onboarded yet.

Stack: Next.js 15 App Router, TypeScript, Drizzle over Supabase Postgres with RLS, Inngest for
background jobs, OpenRouter for inference, WhatsApp Cloud API via Meta Graph, Serwist + Web Push,
POK for payments (Albania — no Stripe), Vercel, Tailwind 4 + shadcn/ui, Vitest.

**Docker and the local Supabase stack ARE running**, so \`pnpm test:integration\` works here. So do
\`pnpm test\`, \`pnpm typecheck\`, \`pnpm lint\`, \`pnpm build\`. Do NOT start dev servers, deploy,
or touch any hosted database.

Known-true baseline, established by the orchestrator by actually running the suite — do not
re-derive or contradict this without strong evidence:
- \`pnpm test:integration\` on a clean local DB gives 1 failing file / 8 failing tests, all in
  \`app/(dashboard)/chat/__tests__/actions.integration.test.ts\` under \`sendUpcomingReminderTemplate\`.
- Cause is a stale fixture: the appointment is hardcoded at \`2026-08-01T09:00:00.000Z\` and today is
  later, so the action correctly returns "Nuk ka takim të ardhshëm" and downstream assertions die on
  undefined. It is a test bug, NOT an implementation bug.
- 27 test files hardcode absolute dates; exactly 1 freezes the clock.
- There is no CI (\`.github/\` does not exist) and the Husky pre-commit hook runs only lint +
  typecheck, never tests.
`

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['group', 'verdicts'],
  properties: {
    group: { type: 'string' },
    verdicts: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'verdict', 'proof', 'corrected_severity', 'real_fix', 'effort'],
        properties: {
          claim: { type: 'string', minLength: 10 },
          verdict: {
            type: 'string',
            enum: ['CONFIRMED', 'PARTIALLY_TRUE', 'REFUTED', 'ALREADY_HANDLED'],
            description: 'ALREADY_HANDLED = real in principle but an existing guard, test or documented decision covers it.',
          },
          proof: {
            type: 'string',
            minLength: 150,
            description: 'The file, the line, and what the code actually does. Quote it. For REFUTED, show the code that disproves the claim. For CONFIRMED, show the code that proves it AND state what you checked that could have disproved it.',
          },
          corrected_severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low', 'none'] },
          real_fix: { type: 'string', minLength: 80 },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          externally_blocked: { type: 'boolean' },
        },
      },
    },
  },
}

const refuteRules = `
YOU ARE A SKEPTIC, NOT A REVIEWER. Your default answer is REFUTED. An auditor working alone made
these claims and did not verify them. Your job is to try to DISPROVE each one.

For every claim:
1. Open the cited files and read the actual code. Never reason from the claim's own summary.
2. Look for the thing that would make the claim WRONG: an existing guard, an early return, a
   database constraint, a test that already covers it, a caller that never passes that input, a
   deliberate decision recorded in the decisions log of task-manager/progress.md.
3. Only answer CONFIRMED if you looked for those and did not find them. Say in \`proof\` what you
   checked that could have disproved it — a CONFIRMED with no disproof attempt is worthless.
4. If it is real but the severity is inflated, use PARTIALLY_TRUE and correct the severity. Auditors
   overstate. "This could theoretically break" is not a blocker.
5. If a documented decision already accepted this trade-off, that is ALREADY_HANDLED — quote the
   decision.
6. Where you can settle it by running something (a test, a typecheck, a build, a grep), run it.
   Evidence beats argument.

\`real_fix\` must describe what you would actually change, given what the code really does — not the
auditor's guess.
`

const GROUPS = [
  {
    key: 'safety-billing',
    model: 'opus',
    effort: 'xhigh',
    title: 'Safety escalation vs the billing cap, and the model-config regression risk',
    claims: [
      '[BLOCKER] Conversation cap silently disables safety escalation for the patient (lib/inngest/functions/handle-inbound-message.ts, lib/conversation/engine.ts, lib/billing/cap-handoff.ts)',
      '[HIGH] BILLING_PLAN_OVERRIDES can re-arm the reasoning/maxOutputTokens outage with no load-time guard (lib/billing/plans.ts, lib/ai/models.ts, lib/ai/client.ts)',
    ],
    extra: `
This group is the most important in the run. Claim 1 says a COMMERCIAL limit suppresses a SAFETY
path — if true it is the worst defect this product can have, and if false I need to know that just
as clearly, because I will otherwise spend a wave on a phantom.

Trace it precisely: follow an inbound message from handle-inbound-message through the cap gate to
the point where safety escalation would fire. Determine whether the cap check happens BEFORE or
AFTER the safety/escalation decision, and whether a capped conversation can still escalate to the
human PT. Read lib/billing/cap-handoff.ts fully. Then read the Phase 16 invariants in
task-manager/phases/16-monetization.md — they explicitly require that the PT inbox and manual chat
are never blocked and that nothing fails silently. Say whether the code honours that.

For claim 2, read the 2026-08-05 entry in the decisions log first. It states the residual risk was
considered and a load-time guard "deliberately not built". That makes ALREADY_HANDLED plausible —
but assess whether the deliberate acceptance is still correct given the override path really can
reintroduce a live outage. Recommend the guard only if you can show the override path is reachable.`,
  },
  {
    key: 'esu-meta',
    model: 'opus',
    effort: 'xhigh',
    title: 'WhatsApp Embedded Signup version state (hard Meta cutoff 2026-10-15)',
    claims: [
      "[BLOCKER] Signup client sends Meta's documented v2 `extras` shape plus the non-auto-upgradable `coex` feature type (app/(dashboard)/settings/connect-whatsapp.tsx)",
      '[BLOCKER] NEXT_PUBLIC_META_CONFIG_ID still resolves to a v2 Login configuration and is build-time inlined',
      '[BLOCKER] Connection mode is hardcoded `coexistence`; the FINISH event discriminator is captured then discarded (app/api/auth/meta-embedded/route.ts, lib/inngest/functions/sync-whatsapp-coexistence.ts)',
    ],
    extra: `
The tracker says the client sends \`sessionInfoVersion: '3'\` and that the migration target is v4 by
2026-10-15. The auditor claims the payload is actually still Meta's **v2** shape, which would make
this a larger migration than the tracker implies.

Settle it against Meta's CURRENT documentation — use WebSearch and WebFetch on
developers.facebook.com. Establish what sessionInfoVersion values exist today, what each payload
shape is, what the real deprecation timetable is, and what \`coex\` / coexistence requires. Cite exact
doc URLs. If Meta's docs contradict the repo's note, say so — the note may be stale.

Also check whether the pinned Graph API version is near end-of-life; an expired Graph version is the
same class of outage as an expired signup version.

Be careful to separate: (a) what breaks on 2026-10-15 if untouched, (b) what needs a change in the
Meta App dashboard that only the operator can make, and (c) what is purely a code change.`,
  },
  {
    key: 'observability',
    model: 'opus',
    effort: 'high',
    title: 'Log redaction, alerting, and background-job silence',
    claims: [
      '[BLOCKER] The exact outage-causing redaction bug is still live: tokensOut/tokensIn/reasoningTokens/cachedTokens are redacted (lib/log.ts, lib/conversation/engine.ts)',
      '[HIGH] No active alerting exists; the only monitoring is manual periodic human inspection of logs (docs/runbook.md, instrumentation.ts)',
      '[HIGH] Most background Inngest functions (reminders, billing, purge, resume) emit zero structured logs',
    ],
    extra: `
Context: on 2026-08-05 a production outage had to be diagnosed from a reconstructed request body
because logs showed only \`tokensOut: [REDACTED]\`. The first claim says that redaction is still in
place. Read lib/log.ts and determine exactly which keys are redacted and by what rule (exact match?
substring? allowlist?). Token COUNTS are not secrets; token VALUES are. If the rule redacts by a
substring like "token", say so precisely and list what else it catches collaterally.

For alerting, be concrete rather than philosophical: would ANY mechanism have told the operator that
every AI turn was failing on 2026-08-05? Check what instrumentation.ts actually initialises, whether
Inngest function failures reach Sentry, and whether Sentry is configured to alert or merely to
capture.`,
  },
  {
    key: 'reliability-consent',
    model: 'opus',
    effort: 'xhigh',
    title: 'Non-text inbound messages, and the consent gate for first contact',
    claims: [
      '[HIGH] A non-text inbound (voice note, photo) leaves the patient in silence and is invisible to the PT (app/api/webhooks/whatsapp/route.ts, lib/inngest/functions/handle-inbound-message.ts)',
      '[HIGH] Any inbound WhatsApp sender becomes an AI-processed patient with no consent gate (app/api/webhooks/whatsapp/route.ts, lib/db/schema.ts)',
    ],
    extra: `
Claim 1 matters disproportionately: WhatsApp users send voice notes constantly, so if a voice note
is dropped silently this will be hit within days of real use. Trace an inbound webhook payload whose
message type is \`audio\`, \`image\`, \`document\`, \`sticker\`, \`location\` or \`contacts\` all
the way through. Determine exactly what happens: is it persisted, does the PT see it in the inbox,
does the patient get any reply, does anything escalate? Distinguish "unhandled and silent" from
"handled with a fallback message" — those are very different severities. Check the real Meta webhook
payload shape rather than assuming.

Claim 2 is a GDPR/consent question. Establish what actually happens on first contact from an unknown
number: is a patient row created, is the message sent to the model, is there any opt-in? Then check
whether that is genuinely unlawful or whether legitimate-interest/contract basis plus the existing
STOP opt-out and re-opt-in flow covers it. Read docs/gdpr/ and the privacy page before ruling. Do not
give a legal opinion beyond what the code and the existing docs support — say what the code does and
where it diverges from what the privacy policy claims.`,
  },
  {
    key: 'tests-ci',
    model: 'sonnet',
    effort: 'high',
    title: 'Docker-gated safety nets and the absent CI',
    claims: [
      '[BLOCKER] Tenant-isolation/RLS write-open regression suite only runs under Docker, never automatically (tests/rls/*.integration.test.ts)',
      '[HIGH] Duplicate-message regression test (the 2026-08-01 bug) only runs in Docker-gated integration tests',
      '[HIGH] POK 404-vs-expired money-correctness fix has no unit test, only Docker-gated integration coverage',
    ],
    extra: `
All three reduce to: the tests that guard the most dangerous failures only run when a human happens
to run them with Docker up. Verify the premise by checking vitest.config.ts for how the unit and
integration projects are split, then confirm each named test really is in the integration project.

Then judge the actual fix. Options are (a) add CI that runs the integration project with a Supabase
service container, (b) move some assertions into the unit project with mocks, (c) both. Recommend
one and say why — noting that this repo has no CI at all today, so introducing it is itself a piece
of work with a cost. Be concrete about what a GitHub Actions workflow would need for this repo
(services, env vars, migration step, how long it would take to run).`,
  },
  {
    key: 'frontend',
    model: 'sonnet',
    effort: 'high',
    title: 'Contrast token and auth-page bundle weight',
    claims: [
      '[HIGH] --ink-3 text token fails WCAG AA contrast for body text across the whole re-skinned UI (app/globals.css)',
      '[HIGH] Sign-in/sign-up statically import the full Supabase client, making auth pages the heaviest bundles in the app (app/(auth)/**)',
    ],
    extra: `
For the contrast claim, read the real token values in app/globals.css and COMPUTE the WCAG contrast
ratios against the actual backgrounds the token is used on — do not eyeball, do not trust the
auditor's arithmetic. Report the numbers. Check where --ink-3 is actually applied: if it is only
used for large text or non-text UI, the 4.5:1 threshold does not apply and the severity drops. Check
dark mode too if it exists.

For the bundle claim, run \`pnpm build\` and read the printed route-size table. Report the actual
First Load JS for the auth routes versus the rest of the app. A claim that they are "the heaviest in
the app" is checkable — check it, and give the numbers.`,
  },
]

phase('Verify')
const verifyThunks = GROUPS.map((g) => () =>
  agent(
    `${CONTEXT}\n${refuteRules}\n\nGROUP: ${g.title}\n\nCLAIMS TO ATTACK:\n${g.claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n${g.extra}\n\nThe full auditor write-up for each claim (evidence, impact, proposed fix) is in ${REPORT} — find the matching heading and read it, then go to the code. Return one verdict per claim, in order.`,
    { label: `verify:${g.key}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: g.model, effort: g.effort },
  ),
)

phase('Recover')
const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'coverage_note', 'findings'],
  properties: {
    dimension: { type: 'string' },
    coverage_note: { type: 'string', minLength: 100 },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'severity', 'files', 'evidence', 'impact', 'fix_sketch', 'effort', 'externally_blocked'],
        properties: {
          title: { type: 'string', minLength: 12 },
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
          files: { type: 'array', items: { type: 'string' }, minItems: 1 },
          evidence: { type: 'string', minLength: 120 },
          impact: { type: 'string', minLength: 80 },
          fix_sketch: { type: 'string', minLength: 60 },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          externally_blocked: { type: 'boolean' },
        },
      },
    },
  },
}

const recoverThunks = [
  () =>
    agent(
      `${CONTEXT}

DIMENSION: production configuration, deployment, and infrastructure launch readiness.
(This auditor was killed mid-run and is being re-run. Nothing of its work survives.)

Audit:
1. lib/env/ and scripts/check-env.ts — the fail-closed environment guard. Find every
   \`process.env.X\` read anywhere in the repo that is NOT in the env contract. Each one is a
   variable that can be missing in production and blow up at request time instead of boot time,
   which defeats the entire fail-closed design. Enumerate them.
2. Migration state: scripts/check-migrations.ts, scripts/verify-schema.ts. Migrations 0020-0022
   came with Phase 16. progress.md records several as "applied to hosted dev" — establish what is
   claimed for PRODUCTION, what is unverifiable from here, and the exact command that would verify.
3. vercel.json, next.config.ts, middleware.ts: security headers (HSTS is claimed — check CSP,
   X-Frame-Options, Referrer-Policy, Permissions-Policy), function region (must be EU for GDPR),
   function timeouts against Meta's 20s webhook limit, and cron definitions.
4. Inngest: production function registration and signing keys; can a deploy silently leave
   functions unregistered?
5. Backups: is there any configured or documented backup of the production Supabase project and a
   tested restore path? For a health-adjacent product this is a launch gate.
6. Abuse: the webhook and every public endpoint. Can an unauthenticated caller burn OpenRouter or
   Meta spend? Vercel WAF/BotID exist and appear unused — assess whether that matters here.
7. \`.env.example\` vs \`.env\` vs \`.env.vercel.*\`: drift, and any secret that looks committed.
   Check git history for leaked secrets (\`git log -p\` over env files, or \`git log --diff-filter=A
   --name-only\`).

Report one finding per distinct gap. Evidence must cite a real file and line.`,
      { label: 'audit:prod-config', phase: 'Recover', schema: AUDIT_SCHEMA, model: 'opus', effort: 'xhigh' },
    ),
  () =>
    agent(
      `${CONTEXT}

DIMENSION: security and multi-tenant isolation — INDEPENDENT SECOND OPINION.

A first auditor swept this dimension and returned **no blocker and no high-severity findings**. That
is the most reassuring result in the whole audit and therefore the one most worth checking, because
this is the dimension where a miss is existential: a cross-tenant leak in a health-adjacent
multi-tenant product ends the business.

Do NOT read the first auditor's conclusions — form your own. Work adversarially: your goal is to
find a way to read or write another PT's data.

1. RLS: every migration under drizzle/. For each table, is RLS enabled AND is there a policy that
   actually constrains rows to the owning PT? Pay special attention to tables added late —
   billing_orders, conversation_days, pwa_mutations, push_subscriptions, cost_daily,
   erasure_archive. A late table is where RLS gets forgotten. Check for policies that are enabled
   but permissive (\`USING (true)\`), and for tables where RLS is enabled but no policy exists at
   all (which silently denies, or silently allows for the service role).
2. The service-role client: every use. Service role BYPASSES RLS entirely, so every query made with
   it must scope by pt_id in the query itself. Inngest functions run without a user session — audit
   each one.
3. Server Actions are public HTTP endpoints. For each: is the caller authenticated, and is every
   client-supplied ID re-scoped to the caller's PT rather than trusted? Look for the pattern
   \`where(eq(table.id, inputId))\` with no pt_id conjunct — that is the classic IDOR.
4. API routes: webhook signature verification (constant-time? enforced in every environment?), the
   Meta OAuth callback (state/CSRF), the POK payment webhook (an unauthenticated payment webhook
   means free subscriptions), and the ADMIN_EMAILS gate.
5. Secrets reaching the client: anything \`NEXT_PUBLIC_\`, and whether tokens can reach logs.

If you also find nothing severe, say so plainly and describe what you checked — a clean second
opinion that names its coverage is a genuinely valuable result. Do not invent findings to look
useful.`,
      { label: 'audit:security-2nd', phase: 'Recover', schema: AUDIT_SCHEMA, model: 'opus', effort: 'xhigh' },
    ),
]

const [verdicts, recovered] = await Promise.all([parallel(verifyThunks), parallel(recoverThunks)])

const goodVerdicts = verdicts.filter(Boolean)
const goodRecovered = recovered.filter(Boolean)
const flat = goodVerdicts.flatMap((v) => v.verdicts || [])
const survived = flat.filter((v) => v.verdict === 'CONFIRMED' || v.verdict === 'PARTIALLY_TRUE')
log(`${flat.length} claims attacked; ${survived.length} survived; ${flat.length - survived.length} refuted or already handled`)
log(`recovered dimensions: ${goodRecovered.map((r) => r.dimension).join(' | ')}`)

phase('Plan')
const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'launch_blockers', 'waves', 'operator_actions'],
  properties: {
    headline: { type: 'string', minLength: 250 },
    launch_blockers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why', 'files', 'effort', 'externally_blocked'],
        properties: {
          title: { type: 'string', minLength: 10 },
          why: { type: 'string', minLength: 80 },
          files: { type: 'array', items: { type: 'string' } },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          externally_blocked: { type: 'boolean' },
        },
      },
    },
    waves: {
      type: 'array',
      minItems: 3,
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
                title: { type: 'string', minLength: 10 },
                files: { type: 'array', items: { type: 'string' }, minItems: 1 },
                what_to_do: { type: 'string', minLength: 120 },
                how_to_verify: { type: 'string', minLength: 60 },
                effort: { type: 'string', enum: ['S', 'M', 'L'] },
              },
            },
          },
        },
      },
    },
    operator_actions: {
      type: 'array',
      description: 'Things only the human can do: Meta dashboard changes, POK credentials, Notion, accounts, devices.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'why_only_human', 'blocks'],
        properties: {
          title: { type: 'string' },
          why_only_human: { type: 'string', minLength: 40 },
          blocks: { type: 'string', minLength: 20 },
        },
      },
    },
  },
}

const plan = await agent(
  `${CONTEXT}

You are the technical lead cutting the production-readiness plan. Inputs:

VERIFICATION VERDICTS (an adversarial pass over the audit's blocker/high claims — these are the
trustworthy signal; the auditors' original severities were self-assigned and unverified):
${JSON.stringify(goodVerdicts, null, 1)}

RECOVERED AUDIT DIMENSIONS (prod-config, and an independent second opinion on security/tenancy):
${JSON.stringify(goodRecovered, null, 1)}

The remaining medium/low findings from the first audit are in ${REPORT} — read it for anything worth
folding in, but do not let low-severity noise crowd out the real work.

Produce the plan:

1. \`launch_blockers\` — only items that would harm the first real PT or their patients, leak data,
   get money wrong, or breach a dated external cutoff. Use ONLY claims with verdict CONFIRMED or
   PARTIALLY_TRUE, plus anything severe from the recovered dimensions. Anything REFUTED or
   ALREADY_HANDLED must not appear. Be strict — "no users are harmed today" is never the test,
   because there are no users yet; the test is what happens on day one of real use.

2. \`waves\` — ordered, independently shippable, each verifiable with this repo's tooling. The
   operator's shape is: (1) deadline-critical + known defects, (2) security/tenancy/GDPR,
   (3) reliability + observability, (4) performance + accessibility, (5) launch-readiness dossier.
   Deviate only if the verified findings genuinely argue for it, and say so in the rationale.
   Every item needs a concrete \`how_to_verify\`. Sequence within a wave so independent items can
   run in parallel.

3. \`operator_actions\` — everything only the human can do (Meta App dashboard changes, POK merchant
   credentials, Notion access, a physical device, a real PT). For each, say what it blocks. Where
   the code can be built ahead of the unblock, that code belongs in a wave, not here.

4. \`headline\` — a straight answer for the product owner: how far is this from production, and what
   is actually in the way? Name the number of claims that survived versus were refuted, so the
   reader knows how much of the original audit held up. No cheerleading, no hedging.`,
  { label: 'plan:waves', phase: 'Plan', schema: PLAN_SCHEMA, model: 'opus', effort: 'xhigh' },
)

return { verdicts: goodVerdicts, recovered: goodRecovered, plan }
