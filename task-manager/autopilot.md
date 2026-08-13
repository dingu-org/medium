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

**Notion is NOT connected** in these sessions. `task-manager/phases/15-*.md` and
`16-*.md` point at Notion documents (specs, architecture, task tracker) that
cannot be read from here. Work from the repo; flag anything that appears to
exist only in Notion rather than guessing at it.

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
**In flight:** production-readiness audit workflow (fan-out finders across
security, tenancy, billing, reliability, perf, a11y, tests, config, ESU v4).
**Branch:** `main` (clean at `361189a`)
**Last checkpoint:** run start — nothing implemented yet.

## Log

_Newest last. One line per checkpoint._

- 2026-08-13 — Run start. Read trackers, confirmed authority + scope, built the
  usage meter, armed the resume task. Discovery workflow next.
