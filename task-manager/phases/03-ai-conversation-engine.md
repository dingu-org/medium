# Phase 3 — AI conversation engine

**Goal.** A channel-agnostic conversation engine that runs AI SDK turns through OpenRouter — `nvidia/nemotron-3-ultra-550b-a55b:free` in dev/preview (env-driven) and `anthropic/claude-haiku-4.5` in prod (from `lib/billing/plans.ts`, post-cutover; no reasoning effort — it cannot fit inside the turn's 500-token `maxOutputTokens`) — and emits the model's chosen tool calls to the appointments layer.

**Source.** Tech doc §3 (module boundaries), §8 (AI orchestration); product spec `docs/medium-canvas/documents/ai-conversation-behavior.md`.

**Effort.** 4–5 days.

**Prerequisites.** Phase 1 complete. Phase 4 (appointments) provides the tool implementations — for this phase, stub them and finalise wiring in Phase 5.

---

## Implementation decisions (2026-06-10)

- Use AI SDK `6.0.199` with `@openrouter/ai-sdk-provider` `2.9.0`.
- The model never supplies `pt_id` or `patient_id`; both come from the validated engine context.
- Add `list_upcoming_appointments` so cancel/reschedule calls can resolve an appointment before mutating it.
- Add `messages.reply_to_message_id` with a unique AI-reply index for replay idempotency, plus
  `messages.ai_cost_microusd` for OpenRouter usage accounting.
- ~~Deterministic safety checks handle explicit human requests plus emergency, legal, billing,
  insurance, and severe-frustration phrases before model inference.~~ **Reversed 2026-08-14**:
  nothing pattern-matches the patient's words. The model decides — `escalate_to_human` when a person
  is asked for, `offer_human_handoff` for anything outside scheduling — and the engine answers the
  latter with one static offer that only the immediately next message can accept. See the decisions
  log in `progress.md`.
- Keep the current PT profile shape and English-only v1. Unknown phone/address details are omitted.
- Keep patient-controlled profile names out of the system prompt; identity remains in validated database context.
- Serialize each inbound turn with a transaction-scoped Postgres advisory lock so concurrent retries cannot execute tools twice.
- Empty/step-limited read-only turns remain retryable. If a mutation was attempted, persist a neutral human-verification handoff instead of rerunning the mutation.
- Completion includes a synthetic, non-PHI live smoke against the free development model only.

---

## Tasks

### SDK + client

- [x] Install pinned `ai@6.0.199` and `@openrouter/ai-sdk-provider@2.9.0`.
- [x] `lib/ai/client.ts` — shared AI SDK / OpenRouter wrapper; reads `OPENROUTER_API_KEY` and keeps provider routing options in one place.
- [x] `lib/ai/models.ts` — exports `selectModelForPlan()` returning `OPENROUTER_MODEL_OVERRIDE` as the primary when set, else the plan's entry for `appEnv()` in the per-environment table (`lib/billing/plans.ts`). Superseded the per-environment env vars on 2026-08-04: one table, one request shape, values differing per environment. Provider/privacy routing resolves at the same seam.
- [x] Unit tests covering all three `selectModel()` branches plus the missing-env throw.
- [x] Codify the routing policy in one place: ZDR on, provider data collection denied, parameter-safe routing, and same-model provider fallback. Apply it on every route call.
- [x] Keep model selection behind `selectModel()` so swapping or A/B-testing models is an env change, not a code change.

### Tool schemas — `lib/ai/tools.ts`

Each tool is a typed Zod schema exposed through AI SDK tool definitions.

- [x] `get_availability(start: ISO, end: ISO, service_type?: string)` → list of `{ starts_at, ends_at }` slots.
- [x] `book_appointment(starts_at, service_type, notes?)` → `{ appointment_id, status, confirmation_summary }`.
- [x] `reschedule_appointment(appointment_id, new_starts_at)` → updated appointment.
- [x] `cancel_appointment(appointment_id, reason?)` → updated appointment.
- [x] `list_upcoming_appointments()` → upcoming appointment summaries for cancel/reschedule discovery.
- [x] `escalate_to_human(reason)` → `{ ok: true }`; flips `conversations.ai_active = false`.
- [x] All tools take implicit `pt_id` + `patient_id` from engine context — the AI never sees or supplies either.

### Tool dispatcher — `lib/ai/dispatcher.ts`

- [x] `dispatch(toolName, input, ctx) -> Promise<ToolResult>`.
- [x] Validates input against Zod schema (defence in depth).
- [x] Calls into Phase 3 appointment stubs or `lib/conversation` for real escalation.
- [x] Wraps in `withAuditLog` from `lib/tenancy`.
- [x] On error, returns a structured error result the model can recover from — never throws to the model.

### System prompt + caching — `lib/ai/prompt.ts`

- [x] Static prefix (loaded from a markdown file under `lib/ai/prompts/`):
  - Persona: friendly, concise, EU PT receptionist.
  - Booking rules: never double-book; always confirm time; offer alternatives if unavailable.
  - Escalation rules: keyword (PT-configured), repeated failures, complex requests.
  - Tool-use guidelines.
- [x] Per-PT section renders PT name, AI name, greeting, escalation keyword, timezone, and retention window. Phase 3 is English-only because the current PT profile has no language field.
- [x] Include UTC ISO and human-readable practice-local current time; reject invalid IANA timezones instead of silently falling back.
- [x] Exclude the patient-controlled profile name from the system prompt and instruct the assistant not to request it.
- [x] Keep static + per-PT sections factored so a caching-capable model can be introduced later without rewriting the prompt builder.
- [x] Keep tool definitions static so they can join the cached prefix when prompt caching is introduced.

### Conversation engine — `lib/conversation/engine.ts`

- [x] `runTurn({ inboundMessage }) -> OutboundMessage`; tenant, patient, conversation, and message IDs are verified against persisted context.
- [x] Loads conversation history (last N messages — windowed, not unbounded).
- [x] Picks the model through `selectModel()`.
- [x] Calls AI SDK `generateText` with an OpenRouter model, `system`, `tools`, `messages`, and a bounded multi-step loop (`stopWhen: stepCountIs(5)`).
- [x] If a step includes tool calls, dispatches them via `lib/ai/dispatcher`, feeds the tool results back into the next step, and stops cleanly after the configured cap.
- [x] Persists each AI turn into `messages` with `tokens_in`, `tokens_out`, `model`, `provider`, and `cached_tokens`.
- [x] Persists `reply_to_message_id` and `ai_cost_microusd`; duplicate runs return the existing reply.
- [x] Acquires a per-inbound transaction-scoped Postgres advisory lock before context reads, inference, tool execution, and persistence.
- [x] Orders equal-timestamp history rows deterministically by message ID.
- [x] Returns a state-aware handoff after mutation-attempted empty/step-limited turns; read-only failures remain typed and retryable.
- [x] Exports idempotent `handoffFailedTurn({ inboundMessage })` for Phase 5 retry exhaustion.
- [x] Returns the final assistant text content.

### Handoff offer (replaced the deterministic safety guard, 2026-08-14; acceptance handed to the model 2026-08-30)

- [x] The model alone decides a request is out of scope and calls `offer_human_handoff`; nothing inspects the inbound message before inference.
- [x] One static, vertical-agnostic offer for every case, interpolating the business name; no emergency guidance.
- [x] The offer asks a plain question and names no keyword. **Superseded:** it used to end in "përgjigjuni me PO", anchored to the message it answered (`conversations.handoff_offer_message_id`, migration `0029`), accepted only by the immediately-next message and only on a keyword match. That parser could not be made correct — six ordinary ways of declining parsed as a yes — so the whole mechanism was deleted.
- [x] The model reads the acceptance out of the conversation history and calls `escalate_to_human`; nothing records that an offer is outstanding. Bounded by `HISTORY_LIMIT` (20 messages); an offer answered later is simply re-offered.
- [x] A successful escalation is a stop condition, and the engine — not the model — sends one fixed sentence, shared with the failed turn and the billing cap.
- [ ] **C3, a separate later deploy:** drop `conversations.handoff_offer_message_id`. The column is dead but still declared; dropping it while running code selects it is the one ordering that breaks.

### Model routing policy — `lib/ai/models.ts` + `lib/ai/client.ts`

- [x] Engine routes every runtime turn through `selectModel()` — no model ID constants in engine call sites.
- [x] One per-environment model table in `plans.ts` for every environment. Production: `anthropic/claude-haiku-4.5` + `openai/gpt-5-mini` fallback, ZDR routing. Dev/preview: `nvidia/nemotron-3-ultra-550b-a55b:free`, no fallback, no ZDR. No environment sets a reasoning effort. `OPENROUTER_MODEL_OVERRIDE` swaps the primary id in any environment.
- [x] Keep the selection behind the helper so a future runtime fallback chain can be added without touching the engine call sites.
- [x] If the resolved model becomes unavailable or inadequate, fail observably; provider fallbacks may serve only the same resolved model under the enforced routing policy.

### Channel-agnostic shape

- [x] `lib/conversation/types.ts` — persisted inbound/outbound shapes carry message, conversation, tenant, patient, channel, and reply-link metadata.
- [x] Phase 5's inbound job is documented as the channel adapter-to-engine translation boundary.
- [x] Runtime code in `lib/conversation/` has no WhatsApp dependency or channel-specific branch.

### Stubs to be replaced in Phase 4

- [x] Tool dispatcher returns canned responses for `get_availability` / `book_appointment` etc. so this phase is testable without Phase 4.

---

## Acceptance criteria

- [x] Given a fixture inbound "I'd like to book a session next week", the engine returns a coherent response that calls `get_availability` and (with stubbed slots) `book_appointment`.
- [x] `selectModelForPlan()` keys on `appEnv()` (never `NODE_ENV`) and reads the per-environment table; `OPENROUTER_MODEL_OVERRIDE` swaps the primary id in any environment.
- [x] Tool input that fails Zod validation does not throw — it surfaces as a tool result error and the model recovers on the next turn.
- [x] Engine runtime has no WhatsApp imports — only the channel-agnostic shape.
- [x] Re-running a turn for the same inbound message returns the existing AI reply.
- [x] Two concurrent runs for one inbound message execute the model and mutating dispatcher only once.
- [x] Patient-controlled profile names are absent from the system prompt, and practice-local current time is explicit.
- [x] A mutation followed by no final model text escalates without retrying the mutation and preserves turn usage metadata.
- [x] Synthetic live smoke confirms the free dev model can call a tool without sending patient data.
  - Attempted twice on 2026-06-10 with synthetic data only. OpenRouter reached the configured
    model route, but Venice returned a temporary upstream rate limit before inference.
  - Retried on 2026-06-17. The Venice-backed Llama route still returned an upstream rate limit;
    `openai/gpt-oss-20b:free` had no ZDR-matching endpoint. Switched the dev default to
    `nex-agi/nex-n2-pro:free`; `pnpm ai:smoke` passed through SiliconFlow with one
    `get_availability` tool call and no patient data.

---

## Notes

- AI SDK tool calls return _structured_ results — never ask the model to emit JSON in prose. Tool result → next step → natural-language confirmation.
- Keep provider-specific details inside `lib/ai/`; the rest of the app should only know about the channel-agnostic engine and model IDs.
- OpenRouter privacy defaults are part of the contract, not a tuning nicety. If a later feature wants looser routing, make that an explicit, reviewed exception.
- Keep the message window small (last ~10 turns) to control input tokens; the cached system prompt has the persona, not the whole history.
