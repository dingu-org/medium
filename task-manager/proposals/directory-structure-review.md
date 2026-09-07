# Directory structure review and execution proposal

Date: 2026-09-07. Baseline: `08b8652` (clean working tree before this review).
Status: analysis complete; implementation tasks below are pending. No runtime files, URLs, provider settings, or database schema changed.

## Recommendation

Keep the single Next.js application and every existing public URL. The mixed placement of `route.ts` is valid and does not represent duplicate APIs. Improve domain ownership behind those entry points, then enforce a small number of import rules. Do not reorganize the whole repository merely to make the tree uniform.

Reviewed all 10 route handlers, middleware, PWA routing, integration callers, module imports, recent Git hotspots, CI/testing configuration, the progress tracker, and Phase 12's remaining launch checklist. The `.ua/knowledge-graph.json` layers provided orientation; `.ua/meta.json` dates the graph to July 31 at `5b697f6`, so current source takes precedence. The understand plugin's callable skills were unavailable in this session; the graph was read directly. No hosted provider configuration was inspected.

The repository pins Next.js 15.5.16. The instructed `node_modules/next/dist/docs/` directory is absent. Framework conventions were checked against the official [Next.js 15 project structure guide](https://nextjs.org/docs/15/app/getting-started/project-structure) and [Route Handler reference](https://nextjs.org/docs/15/app/api-reference/file-conventions/route). A `route.ts` defines an HTTP endpoint anywhere under `app`; `api` is an ordinary URL segment. Parenthesized route groups do not appear in URLs. Colocated components/actions/tests are not endpoints merely because they are under `app`.

## Strengths worth preserving

- One deployable application, with recognizable `app`, `components`, `lib`, `scripts`, `public`, `drizzle`, and `supabase` responsibilities. A monorepo or generic repository/service/DAO stack would add overhead without a demonstrated consumer.
- `(auth)`, `(dashboard)`, and `(legal)` express layout ownership. `app/auth` is the literal `/auth` URL namespace; it is not the same thing as `(auth)`.
- Route-specific forms, actions, loading states, and tests are colocated. Reusable primitives live in `components/ui`; feature UI lives in named component folders.
- `lib/appointments` already offers reusable domain operations; `lib/events` owns durable events/outbox; `lib/inngest/functions` owns job orchestration. `app/api/inngest/route.ts` is a good thin entry point with an explicit execution budget.
- POK's route delegates settlement to `lib/billing/payments.ts`; provider details sit in `lib/billing/pok`. Preserve the lazy provider client so missing billing credentials cannot break unrelated Inngest functions.
- Tenant helpers, environment guards, migration tooling, and colocated integration tests make structural changes verifiable. `drizzle/migrations` and `supabase` have distinct jobs: application migration history versus local platform/auth configuration.
- `docs/features` and `docs/README.md` provide useful flow-oriented navigation. Generated `public/sw.js` has an explicit source (`app/sw.ts`) and build configuration.

## Complete endpoint register

All paths below are relative to the environment's application origin. “Keep” means old URL = proposed URL. Methods are explicitly exported methods; framework-provided HEAD/OPTIONS behavior must also remain compatible.

| Current URL → proposed URL              | Source under `app/`                          | Methods        | Purpose and caller                                                                                                         | Security/compatibility contract                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/auth/callback` → keep                 | `auth/callback/route.ts`                     | GET            | Supabase PKCE session exchange after Google sign-in; legacy emailed codes also arrive here                                 | Safe `next`, session cookies, recovery marker, error redirects; deliberately excluded from session-refresh middleware                                                                                            |
| `/auth/confirm` → keep                  | `auth/confirm/route.ts`                      | GET            | Supabase emailed signup/recovery/email-change token hashes; supports opening on another device                             | Restricted OTP types, recovery destination and marker; legacy `code` redirects to callback; middleware exclusion                                                                                                 |
| `/admin/payments-export` → keep         | `(dashboard)/admin/payments-export/route.ts` | GET            | Admin browser CSV download with `month` and `all` query parameters                                                         | Handler independently checks session and `ADMIN_EMAILS`, returning 404 on denied access; CSV headers/filename remain stable                                                                                      |
| `/api/auth/meta-embedded` → keep        | `api/auth/meta-embedded/route.ts`            | POST           | Medium's settings browser sends Meta popup code and connection identifiers; server exchanges token and persists connection | Exact Origin check plus authenticated account; request schema, error mapping, encryption, event persistence                                                                                                      |
| `/api/inngest` → keep                   | `api/inngest/route.ts`                       | GET, POST, PUT | Inngest SDK discovery/registration/execution                                                                               | SDK signing/configuration; Node runtime; `maxDuration = 60`; middleware exclusion                                                                                                                                |
| `/api/webhooks/whatsapp` → keep         | `api/webhooks/whatsapp/route.ts`             | GET, POST      | Meta verification challenge and messages/statuses/history/contact sync/Business-app echoes/account updates                 | GET verify token; POST signature over original body before parsing; deduplication, tenant resolution, durable events; middleware exclusion                                                                       |
| `/api/webhooks/pok` → keep              | `api/webhooks/pok/route.ts`                  | POST           | Existing defensive order-outcome trigger; actual provider delivery is unverified                                           | No signature validation today; authoritative provider re-fetch through settlement, idempotency and reconciliation. Invalid JSON returns 400; recognized/ignored notifications and processing failures return 200 |
| `/api/pwa/mutations/appointment` → keep | `api/pwa/mutations/appointment/route.ts`     | POST           | Browser/offline queue appointment operations                                                                               | PWA account authentication, validation, mutation ledger/replay and tenant scoping; preserve response codes and JSON                                                                                              |
| `/api/pwa/mutations/message` → keep     | `api/pwa/mutations/message/route.ts`         | POST           | Browser/offline queue manual WhatsApp send and takeover                                                                    | Same account/mutation isolation; sent-but-not-persisted recovery; no automatic resend of uncertain delivery; `maxDuration = 60`                                                                                  |
| `/api/metrics/vitals` → keep            | `api/metrics/vitals/route.ts`                | POST           | `components/web-vitals-reporter.tsx` beacon                                                                                | Intentionally unauthenticated handler, bounded/allowlisted logging, 204 responses; currently still traverses session-refresh middleware                                                                          |

There is no second implementation of `/api/auth/meta-embedded` under `/auth`. The former connects a WhatsApp business account; the latter signs a person into Medium. The admin download is also a reasonable resource URL outside `/api`. Its dashboard layout is not its authorization gate; the explicit handler check is essential.

## External dependency and URL-change ledger

**This proposal requests zero URL changes and therefore zero external-service updates.** Keep this register current in each implementation PR. Do not infer that a provider is configured merely because a handler exists.

| URL/dependency                                              | Repository evidence and owner action if changed later                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/webhooks/whatsapp`                                    | Meta WhatsApp webhook callback URL, verify token and subscribed fields must be checked separately in Preview's test app and Production's app. Update callback and reverify challenge; test all subscribed event families. `CONTEXT.md` permits development to borrow Preview's Meta app temporarily: one callback means restoring Preview after a tunnel test is required.                                    |
| `/api/inngest`                                              | Update the served endpoint in the corresponding Inngest environment and resync registration. Preserve app/function/event IDs and verify a signed execution. Inspect local dev scripts too. Do not create duplicate job consumers during an alias rollout.                                                                                                                                                     |
| `/auth/callback` and `/auth/confirm`                        | Update Supabase redirect allowlists and hosted email templates, local `supabase/config.toml` and templates, `lib/auth/email-links.ts`, and `app/(auth)/sign-in/oauth-buttons.tsx`. Keep old emailed links working. Google typically redirects to Supabase's provider callback, not directly to Medium's `/auth/callback`; inspect actual configuration before changing Google settings.                       |
| `/api/auth/meta-embedded`                                   | Update `app/(dashboard)/settings/connect-whatsapp.tsx` fetch and tests. The live flow is a browser POST, not a Meta GET redirect. `META_REDIRECT_URI` remains in env/documentation surfaces, but token exchange in this handler sends app ID, secret and code without it. Verify Meta dashboard dependencies before editing/removing that setting; do not treat old tracker claims as proof of current usage. |
| `/api/webhooks/pok`                                         | Establish whether POK or any operator actually calls it before deletion or rename. `lib/billing/payments.ts` says there is no POK webhook and creates orders without a webhook URL; the route describes an undocumented/unverified webhook contract. This is an unresolved repository contradiction, not evidence of a configured subscription.                                                               |
| `/settings/billing` (page, not `route.ts`)                  | POK checkout uses a return URL supplied through billing actions, with success/failure return settings and `orderId` processing on the page. This is the proven code path, alongside hourly reconciliation. A UI route rename can break payments even if no API path changes; preserve outstanding orders' return URLs.                                                                                        |
| PWA mutation URLs                                           | Update `lib/pwa/mutation-client.ts`, `app/sw.ts`, queue/replay tests and deployment compatibility. Installed clients and persisted queue records can survive an application deployment; retain old endpoints until their supported lifetime has passed.                                                                                                                                                       |
| `/admin/payments-export`, `/api/metrics/vitals`             | Update the admin download link and vitals reporter respectively; inspect any operator bookmarks/automation. No third-party registration found in repository evidence.                                                                                                                                                                                                                                         |
| `/privacy`, `/terms`, `/en/privacy`, `/en/terms`, `/help/*` | These are pages, but legal/help URLs can be registered in Meta app settings or linked from published material. Preserve them when reorganizing route groups.                                                                                                                                                                                                                                                  |

For any future URL change, create a ledger row with old URL, new URL, methods, environment/origin, consumer, provider setting, internal references, compatibility implementation, verification evidence, rollout date, retirement criterion and rollback. Never record secrets or token-bearing request URLs.

Rollout: deploy an old-path compatibility handler and new path sharing one implementation; verify both before changing provider settings. Preserve method, raw body, signature checks, cookies, query strings, response headers, runtime and duration. Avoid generic redirects for webhooks or queued POSTs. Update middleware and service-worker matching for both paths. Move Preview first, then Production after evidence; retain old auth links, old PWA clients and in-flight payment returns. Retire an alias only after the documented consumer/retry window and observed traffic permit it. Roll back provider registration to the still-working old path before removing the new one.

## Ranked implementation tasks

Execute in order as separate reviewable slices. All tasks preserve public paths, schema, event names and payload contracts. Check off only after implementation and verification.

### 1. Move notification contracts out of route-owned settings (high leverage, low churn)

Evidence: `lib/notifications/push-payload.ts` imports `NotificationPrefs` from `app/(dashboard)/settings/constants.ts`; `lib/pwa/read-models.ts` imports that route's constants too. A background feature depends on UI folder placement. This file also mixes notification preferences, retention choices and settings form state.

- [ ] Move `NOTIFICATION_PREF_KEYS` and `NotificationPrefs` into proposed `lib/notifications/preferences.ts`. Update every consumer, including tests.
- [ ] Keep form-only `SettingsState` by the settings UI. Move `RETENTION_OPTIONS` to `lib/settings/retention.ts` only if shared server/read-model consumers need it; do not move the mixed file wholesale into notifications.
- [ ] Verify notification preference mapping, push dispatch and settings snapshots with their existing tests; run typecheck/lint.
- [ ] Enforce no `app/**` imports from notification domain code using ESLint `no-restricted-imports`, including type-only imports and relative paths. Prove a deliberate forbidden import fails, then remove it.

Acceptance: notification contracts have one owner; no runtime/data-format changes or leftover compatibility re-export. Rollback: revert imports and file move together.

### 2. Extract WhatsApp webhook processing behind its existing route (high leverage, medium/high risk)

Evidence: `app/api/webhooks/whatsapp/route.ts` is 1,072 lines with customer linking, conversation creation, delivery-state ordering, reminder outcomes, sync state, echoes and revocation alongside HTTP handling. The recently changed conversation/handoff flow also depends on events produced here. The issue is mixed responsibilities, not length alone.

- [ ] Keep challenge handling, signature verification over original text, parse/validation, trace creation and HTTP acknowledgments in the existing route.
- [ ] Create proposed `lib/channels/whatsapp/webhook.ts` to own processing of validated changes. Initially move existing processing intact; retain transaction boundaries, ordering, event IDs and failure propagation.
- [ ] Use the existing channel payload types and event/outbox modules; do not introduce a generic webhook framework or one file per helper.
- [ ] Keep route integration tests exercising the HTTP entry point. Verify signatures, duplicates, tenant mapping, out-of-order statuses, non-text messages, contact/history sync, echoes and revocation. Add coverage only where one of these named contracts lacks it.
- [ ] Only after this slice is green, split event families into a `webhook/` folder if they have distinct invariants and tests; do not mandate the split now.

Acceptance: the route no longer owns database orchestration; provider behavior and transaction/event semantics are identical. No asynchronous acknowledgment redesign in this refactor. Rollback: revert the extraction; no provider change required.

### 3. Put Embedded Signup orchestration next to WhatsApp integration code (medium/high leverage)

Evidence: `app/api/auth/meta-embedded/route.ts` is 430 lines, including phone discovery, code exchange, number registration, app subscription, encrypted persistence and event publication.

- [ ] Extract these operations to proposed `lib/channels/whatsapp/signup.ts` with one connection operation, accepting the authenticated account identity and validated signup input.
- [ ] Keep Origin/session/input validation and HTTP error mapping in the route. Preserve `MetaSignupError`, connection-mode semantics, unique-conflict handling and durable bootstrap event.
- [ ] Run Embedded Signup integration tests, relevant channel tests, and typecheck/lint. Keep live Coexistence verification explicitly pending: moving files does not resolve the Phase 2 external blocker.
- [ ] Document `META_REDIRECT_URI`'s observed runtime non-use and resolve its config/documentation ownership without silently changing provider settings.

Acceptance: signup logic is discoverable in the WhatsApp module; existing URL and browser contract survive. Rollback: revert extraction and imports.

### 4. Extract offline mutation orchestration without losing replay guarantees (medium leverage, high behavioral sensitivity)

Evidence: message and appointment routes are 378 and 296 lines. Message sending contains the sent/recover/retain ledger state machine and transactional takeover; appointment handling contains manual-customer creation progress and booking/status orchestration. `lib/pwa/mutation-store.ts` already owns the shared ledger.

- [ ] First extract the message operation into proposed `lib/pwa/mutations/message.ts`; retain authentication, request validation and HTTP mapping at its route. Keep the 60-second route budget aligned with ledger stale-processing rules.
- [ ] Preserve stable `clientMutationId`, delivery recovery, no-resend behavior, same-transaction message/ledger completion, and takeover event creation. Do not replace this with a generic retry wrapper.
- [ ] After message tests pass, extract appointment orchestration into `lib/pwa/mutations/appointment.ts`, reusing existing `lib/appointments` operations. Preserve customer-progress recovery and tenant checks.
- [ ] Run `app/api/pwa/mutations/__tests__/route.integration.test.ts`, ledger/client-store tests, appointment integration tests and PWA service-worker tests.

Acceptance: both original HTTP interfaces and persisted queue semantics are unchanged. Rollback: revert one extraction at a time, leaving stored mutation records interpretable.

### 5. Consolidate customer domain naming (medium leverage, bounded mechanical move)

Evidence: `lib/clients/{queries,mutations,phone}.ts` operate on `customers`, while `lib/customers/{erase,whatsapp-contacts}.ts` own other operations on the same entity. The August 23 tracker decision explicitly chose accounts/customers for the horizontal product.

- [ ] Move `lib/clients` implementation and colocated tests into `lib/customers`, retaining descriptive filenames and updating all imports/mocks.
- [ ] Keep `/clients`, `components` names and customer-facing terminology unless a separate product task changes them. No database migration or global replacement of words.
- [ ] Verify phone normalization, creation duplicate handling, queries, erasure and client actions. Search for remaining `@/lib/clients` and relative references.

Acceptance: one customer domain directory; no shim directory retained. Rollback: reverse the file/import move. Do not combine with task 2's customer-linking extraction.

### 6. Clarify shared action ownership and enforce the useful boundaries (medium leverage)

Evidence: `lib/pwa/push-client.ts` imports settings push actions; `components/pwa/pwa-provider.tsx` imports a dashboard install action; `components/appointments/appointment-sheet.tsx` imports calendar actions. Server Action imports from client code are intentional framework calls, not automatically server-code leaks. Their ownership still makes reusable features depend on route folders.

- [ ] Move shared push Server Actions to proposed `lib/notifications/actions.ts`, and PWA install recording to `lib/pwa/actions.ts`; preserve `use server`, auth, instrumentation and function behavior. `lib/auth/actions.ts` is an existing precedent.
- [ ] Evaluate calendar actions' real consumers before moving them. Keep truly route-specific actions colocated; extract only shared orchestration needed by the appointment sheet/calendar.
- [ ] After resolving actual reverse imports, enforce domain `lib/**` not importing `app/**` (tests and explicit framework entry-point tests are deliberate exceptions). Cover alias and relative forms.
- [ ] Enforce POK provider access through the existing payments module for application consumers, with provider-local tests excepted. Keep browser-safe contracts separate from database/provider implementations; consider targeted server-only markers only with Next build and test-harness verification.

Acceptance: existing lint command catches the named violations locally and in CI; no new generic architecture framework. Rollback: revert action moves and their rules together.

### 7. Resolve endpoint/documentation ambiguity and add route checks (high operational value)

- [ ] Establish POK webhook consumers using provider/account evidence and operator traffic records. Retain the endpoint until resolved; if unused, remove it in its own task with the deletion recorded in the URL ledger. Correct conflicting feature documentation either way. Add focused HTTP contract tests if it remains (invalid JSON, unknown payload, successful/repeated settlement, failure acknowledgment).
- [ ] Add direct HTTP tests for admin CSV authorization and response headers; current payments-export module tests and admin gate tests do not alone prove the route wires them correctly.
- [ ] Review the vitals endpoint's middleware classification: its handler is intentionally public but middleware refreshes Supabase sessions. Decide whether to exclude that exact path; verify with `__tests__/middleware.test.ts` and vitals route tests, without weakening protected paths.
- [ ] Add a route inventory assertion covering normalized URLs and exported methods, plus middleware tests for auth callback/confirm exclusions. A moved handler must not accidentally create a 404 or start clearing freshly issued auth cookies.
- [ ] Add a production build check to the implementation verification workflow (CI currently runs lint, typecheck, unit and integration tests but no build). Use safe environment configuration; never pull production secrets just to build. Preserve a documented separate deployment build if CI cannot run an equivalent build.
- [ ] Publish the maintained endpoint register in `docs/` and link from `docs/README.md`; keep this proposal as the historical task checklist.
- [ ] Correct broken wayfinding: `docs/README.md` currently links `docs/whatsapp/embedded-signup-v4-setup.md`, which is absent. Replace with an existing accurate source or author the promised operator guide. `task-manager/README.md` still points to missing `docs/medium-canvas` sources; mark historical references accordingly. Update stale current-state summaries without rewriting historical decisions.

Acceptance: endpoint consumers/unknowns are explicit, links resolve, deployed route compilation is checked, and unrelated launch blockers remain pending.

## Target shape (selected changes only)

```text
app/                              # Same routes, URLs and layout groups
  auth/{callback,confirm}/route.ts
  api/                            # Existing HTTP entry points retained
  (dashboard)/admin/payments-export/route.ts
components/                       # Shared feature UI and UI primitives
lib/
  channels/whatsapp/
    webhook.ts                    # Validated event processing (proposed)
    signup.ts                     # Connection orchestration (proposed)
    ...                           # Existing transport, payload, signature
  customers/                      # Consolidated customer operations
  notifications/
    preferences.ts                # Browser-safe contracts (proposed)
    actions.ts                    # Authenticated shared Server Actions
  pwa/
    actions.ts
    mutations/{message,appointment}.ts
    mutation-store.ts             # Existing ledger
  appointments/                   # Existing shared business operations
  events/                         # Existing durable events and outbox
  inngest/                        # Existing job registry and functions
```

Net simplicity: URLs/deployable surfaces remain unchanged; `lib/clients` disappears. Extracted modules replace in-route implementation rather than duplicate it. Each new file owns a named existing behavior; no mandatory barrel files, generic service/DAO layers, or permanent compatibility re-exports.

## Verification and handoff

For every implementation slice: read current progress and applicable phase checklist; record in-flight ownership; check the current Git diff; run `pnpm lint`, `pnpm typecheck`, relevant existing tests, and `pnpm build` for route/action/import changes. Run `pnpm test:all` before integrating the completed structural work. The test setup in `tests/setup/global.ts` migrates and resets local test data, so use the repository's dedicated local Supabase setup. It must never target hosted data.

Compare all original route paths/methods after each slice, inspect imports/mocks and preserve runtime/duration exports. Verify a built app's routing as well as direct handler tests: direct imports cannot catch filesystem URL mistakes. For any external migration, record Preview/live verification separately from mocked tests; this analysis supplies no hosted verification.

This review performed static source/consumer inspection, graph freshness checks, route collision checks and Markdown verification. Runtime tests and builds were not run because no runtime code changed. Future acceptance criteria above are not claimed as passing.

## Deferred / intentionally unchanged

- Moving everything into `src/`, adding `(api)` around routes, or moving all handlers under `/api`: substantial churn with no demonstrated benefit. A route group can preserve URLs but still alters import/layout relationships.
- Renaming `/clients` to `/customers`, `/settings/billing`, legal paths or auth URLs: product/integration changes outside this proposal.
- Merging `chat`, `conversation`, and `ai`: they currently distinguish dashboard read models, conversation decisions and model invocation; no proven reason to collapse them wholesale.
- Splitting `lib/db/schema.ts`: preserve its migration entry point; evaluate only with demonstrated schema ownership conflicts.
- Combining `tests/` and colocated `__tests__`: shared setup/RLS suites and module tests have different purposes. Root `__tests__/middleware.test.ts` appropriately sits near root middleware.
- Deleting disabled reminders, the POK handler, generated assets, `.ua`, historical migrations or local environment files on appearance alone: flags, external consumers and source/generation ownership require evidence.
- Introducing universal response envelopes, context propagation, retry behavior or new webhook acknowledgment semantics: these change contracts, not merely directory structure.
