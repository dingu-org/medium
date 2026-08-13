# Autopilot state

> Handoff file for an unattended production-readiness run. A resumed session
> reads **this file first**, then `progress.md`. Updated at every checkpoint.
> If this file and `progress.md` disagree, `progress.md` is authoritative for
> shipped work; this file is authoritative for what is *in flight right now*.

**Run started:** 2026-08-13
**Operator:** away — do not block on questions. Decisions get made and recorded
in the decisions log in `progress.md`.

**Operator contact:** Slack DM, channel `D09NPEQKA0P` (user `U09NPEQB2K1`), via
the Slack MCP tools. The operator explicitly asked to be pinged there for
questions and blockers — use it rather than stalling. Do not use it as a
progress feed; only send when a decision is genuinely needed or something is
blocked.

**Notion.** The connector IS authorized (`claude mcp list` shows
`claude.ai Notion — ✔ Connected`), but a session's MCP tool registry is fixed at
startup, so the session that began before the connector was authorized has no
Notion tools and cannot acquire them. Re-authenticating mid-session does not
help; subagents and workflow agents inherit the same registry.

**If you are a fresh session: check for Notion tools first.** Search for
`notion` — if tools exist, read these before planning anything:

- Phase 16 product decisions — https://app.notion.com/p/39c0e1f4dd108035b7c5cc58ca9d4e66
- Phase 16 technical architecture — https://app.notion.com/p/39c0e1f4dd1081a7991ee97db98ac4dd
- Phase 16 designer brief — https://app.notion.com/p/39c0e1f4dd1081998220c26cf4ff7a94
- Phase 15 spec — https://app.notion.com/p/39b0e1f4dd1081ecb2a6e19cc86f00a1
- Tasks Tracker rows prefixed `Phase 15 ·` and `Phase 16 ·` (per-task evidence),
  and any row tagged `[BLOCKED ON YOU]` (external blockers: POK merchant
  credentials, designer delivery, accountant VAT/fiscalization answers, Meta
  AI-provider policy re-check, ToS/privacy sign-off).

Gmail and Google Calendar are in the same state — authorized, not registered.
If Notion tools still do not appear in a fresh session, work from the repo and
flag what appears to live only in Notion rather than guessing at it.

## Standing authority (granted 2026-08-13)

Allowed without asking:

- Commit and push feature branches to `origin`.
- Merge feature branches into `preview` and let Vercel deploy the preview env.
- Run Drizzle migrations against the hosted **dev** and **preview** Supabase
  projects (`pnpm db:migrate:preview`).

**Not** allowed without asking:

- Merging `preview` → `main`, i.e. any production deploy.
- Running migrations against the **production** Supabase project.
- Anything that spends money, sends a real patient/PT message, or touches
  production data.

Scope: close every codeable gap plus a full hardening audit. Externally blocked
items get built so they are ready the moment the blocker clears. Non-trivial
refactors are allowed when the repo's own toolchain (`pnpm typecheck`,
`pnpm lint`, `pnpm test:all`) stays green and the reasoning is written into the
decisions log.

## Rate-limit protocol

Plan is **Max 5x**. There is no readable limit meter, so burn is estimated from
the local transcripts at API list prices:

```bash
python3 /private/tmp/claude-501/-Users-kd-Projects-personal-medium/de0c6afd-a23a-4c6f-9da9-f9335f2650c6/scratchpad/usage_meter.py --history
```

- Ceiling estimate: **$459** — the largest 5-hour-window burn ever recorded on
  this machine (2026-07-30). Treated as a lower bound on the real ceiling.
- **Stop threshold: $420** (~92%). At that point: finish the current agent,
  commit, update this file and `progress.md`, then stop.
- The window is rolling, not fixed — headroom returns gradually as old messages
  age out. `window frees up at` in the meter output is when the oldest message
  in the current window expires.

A one-shot scheduled task (`medium-autopilot-resume`) acts as a dead-man's
switch: it is armed a few hours ahead and pushed forward at every checkpoint.
If this session dies, it fires, reads this file, and continues.

## Waves

1. **Deadline + known defects** — Embedded Signup v3→v4 (hard Meta cutoff
   2026-10-15), the 8 failing `sendUpcomingReminderTemplate` integration tests,
   Meta rate-card `⚠ CONFIRM` placeholders, the unguarded
   `BILLING_PLAN_OVERRIDES` → reasoning/`maxOutputTokens` regression path.
2. **Security, multi-tenancy, GDPR audit.**
3. **Reliability + observability gaps.**
4. **Performance, accessibility, Lighthouse.**
5. **Launch-readiness dossier** — what remains, who unblocks it, in what order.

## Status

**Current wave:** 0 — discovery
**In flight:** 11-dimension production-readiness audit workflow.
**Branch:** `prod-readiness` (off `main` at `361189a`)
**Last checkpoint:** 2026-08-13 12:15 CEST — audit running, ground truth
established on the failing tests.

## Environment facts confirmed this run

- **Docker is running and the local Supabase stack is up**, so
  `pnpm test:integration` is runnable here. (Local Realtime, Storage, imgproxy,
  edge-runtime and pooler services are stopped.)
- **There is no CI.** `.github/` does not exist, and the Husky pre-commit hook
  runs `pnpm lint` + `pnpm typecheck` only — **no tests**. Nothing automated has
  ever run this suite.

## Verified findings (established by running the suite, not by an agent)

- **The 8 "pre-existing, unrelated" `sendUpcomingReminderTemplate` failures are
  a stale date fixture.** The test hardcodes the appointment at
  `2026-08-01T09:00:00.000Z`; today is later, so the action correctly answers
  "Nuk ka takim të ardhshëm" and every downstream assertion dies on undefined.
  They began failing on **2026-08-01**, not at the AI change they were logged
  against — the manual-reminder path has been unverified since then.
- **The suite decays with the wall clock.** 27 test files hardcode an absolute
  date; exactly 1 freezes time. `2026-09-01`, `2026-10-24` and `2026-10-25` are
  still-armed time bombs.
- **Integration tests are not isolated from local DB state.** Two consecutive
  runs on the same commit gave 23 failures / 3 files, then 8 failures / 1 file.
  A dirty database invents 15 extra failures.

Full detail, including reproduction, is in the run scratchpad at
`verified-findings.md`.

## Log

_Newest last. One line per checkpoint._

- 2026-08-13 — Run start. Read trackers, confirmed authority + scope, built the
  usage meter, armed the resume task, confirmed the Slack channel.
- 2026-08-13 — Launched the 11-dimension audit. Independently ran the
  integration suite and root-caused the 8 carried failures (stale fixture, not a
  product bug), plus the systemic test-decay and DB-isolation problems above.
  Burn at this checkpoint: ~$110 of the $420 stop threshold.
