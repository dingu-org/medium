# Phase 3 — AI conversation engine

**Goal.** A channel-agnostic conversation engine that runs AI SDK turns through OpenRouter, picks Claude Haiku 4.5 or Sonnet 4.6 by policy, caches static prompt sections, and emits the model's chosen tool calls to the appointments layer.

**Source.** Tech doc §3 (module boundaries), §8 (AI orchestration); product spec `docs/medium-canvas/documents/ai-conversation-behavior.md`.

**Effort.** 4–5 days.

**Prerequisites.** Phase 1 complete. Phase 4 (appointments) provides the tool implementations — for this phase, stub them and finalise wiring in Phase 5.

---

## Tasks

### SDK + client

- [ ] Install `ai` and `@openrouter/ai-sdk-provider`.
- [ ] `lib/ai/client.ts` — shared AI SDK / OpenRouter wrapper; reads `OPENROUTER_API_KEY` and keeps provider routing options in one place.
- [ ] `lib/ai/models.ts` — model IDs as constants: `'anthropic/claude-haiku-4.5'`, `'anthropic/claude-sonnet-4.6'`.
- [ ] Codify the default production routing policy in one place: ZDR on, provider data collection denied, and parameter-safe routing.
- [ ] Do not set a manual provider order by default; isolate any future provider pinning or allowlists behind `lib/ai/`.

### Tool schemas — `lib/ai/tools.ts`

Each tool is a typed Zod schema exposed through AI SDK tool definitions.

- [ ] `get_availability(start: ISO, end: ISO, service_type?: string)` → list of `{ starts_at, ends_at }` slots.
- [ ] `book_appointment(patient_id, starts_at, service_type, notes?)` → `{ appointment_id, status, confirmation_summary }`.
- [ ] `reschedule_appointment(appointment_id, new_starts_at)` → updated appointment.
- [ ] `cancel_appointment(appointment_id, reason?)` → updated appointment.
- [ ] `escalate_to_human(reason)` → `{ ok: true }`; flips `conversations.ai_active = false`.
- [ ] All tools take an implicit `pt_id` from the engine context — the AI never sees or supplies it.

### Tool dispatcher — `lib/ai/dispatcher.ts`

- [ ] `dispatch(toolName, input, ctx) -> Promise<ToolResult>`.
- [ ] Validates input against Zod schema (defence in depth).
- [ ] Calls into `lib/appointments` (Phase 4) or `lib/conversation` (escalation).
- [ ] Wraps in `withAuditLog` from `lib/tenancy`.
- [ ] On error, returns a structured error result the model can recover from — never throws to the model.

### System prompt + caching — `lib/ai/prompt.ts`

- [ ] Static prefix (loaded from a markdown file under `lib/ai/prompts/`):
  - Persona: friendly, concise, EU PT receptionist.
  - Booking rules: never double-book; always confirm time; offer alternatives if unavailable.
  - Escalation rules: keyword (PT-configured), repeated failures, complex requests.
  - Tool-use guidelines.
- [ ] Per-PT section (renders into the system prompt):
  - PT name, AI name, greeting, escalation keyword, timezone, language preference, retention window.
- [ ] Keep static + per-PT sections factored so Claude prompt caching can be enabled through OpenRouter — cache writes on first turn, cache reads on subsequent turns.
- [ ] Preserve stable opening system/developer text so OpenRouter sticky routing can maximize cache hits across multi-turn conversations.
- [ ] Tool definitions live in the cached section (they're static).

### Conversation engine — `lib/conversation/engine.ts`

- [ ] `runTurn({ ptId, conversationId, inboundMessage }) -> { outboundMessage }`.
- [ ] Loads conversation history (last N messages — windowed, not unbounded).
- [ ] Picks model per the escalation policy (see below).
- [ ] Calls AI SDK `generateText` with an OpenRouter model, `system`, `tools`, `messages`, and a bounded multi-step loop (`stopWhen: stepCountIs(5)` or equivalent).
- [ ] If a step includes tool calls, dispatches them via `lib/ai/dispatcher`, feeds the tool results back into the next step, and stops cleanly after the configured cap.
- [ ] Persists each turn into `messages` with `tokens_in`, `tokens_out`, `model`, `provider`, and `cached_tokens`.
- [ ] Returns the final assistant text content.

### Model escalation policy — `lib/conversation/escalation.ts`

- [ ] Default to Haiku 4.5.
- [ ] Escalate to Sonnet 4.6 when any of:
  - [ ] ≥2 clarifying turns already exchanged in this conversation.
  - [ ] Frustration heuristics (repeated "?", "you don't understand", profanity).
  - [ ] Reschedule with multiple constraints (multiple time references in one message).
  - [ ] PT-configured escalation keyword present.
- [ ] Track per-conversation `clarifying_attempts` counter in memory or on `conversations`.

### Channel-agnostic shape

- [ ] `lib/conversation/types.ts` — `InboundMessage { conversationId, ptId, content, channel, externalId, occurredAt }`, `OutboundMessage { conversationId, content, channel }`.
- [ ] WhatsApp adapter (Phase 2) translates Graph API payload into this shape.
- [ ] No code in `lib/conversation/` references "whatsapp" by name.

### Stubs to be replaced in Phase 4

- [ ] Tool dispatcher returns canned responses for `get_availability` / `book_appointment` etc. so this phase is testable without Phase 4.

---

## Acceptance criteria

- [ ] Given a fixture inbound "I'd like to book a session next week", the engine returns a coherent response that calls `get_availability` and (with stubbed slots) `book_appointment`.
- [ ] Repeated turns in the same conversation show cache reads (visible in `cached_tokens` field of `messages`).
- [ ] Escalation policy fires Sonnet on the third clarifying turn (test with a fixture where the user keeps misunderstanding).
- [ ] Tool input that fails Zod validation does not throw — it surfaces as a tool result error and the model recovers on the next turn.
- [ ] Engine is invoked with no WhatsApp imports — only the channel-agnostic shape (verified by grep on `lib/conversation/`).

---

## Notes

- Don't try to be clever with the escalation heuristics — the doc's bar is "obvious cases". Sonnet is cheap relative to Haiku at MVP scale.
- AI SDK tool calls return *structured* results — never ask the model to emit JSON in prose. Tool result → next step → natural-language confirmation.
- Keep provider-specific details inside `lib/ai/`; the rest of the app should only know about the channel-agnostic engine and model IDs.
- OpenRouter privacy defaults are part of the contract, not a tuning nicety. If a later feature wants looser routing, make that an explicit, reviewed exception.
- Cache write is a one-time per-conversation cost; subsequent turns hit the read price (much cheaper). Confirm with token counts in the first week.
- Keep the message window small (last ~10 turns) to control input tokens; the cached system prompt has the persona, not the whole history.
