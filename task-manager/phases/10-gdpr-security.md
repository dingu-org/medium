# Phase 10 — GDPR & security

**Goal.** Retention works, right-to-erasure cascades correctly, per-PT and per-patient data export produces valid JSON, the audit log records every patient-data access, and EU residency is verified end-to-end.

**Source.** Tech doc §6 (security), §10 (GDPR).

**Effort.** 2–3 days, but obligations are sprinkled throughout earlier phases.

**Prerequisites.** Phase 1 set up the audit log + tenancy helper. Phase 5 added the retention job.

---

## Tasks

### Retention

- [x] Verify `purgeExpiredMessages` (Phase 5) deletes messages older than `pts.retention_days`.
- [x] Test with fixture: PT with `retention_days = 30`, message dated 31 days ago → deleted.
- [ ] Aggregate metrics (counts) retained indefinitely in `events` (anonymised — no patient PII).
- [x] Document the policy in the privacy page (Phase 12 ships the page; copy is drafted here).

### Right to erasure (per-patient)

- [x] `lib/patients/erase.ts` — `erasePatient({patientId, ptId})` Server Action: *(object-param signature, not positional as spec'd — same contract)*
  - [x] Cascade delete in a single transaction:
    - `messages` for the patient's conversations
    - `conversations` for the patient
    - `appointments` for the patient (all statuses, all times)
    - `reminder_jobs` for those appointments (cancel scheduled Inngest runs first) *(emits `appointment.cancelled` in-tx before deletion so `cancelOn` kills the scheduled Inngest run; pseudonymous events/event_outbox rows are deliberately kept — see 2026-07-11 decision)*
    - finally `patients` row
  - [x] Insert audit-log entry: action `erasure`, target `patients`, target_id, before-state hash for proof.
  - [x] Idempotent: re-running on an already-erased id is a no-op.
- [x] Surface the action in the patient detail view with a confirmation dialog ("This deletes all messages, appointments, and patient data. Cannot be undone.") *(typed-name confirm Dialog under "Zona e rrezikut")*.

### Right to erasure (full PT account)

- [x] Settings → Danger Zone → "Delete account":
  - [x] Cascade everything tied to the PT (all tables).
  - [x] Disconnect WhatsApp (revoke Meta token) *(best-effort `detachWabaSubscription` via `subscribed_apps` DELETE, warn-and-continue — Meta has no true revoke for Embedded Signup system-user tokens; never blocks deletion)*.
  - [x] Delete the Supabase Auth user.
  - [x] Final audit-log entry written to a long-term archive table (compliance-required record of the erasure event itself) — new `erasure_archive` table (scope `'account'`), written before auth-user deletion.
- [x] Two-step confirmation (type the practice name to confirm) *(switched from typing literal 'DELETE' — Phase 10 spec wins over the Phase 14 canvas copy)*.

### Data export

- [x] `exportPatient(patientId, ptId)` Server Action — returns JSON `{ patient, conversations, messages, appointments, audit_log_entries_for_patient }` *(`buildPatientExport`; DSAR audit section matches across patient/conversation/message/appointment target ids, not just patientId — an adversarial-review fix)*.
- [x] `exportPt(ptId)` Server Action — full export including all patients, settings, connections (token redacted), templates, events *(`buildPtExport`; whatsapp connection selected with an explicit column list omitting `access_token_encrypted`, annotated `'REDACTED'`)*.
- [x] Triggered from a settings UI; produces a download *(`exportPt` Server Action + settings `export-data.tsx` Blob download; per-patient export also on the client-detail page)*.
- [x] Audit-logged.

### Audit log polish

- [x] Every `lib/tenancy/` helper writes an audit-log row — verified from Phase 1 unit tests (still green in `test:all`).
- [x] Add audit-log writes for sensitive operations not covered by the helper (Embedded Signup token issuance, manual takeover, erasure, export) — `withAuditLog` around `createManualClient` (`patient.created`), `updateClientNotes` (`patient.notes_updated`), `setTakeover` (`conversation.takeover`), token issuance (`wa.token.issued`, metadata only), exports, erasure. *(scoped to enumerated sensitive operations, not every dashboard read — see 2026-07-11 decision)*
- [ ] Set audit-log retention to GDPR minimum (e.g., 2 years for healthcare-adjacent context — confirm with legal). *(implemented: nightly purge cron deletes rows past `AUDIT_LOG_RETENTION_DAYS`=730 — external: confirm-with-legal tracked in Notion for Klaidi)*

### Token + key management

- [x] Verify `whatsapp_connections.access_token_encrypted` is never decrypted outside `lib/channels/whatsapp/client.ts` *(export/erase code paths deliberately never touch the encrypted column)*.
- [x] Verify tokens never appear in logs (grep through Vercel / Supabase / Axiom samples if Axiom is enabled) *(static grep audit + console-spy test carried from Phase 2; Axiom isn't enabled)*.
- [x] Document the key-rotation procedure: re-encrypt all rows under a new `TOKEN_ENCRYPTION_KEY` (manual SQL script, run in maintenance window) — shipped as `scripts/rotate-token-key.ts` / `pnpm rotate:token-key` (single tx, per-row round-trip verify, throws→rollback) instead of manual SQL, plus `docs/gdpr/key-rotation.md`.

### EU residency verification

- [ ] Supabase project: confirm region = Frankfurt (`eu-central-1`). — external: tracked in Notion for Klaidi
- [ ] Vercel functions: confirm region = `fra1`. — external: tracked in Notion for Klaidi
- [ ] Inngest: confirm processing region = EU. — external: tracked in Notion for Klaidi
- [ ] OpenRouter: confirm prompt logging and product-use opt-ins remain disabled for production. — external: tracked in Notion for Klaidi
- [x] AI routing: default production requests to ZDR + denied provider data collection, then document that non-Enterprise OpenRouter plans do not guarantee EU-only inference *(ZDR+deny enforced since Phase 3; non-guarantee documented in `docs/gdpr/subprocessors.md`)*.
- [x] Document any upstream AI providers actually used in production and their cross-border transfer implications in the privacy policy under "subprocessors" *(`docs/gdpr/subprocessors.md`: Supabase Frankfurt, Vercel fra1, Inngest EU, OpenRouter+OpenAI cross-border note, Meta)*.

### Controller / processor split

- [x] Privacy policy reflects PT as data controller, Medium as processor.
- [x] DPA template ready for PT customers (not blocking MVP, but should exist) — `docs/gdpr/dpa-template.md` (controller=PT/processor=Medium + subprocessor annex).
- [x] Subprocessor list: Supabase, Vercel, OpenRouter, Inngest, Meta, plus whichever upstream AI providers OpenRouter uses in production — `docs/gdpr/subprocessors.md`.

### Cookie / consent

- [x] Confirm what we drop on first visit. No third-party analytics cookies should exist in the current MVP — `docs/gdpr/cookie-audit.md`: exactly 3 first-party cookies (`sb-*` auth, `onboarding_skipped`, `pw-recovery`), zero third-party/analytics.
- [x] No tracking cookies before consent on the marketing pages — same audit; nothing to consent-gate since all cookies are functional/first-party.

---

## Acceptance criteria

- [x] Erasing a patient cascades all related rows in one transaction; orphaned rows are zero (verified by an integrity query) — 5 erase test scenarios.
- [x] Erasing also cancels any scheduled reminder Inngest runs for that patient — in-tx `appointment.cancelled` before deletion, `cancelOn` kill switch.
- [x] Per-patient export returns expected JSON shape; matches what a DSAR (data subject access request) would expect — 4+1 regression tests (the +1 is the DSAR audit-scope fix).
- [x] Audit log shows entries for every read, write, and erasure of patient data. *(scoped to enumerated sensitive operations — token issuance, takeover, patient create/notes, erasure, export — plus existing AI-path audits, not literally every read; deliberate to avoid audit-log flooding, see 2026-07-11 decision)*
- [ ] EU-hosted system-of-record services are confirmed, and any non-EU AI processing is documented accurately in privacy/subprocessor materials. *(AI-processing side documented in `docs/gdpr/subprocessors.md`; region confirmations — external: tracked in Notion for Klaidi)*
- [x] Privacy policy + ToS drafts exist (final version ships with Phase 12).
- [x] Token encryption round-trip works under a new key (rotation procedure tested on a fixture) — `pnpm rotate:token-key` integration test proves rotation + rollback on fixtures.

---

## Notes

- "Right to erasure" is a hard requirement — make sure cascade deletes truly cascade. A scheduled Inngest run for a deleted appointment that fires anyway is a leak.
- Don't keep "anonymised" data that's actually re-identifiable. Counts per day per PT are fine; counts per patient per day are not.
- The audit log itself shouldn't contain PII in payloads — it records _that_ a row was accessed, by whom, when. Not the row contents.
- This phase doesn't need a special phase ordering; sprinkle work into earlier phases as obligations arise. The dedicated phase is for verification + polish + final docs.
