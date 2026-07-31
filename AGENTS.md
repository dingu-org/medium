<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# How to plan and execute

Trackers live in `task-manager/`.

For any task:

1. Read what is already done and what is currently in flight in `task-manager/progress.md`.
2. Read the relevant checklist for the current phase in `task-manager/phases/` and make an implementation plan for what is still required.
3. Implement the required changes.
4. Test the changes.
5. Mark the current in-flight work as done by updating the relevant tracker files in `task-manager/`.

# Codebase understanding

This project has the `understand-anything` plugin available. Prefer its knowledge-graph skills over ad-hoc file exploration when a task needs a broad view of the codebase:

- `/understand` — this is used manually by the human to build a knowledge graph
- Once a graph exists, prefer these over a full rescan:
  - `/understand-chat` — answer questions about the codebase
  - `/understand-explain <path>` — deep-dive on a specific file/function/module
  - `/understand-diff` — assess impact/risk of the current diff or a PR
  - `/understand-domain` — business-domain/flow mapping
  - `/understand-onboard` — generate an onboarding guide
  - `/understand-dashboard` — visualize the graph in the browser (dont use this unless user asks)

# Communication

- Keep answers concise.
- Do not over-explain unless the user asks for detail.
