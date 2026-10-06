# Jira migration keep-list

Triage of `task-manager/*`, `phases/*`, `proposals/*` and the Notion Tasks Tracker + Document Hub (2026-10-06). Everything not listed under KEEP is DROP. Use current nouns (`accounts`/`customers`, not `pts`/`patients`) in every ported title.

Legend: **[J]** = becomes a Jira issue · **[R]** = reference page (Confluence/docs or epic description) · `src` = where to read the detail.

## 0. Verify before porting (contradictions between sources)

Resolved by an Opus validation pass against the code (2026-10-06):

| # | Conflict | Resolution |
|---|----------|------------|
| C1 | POK checkout gated vs live | **Live** since 2026-07-15 (commit 0c80fae). `CheckoutForm` is mounted at `settings/billing/page.tsx:127`; `LIVE_PAYMENTS_ENABLED` is absent from code. "Coming soon" wording survives only in `help/plans/page.tsx:98` and unused keys `dict/billing.ts:65-66`. Trackers are stale. |
| C2 | `ALL_MINOR_FACTOR` | **Confirmed = 1** (`payments.ts:91`, `docs/features/billing-and-plans.md:151`). Still say UNCONFIRMED: `metrics/admin.ts:459`, `payments-export.ts:13-15,148`, `admin/page.tsx:353`, phase 16 C5/C7. Fix those. |
| C3 | Phase 16 C8 status | Phase file `[~]` is right. |
| C4 | Prod model cutover | **Done**: `OPENROUTER_PROD_MODEL` is no longer read. Only the one real prod turn + `smoke-ai.ts` check remains (added as a task below). |
| C5 | Reasoning effort | **Removed**: `plans.ts` sets none (commit 361189a). progress.md:99-102 is stale. |
| C6 | Onboarding plan step | Still ask KD. |
| C7 | `payments.ts` "no POK webhook" | Comment is at `payments.ts:157`; the webhook route exists. Fix the comment. |
| C8 | Config IDs | Already checked off in `02-whatsapp:72` and `progress.md:48`. |

Also: six Notion page IDs cited in section 2 (retention, timezone, ALL factor, Go-live, fizioterapist, config-ID) do not match their pages. Re-resolve IDs by task title at port time, not from this file.

## 1. Epics

1. **WhatsApp integration (Phase 2)**: highest priority, hard deadline 2026-10-15
2. **Background jobs & reminders (Phases 5+6)**: share one external blocker
3. **PWA & notifications device QA (Phases 8+9)**: verification subtasks only
4. **Pre-launch / first real PT (Phase 12)**
5. **Monetization launch gates (Phase 16)**
6. **Production readiness Wave 2**: security, multi-tenancy, GDPR audit
7. **Code & docs hygiene** (Notion docs-audit backlog)
8. **Directory-structure refactor**
9. **Foundations (done)**: no tickets; holds the reference notes in section 3

## 2. KEEP-ACTIVE → Jira issues

### Epic: WhatsApp integration
- [J] **Deadline 2026-10-15**: prove Embedded Signup v4 with a live phone test; `coex` has no auto-upgrade fallback. `src` progress.md:67, 02-whatsapp:64
- [J] Confirm Tech Provider/Solution Partner status in both Meta apps (external, blocks the above). `src` 02-whatsapp:70
- [J] Meta Business Verification + App Review / advanced access (external; blocks all external-PT onboarding). `src` Notion 39a0e1f4…77fbf3
- [J] Add Preview's five `whatsapp_business_account` webhook subscriptions (Preview has zero). `src` 02-whatsapp:71
- [J] Capture the full `WA_EMBEDDED_SIGNUP` `CANCEL` payload (`readSignupMessage` discards it). `src` 02-whatsapp:51
- [J] Mirror non-text `smb_message_echoes` to the owner (Meta requires it). `src` 02-whatsapp:38
- [J] `ACCOUNT_OFFBOARDED` is logged and ignored; it should trigger revocation. `src` 02-whatsapp:40
- [J] Persist each Meta one-time-sync request ID per call (an Inngest retry can repeat the contacts request). `src` 02-whatsapp:106
- [J] Enforce/alert on the 24h coexistence sync deadline. `src` 02-whatsapp:107
- [J] Sync UI shows only "starting"; add progress/failure/completion. `src` 02-whatsapp:61
- [J] Live coexistence E2E with a real WhatsApp Business app number (contact/history sync, AI replies, echo mirroring, 2h pause). `src` Notion 39a0e1f4…572e4
- [J] Decide: wire or drop 4 unconsumed events: `wa.connection.expiring` and `wa.quality_warning` (no subscribers, so the owner is never warned before token expiry or quality drop), plus `appointment.completed` / `appointment.no_show`. `src` Notion 3cc0…a277
- [J] Cleanup: drop dead column `conversations.handoff_offer_message_id` (separate deploy). `src` 03-ai:100

### Epic: Background jobs & reminders
- [J] **Reminders are switched off by default in every environment** (`lib/reminders/flag.ts`). Re-enabling needs two design decisions: (1) who owns/creates/re-submits WhatsApp templates per business, (2) turn precedence: reminders currently read an inbound "PO" before the assistant does. **Every reminder ticket below is blocked by this**; do not port them as independent work. Do not delete the dormant reminder code or the POK handler on sight (directory proposal "Deferred" section).
- [J] Live reminder + cancellation E2E (needs an external WhatsApp Business account with configured availability). `src` Notion 39a0e1f4…bfcabeb1d59, 05:123-124, 06:65,70
- [J] Check whether Embedded Signup can issue a non-expiring system-user token, which would make the expiry monitor unnecessary. `src` 05:89
- [J] Reconfirm Meta's non-refreshable token guidance before prod onboarding. `src` 05:92
- [J] AI-provider circuit breaker (deferred to Phase 11; grep found none, so confirm and decide). `src` 05:115
- [J] Low priority: throttle reminders as the rolling 24h count nears the tier cap. `src` 06:59
- [J] Note: template `appointment_reminder_24h_sq_v1` was resubmitted PENDING on 2026-07-12; check Meta status. `src` Notion 39a0e1f4…bfcabeb1d59

### Epic: PWA & notifications device QA
- [J] Phase 8 device QA as one task with subtasks: Lighthouse PWA ≥90, Android/iOS install + standalone, offline airplane-mode, SW update UX, live WA message replay. `src` 08:69-74, Notion 39a0e1f4…61cbf
- [J] Phase 9 device push verification: permission grant → row; booking → push + deep link; simulate 410 cleanup; iOS installed PWA; `VAPID_*` in Vercel Preview + Prod. `src` 09, Notion 39a0e1f4…f74
- [J] Decide: iOS splash screens (accepted gap, or backlog). `src` 08:22

### Epic: Pre-launch / first real PT
- [J] **Bug (high): Vercel functions run in `iad1` (US), not `fra1`**; fix the region and redeploy before the first real PT. `src` Notion Go-live 39a0e1f4…9da2dc
- [J] Pick the first real PT and schedule the onboarding call. `src` Notion 39a0e1f4…f5
- [J] Confirm Supabase and Inngest EU regions; verify trace IDs survive webhook → Inngest end to end. `src` 10:65-68,91, 12:58
- [J] Set `ADMIN_EMAILS` in Vercel Preview + Prod (still unset; `/admin` 404s without it).
- [J] Production checklist: Vercel prod env, Supabase migrations, Inngest prod app + signing key, domain + HSTS, OpenRouter prod key/privacy, Supabase PITR, support email. `src` 12-pre-launch
- [J] Manual E2E smoke test (16 items: signup → WA connect → template approval → AI chat → booking → reminder → confirm → audit log → cost dashboard). `src` 12-pre-launch
- [J] Rehearsal: force an early 28h reminder (only item with no automated coverage). `src` 12-pre-launch
- [J] First real-PT launch (30-min call, live test, 24h monitoring, feedback). `src` 12-pre-launch
- [J] Final legal review of privacy/ToS copy; confirm 730-day audit-log retention legally. `src` progress.md:109

### Epic: Monetization launch gates
- [J] POK merchant onboarding: only the webhook signature scheme and production credentials remain (staging creds work and the minor-unit factor is confirmed = 1; see C2). `src` Notion 39c0…b0e5
- [J] Prod model cutover verification: one real production turn + OpenRouter Activity + `smoke-ai.ts` (see C4). `src` 16 C8
- [J] Fix stale UNCONFIRMED/gated text per C1/C2/C7 in code comments, `/admin`, and trackers.
- [J] Accountant questions: VAT threshold, reverse-charge on OpenRouter/Meta invoices, profit tax, fiscalization. `src` Notion 39c0…d936
- [J] Re-check Meta AI-provider pricing policy before launch (Albania exempt as of May 2026). `src` Notion 39c0…436de48
- [J] Fill Meta marketing/auth rate placeholders (currently €0 `⚠ CONFIRM`) or set `META_RATE_CARD_OVERRIDES`. `src` 16:24
- [J] C8 remainder: POK staging E2E (signup → cap → upgrade → pay → renew → expire → grace → downgrade); visual QA of billing surfaces vs designs. `src` 16:29
- [J] Sign off the draft ToS/privacy billing clauses (English). `src` 16, progress.md:196
- [J] Remove "Pagesat vijnë së shpejti" from `help/plans` and dead i18n keys. `src` Notion 3cc0…f260
- [J] Pilot lifetime flip (manual SQL, run by hand, never automated): needs `pts` → `accounts` table name when ported. `src` 16-monetization.md "C1 pilot flip"
- [J] Bug: free-plan retention is 90 days (trigger default) vs `retentionMaxDays: 30`; decide among 3 fix options. `src` Notion 3cc0…c0e1

### Epic: Production readiness Wave 2
- [J] Security, multi-tenancy and GDPR audit (not started). `src` progress.md:45
- [J] Make CI a required status check on `main`/`preview` (repo admin action). `src` progress.md:185

### Epic: Code & docs hygiene
- [J] Decide replacement wording for "fizioterapist" (KD positioning decision), then remove vertical framing from the prompt + ~105 Albanian copy sites. `src` Notion 3cc0…6099, 3cc0…0429
- [J] Unify timezone fallback (`Europe/Tirane` vs `Europe/Berlin`). `src` Notion 3cc0…c1f
- [J] Minor inconsistencies bundle (split into subtasks): `disconnectWhatsApp` bypasses `markRevoked`; `bumpLastInboundAt` inconsistent; 6/10 revoked reasons have no writer; `isSlotBookable` vs UI mismatch; dead enum values; `verify-schema.ts` covers 13/23 tables; 3 fixed replies carry model metadata. `src` Notion 3cc0…5986a1
- [J] Review `docs/gdpr/dpa-template.md` for stale identifiers/framing (update now vs with ToS sign-off). `src` Notion 3cc0…bd31
- [J] Docs trims: `tech-stack-and-architecture.md` (rationale only), 7 operator docs, `embedded-signup-v4-setup.md` status log. `src` Notion 3cc0…321b, …5e75, …2b6
- [J] Verify logout works in /settings and the header (likely already fixed by commits 3957639 and ab9e06b, 2026-09-03; close if confirmed). `src` Notion 3c50…a3650
- [J] Investigate Inngest free-plan "too many runs" (suspect `publish-event-outbox`). `src` Notion 3a20…c6f047
- [J] Decide: calendar FAB `SegmentedControl` colour change, confirm or revert. `src` progress.md:66

### Epic: Directory-structure refactor
- [J] Seven ranked tasks, none started (preferences extraction, WhatsApp webhook + signup extraction, PWA mutations, `lib/clients`→`lib/customers`, shared actions + lint rule, route inventory/contract tests/build check/doc links). `src` proposals/directory-structure-review.md

## 3. KEEP-REFERENCE → docs page

**Architecture & environments**
- [R] Schema: `pts`→`accounts`, `patients`→`customers` (migration 0031, 2026-08-23); one login = one business = one tenant. progress.md:89
- [R] Three envs: dev = local Supabase; preview = `medium-preview.dingu.org`; prod = `medium.dingu.org`; identity via `appEnv()`, never `NODE_ENV`; fail-closed boot check in `instrumentation.ts`. progress.md:103
- [R] Next.js pinned 15.5.16; Inngest pinned to stable v3; Graph API pinned v25.0 as a code constant. progress.md:133,149-150
- [R] Sentry/PostHog deliberately not used; structured logs (`lib/log.ts`, zero-dependency, PII redaction) + internal `/admin` gated on `ADMIN_EMAILS` (unset = 404). progress.md:107,157
- [R] Single Next.js app, zero URL changes; improve domain ownership behind existing entry points. proposals/directory-structure-review.md
- [R] Custom calendar chosen over FullCalendar (3G bundle budget). progress.md:148
- [R] Phase 16 technical architecture (migrations 0020/0021/0022, tables, enforcement points, races) exists **only in Notion**; port it in full. Notion Document Hub

**Security / tenancy / GDPR**
- [R] RLS was write-open until migration 0024; now SELECT-only, writes via the owner role. progress.md:195
- [R] RLS template `pt_id = auth.uid()` (now `account_id`); service role bypasses RLS; CI checks `relrowsecurity` on every tenant table. 01-foundation:48-68
- [R] Token encryption via `pgp_sym_encrypt` (`lib/db/crypto.ts`); rotation with `pnpm rotate:token-key`. progress.md:137
- [R] System-user tokens last ~60 days, not refreshable (full Embedded Signup re-run); revoke on account deletion is best-effort. progress.md:130,109
- [R] Erasure: cascade + in-tx `appointment.cancelled`; `erasure_archive` is FK-free with deny-all RLS; audit retention 730 days; audit scope is enumerated sensitive ops. progress.md:109
- [R] Subprocessors: Supabase Frankfurt, Vercel (nominal fra1, see the iad1 bug), Inngest EU, OpenRouter/OpenAI, Meta. docs/gdpr/subprocessors.md (does not list POK; add it)
- [R] Directory-proposal URL/provider dependency ledger and its "Deferred" warning (keep the POK handler and disabled reminder code). proposals/directory-structure-review.md

**AI engine**
- [R] Deterministic safety/escalation regex deleted 2026-08-14 on purpose (product is horizontal); the model alone decides `escalate_to_human`. Do not restore. progress.md:95,97
- [R] Reply-intent keyword parser deleted 2026-08-30 ("ok, jo" parsed as confirm); the model reads history (`HISTORY_LIMIT=20`). progress.md:87
- [R] Models: Haiku 4.5 + GPT-5-mini fallback under ZDR, no reasoning effort set; dev/preview use a free model with no fallback; `selectModel()` is the only seam. plans.ts
- [R] OpenRouter derives reasoning budget from `max_tokens`; `reasoningEffort:'high'` against a 500-token cap caused a live outage, which is why it was removed (C5). progress.md:99
- [R] `require_parameters:true` broke Azure ZDR routing (`max_tokens` vs `max_completion_tokens`). 05:150-157
- [R] Prompt markdown must be compiled into the bundle, not read from the filesystem at runtime. 05:132-137
- [R] One deterministic patient message per appointment change; `origin` decides the producer. progress.md:189
- [R] Reminder CONFIRM/CANCEL replies bypass `ai_active=false`; reminder templates are immutable once submitted. 06:81,84

**Billing (Phase 16)**
- [R] Plans: Free = 30 conversations / 10 reminders / 1 service / 30-day retention; Solo = 400 / 250 / unlimited / 365 days, 2,500 ALL/mo or 25,000 ALL/yr (VAT-inclusive). 80% warn, 100% handoff; inbox never blocked. Downgrade deletes nothing (oldest service stays active, 30-day clamp grace). Notion Phase 16 spec
- [R] POK: no subscriptions/recurring support; no documented webhook signature; so fetch-as-truth + hourly reconcile cron, webhook is trigger-only, `billing_orders` is a read-own ledger. progress.md:200
- [R] Meta cost rollup is actual-first by pricing category; AI cost µUSD and Meta cost µEUR are never summed. progress.md:199
- [R] Designer brief constraints: never show model names or COGS; nothing may look punitive. Notion Document Hub
- [R] Phase 15 decisions: AI pause sends nothing but escalation detection continues and reminders keep sending; ditched (don't re-propose): booking-rule settings, reminder-timing controls, language setting. Notion Phase 15 spec

**Client / PWA**
- [R] Albanian is canonical; patient-facing copy formal "Ju", owner-facing informal "ti". progress.md:113,193
- [R] SW must never cache auth tokens; IndexedDB queue capped ~100; server wins, 4xx = final failure. 08:50,81,82
- [R] iOS Web Push needs an installed PWA and a real device; no patient names in push titles. 09
- [R] Use `100dvh`, not `100vh`, on iOS; lazy-load the realtime client. 07:107,120
- [R] Appointment scope: duration comes from the service (`duration_min` 5–480; 60 is only a fallback), no buffer, no recurrence; booking idempotency key `(accountId, customerId, startsAt)`. 04:17,49

**Ops & process**
- [R] Local dev needs ngrok/Cloudflare Tunnel + a separate Meta test app; `NEXT_PUBLIC_*` changes need a redeploy. 02:74,131-133
- [R] Integration tests `DELETE FROM auth.users` at start; never run two concurrently. progress.md:97
- [R] After a parallel-agent batch, run the full suite once serially and grep for duplicated helpers (a duplicate time formatter caused wrong patient-facing times). Notion Phase 11-12 notes
- [R] Design source of truth is the remote design project, no local export. progress.md:113

## 4. DROP (do not port)

- `progress.md`: the "Recent sessions" changelog (173-262), 2026-05 bootstrap decisions (144-169), "Verification notes" (71-80), "Completed review" (36-38), "Open Questions" (263-269, resolved), every per-session test count. The Phase 16 entries (196-203) are the one exception: their open items are carried into section 2 above.
- Stale text: `reminders/phase-0-flag` and `prod-readiness` are already merged; "Last updated" header.
- Phases 00, 01, 04, 07 and 13, 14, 15 in full (complete; only the reference notes above survive). Checked-off checklists in phases 02, 03, 05, 06, 08, 09, 10, 11, 16 (C1–C7).
- Notion: all Done tasks (Phase 10/11/12 implementation, `[REVIEW]` sign-offs, 14 Phase 15 rows, Phase 16 C1–C7, the brainstorm page) and 2 blank "Untitled" templates.
- `project-plan.md` and `README.md` once the Jira structure replaces them.
- Directory-structure proposal's "Strengths" and "Deferred" sections, and its per-task lint/typecheck boilerplate.
