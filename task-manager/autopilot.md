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
python3 task-manager/autopilot/usage-meter.py --history
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

**Wave 1 is complete and verified.** The dead-man's-switch task is currently
**disabled**; re-arm it before any unattended stretch.

**Current wave:** 1 — complete; Wave 2 (security, tenancy, GDPR) not started
**Branch:** `prod-readiness` (off `main` at `361189a`), pushed
**Last checkpoint:** 2026-08-14

Landed and independently verified — lint 0, typecheck 0, unit 68 files / 643
tests, integration 65 files / 635 tests, build clean:

| Commit | What |
|---|---|
| `22634cb` | POK `getOrder` 404-vs-error unit test |
| `d93ef43` | Every test fixture date derived from a clock, not hard-coded |
| `89188e7` | Integration suite made independent of local DB state |
| `8fdb66a` | CI gate (`.github/workflows/ci.yml`) |
| `5777b0a` | Embedded Signup v4 + exact-origin check |
| `94cf336` | Deleted deterministic escalation detection and the keyword setting |
| `4dcb904` | The AI-decided handoff offer |
| `e585b7a` | Non-text inbound messages + notify the professional at the cap |

### Open, needing the operator

- **The "PO" collision.** The reminder parser also reads `PO` as *confirm my
  appointment*. With both a reminder and a handoff offer outstanding, `PO`
  confirms the appointment, the escalation silently never happens, and the
  anchor stays armed. Proved end to end by the verifier. Which subsystem wins is
  a product call — recommendation on the table is *whichever question was asked
  most recently*. **Do not implement until answered.**
- Make the CI workflow a **required status check** on `main` and `preview`
  (repo admin only). Until then the gate reports but blocks nothing.
- Claim the `ADMIN_EMAILS` address in production Supabase.
- Live phone test for Embedded Signup v4, then repoint and redeploy each env.

### Known defects queued for the orchestrator to fix

- The handoff anchor is cleared **before** the escalation, non-transactionally —
  a crash between the two loses the offer permanently.
- `lib/ai/prompts/scheduling-assistant.ts` forbids discussing billing while the
  new scope bullet promises prices. For a salon `sa kushton?` is the commonest
  question of all.

### Durable artifacts (nothing lives in a session scratchpad any more)

| Path | What it is |
|---|---|
| `task-manager/autopilot/usage-meter.py` | Rolling-window burn meter. `python3 task-manager/autopilot/usage-meter.py --history`. Parses every local Claude Code transcript, dedupes by message id, prices at API list rates. Reports the current 5h window and the historical peak window (the empirical ceiling). |
| `task-manager/autopilot/audit-workflow.js` | The 11-dimension audit. Already run; kept so the dimension prompts are reproducible. |
| `task-manager/autopilot/verify-workflow.js` | Adversarial verification of the audit's claims, the prod-config dimension, an independent security second opinion, and the wave plan. Already run. |
| `task-manager/autopilot/wave1-tests-workflow.js` | Wave 1 Track A — test repair, DB isolation, CI. Already run. |
| `task-manager/autopilot/wave1-tracks-bc-workflow.js` | Wave 1 Tracks B/C — escalation redesign, Embedded Signup v4. Already run. |
| `../medium-audits/` | **Outside the repo, deliberately.** All audit and verification findings. See the section above. |

## Subagent model policy

Set by the operator; applies to every workflow this run spawns.

| Agent role | Model | Effort |
|---|---|---|
| **Planning** — plans, designs, research, architecture, audits, synthesis | **`fable`** | `max` |
| **Implementation** — writing or changing code | `opus` | `xhigh` |
| Verification / adversarial review | `opus` | `xhigh` |

The main session orchestrates only: it does not plan or write code inline.

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

## Audit and verification findings — kept OUT of this repository

**This repository is public.** Detailed findings name unfixed weaknesses with
file paths, line numbers and reproduction steps, which is a working guide for
anyone who reads them before the fixes land. They are therefore not committed
here.

They live outside the checkout, at `../medium-audits/` relative to the repo
root (`/Users/kd/Projects/personal/medium-audits`), and belong in Notion as the
durable home:

| File | What it holds |
|---|---|
| `2026-08-13-production-readiness.md` | 38 raw, unverified findings across 10 dimensions |
| `2026-08-13-raw.json` | the same, machine-readable |
| `2026-08-13-verification.md` | the adversarial re-check, the ranked wave plan, and the operator action list |
| `2026-08-13-verification-raw.json` | the same, machine-readable |
| `2026-08-13-verified-by-orchestrator.md` | findings established by running the suite directly |

`task-manager/audits/` is gitignored so this cannot recur by accident. If a
future run produces findings, write them there or to Notion — never to a
tracked path.

Note for honesty: these files **were** committed and pushed publicly between
2026-08-13 and 2026-08-14 (commits `15755e2` and `b16b7bf`). Removing them stops
further indexing but does not un-publish them; the content should be treated as
disclosed until the underlying issues are fixed.

## Log

_Newest last. One line per checkpoint._

- 2026-08-13 — Run start. Read trackers, confirmed authority + scope, built the
  usage meter, armed the resume task, confirmed the Slack channel.
- 2026-08-13 — Launched the 11-dimension audit. Independently ran the
  integration suite and root-caused the 8 carried failures (stale fixture, not a
  product bug), plus the systemic test-decay and DB-isolation problems above.
  Burn at this checkpoint: ~$110 of the $420 stop threshold.
