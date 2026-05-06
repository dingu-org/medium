# Task manager

Working plan and progress tracker for building **Medium** — the multi-tenant SaaS that lets solo physical therapists run patient bookings over WhatsApp with an AI agent.

This is the operational counterpart to `docs/tech-stack-and-architecture.md`. The tech doc says *what* we are building; the files here track *how far along* we are.

## Files

| File | Purpose |
|---|---|
| [project-plan.md](project-plan.md) | Master roadmap: phases, dependencies, MVP cut line, rough effort. |
| [progress.md](progress.md) | Living status: current phase, in-flight tasks, blockers, decisions. Update at the end of every working session. |
| [phases/](phases/) | One file per phase with detailed tasks and acceptance criteria. Tick boxes as you go. |

## How to use

1. Open [project-plan.md](project-plan.md) for the big picture and current phase.
2. Open the matching file under [phases/](phases/) and work tasks top-to-bottom.
3. When a task is complete, tick its checkbox in the phase file.
4. At session end, update [progress.md](progress.md) with what changed, what's next, and any blockers.
5. When all acceptance criteria for a phase are ticked, mark the phase complete in `progress.md` and move to the next.

## Source documents

- `docs/tech-stack-and-architecture.md` — definitive technical plan; the phasing here flows from sections 4–13 of that document.
- `docs/medium-canvas/documents/` — product specs (AI behavior, PWA screens, WhatsApp architecture, reminders, user flows).
- `docs/medium-canvas/blobs/` — supporting research (competitive landscape, PT pain points, decisions).

The plan is intentionally a thin layer on top of those docs — re-read the relevant section before starting any phase.
