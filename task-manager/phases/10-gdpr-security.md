# Phase 10 — GDPR & security

**Goal.** Retention works, right-to-erasure cascades correctly, per-PT and per-patient data export produces valid JSON, the audit log records every patient-data access, and EU residency is verified end-to-end.

**Source.** Tech doc §6 (security), §10 (GDPR).

**Effort.** 2–3 days, but obligations are sprinkled throughout earlier phases.

**Prerequisites.** Phase 1 set up the audit log + tenancy helper. Phase 5 added the retention job.

---

## Tasks

### Retention

- [ ] Verify `purgeExpiredMessages` (Phase 5) deletes messages older than `pts.retention_days`.
- [ ] Test with fixture: PT with `retention_days = 30`, message dated 31 days ago → deleted.
- [ ] Aggregate metrics (counts) retained indefinitely in `events` (anonymised — no patient PII).
- [ ] Document the policy in the privacy page (Phase 12 ships the page; copy is drafted here).

### Right to erasure (per-patient)

- [ ] `lib/patients/erase.ts` — `erasePatient(patientId, ptId)` Server Action:
  - [ ] Cascade delete in a single transaction:
    - `messages` for the patient's conversations
    - `conversations` for the patient
    - `appointments` for the patient (all statuses, all times)
    - `reminder_jobs` for those appointments (cancel scheduled Inngest runs first)
    - finally `patients` row
  - [ ] Insert audit-log entry: action `erasure`, target `patients`, target_id, before-state hash for proof.
  - [ ] Idempotent: re-running on an already-erased id is a no-op.
- [ ] Surface the action in the patient detail view with a confirmation dialog ("This deletes all messages, appointments, and patient data. Cannot be undone.").

### Right to erasure (full PT account)

- [ ] Settings → Danger Zone → "Delete account":
  - [ ] Cascade everything tied to the PT (all tables).
  - [ ] Disconnect WhatsApp (revoke Meta token).
  - [ ] Delete the Supabase Auth user.
  - [ ] Final audit-log entry written to a long-term archive table (compliance-required record of the erasure event itself).
- [ ] Two-step confirmation (type the practice name to confirm).

### Data export

- [ ] `exportPatient(patientId, ptId)` Server Action — returns JSON `{ patient, conversations, messages, appointments, audit_log_entries_for_patient }`.
- [ ] `exportPt(ptId)` Server Action — full export including all patients, settings, connections (token redacted), templates, events.
- [ ] Triggered from a settings UI; produces a download.
- [ ] Audit-logged.

### Audit log polish

- [ ] Every `lib/tenancy/` helper writes an audit-log row — verified from Phase 1 unit tests.
- [ ] Add audit-log writes for sensitive operations not covered by the helper (Embedded Signup token issuance, manual takeover, erasure, export).
- [ ] Set audit-log retention to GDPR minimum (e.g., 2 years for healthcare-adjacent context — confirm with legal).

### Token + key management

- [ ] Verify `whatsapp_connections.access_token_encrypted` is never decrypted outside `lib/channels/whatsapp/client.ts`.
- [ ] Verify tokens never appear in logs (grep through Vercel / Supabase / Axiom samples if Axiom is enabled).
- [ ] Document the key-rotation procedure: re-encrypt all rows under a new `TOKEN_ENCRYPTION_KEY` (manual SQL script, run in maintenance window).

### EU residency verification

- [ ] Supabase project: confirm region = Frankfurt (`eu-central-1`).
- [ ] Vercel functions: confirm region = `fra1`.
- [ ] Inngest: confirm processing region = EU.
- [ ] OpenRouter: confirm prompt logging and product-use opt-ins remain disabled for production.
- [ ] AI routing: default production requests to ZDR + denied provider data collection, then document that non-Enterprise OpenRouter plans do not guarantee EU-only inference.
- [ ] Document any upstream AI providers actually used in production and their cross-border transfer implications in the privacy policy under "subprocessors".

### Controller / processor split

- [ ] Privacy policy reflects PT as data controller, Medium as processor.
- [ ] DPA template ready for PT customers (not blocking MVP, but should exist).
- [ ] Subprocessor list: Supabase, Vercel, OpenRouter, Inngest, Meta, plus whichever upstream AI providers OpenRouter uses in production.

### Cookie / consent

- [ ] Confirm what we drop on first visit. No third-party analytics cookies should exist in the current MVP.
- [ ] No tracking cookies before consent on the marketing pages.

---

## Acceptance criteria

- [ ] Erasing a patient cascades all related rows in one transaction; orphaned rows are zero (verified by an integrity query).
- [ ] Erasing also cancels any scheduled reminder Inngest runs for that patient.
- [ ] Per-patient export returns expected JSON shape; matches what a DSAR (data subject access request) would expect.
- [ ] Audit log shows entries for every read, write, and erasure of patient data.
- [ ] EU-hosted system-of-record services are confirmed, and any non-EU AI processing is documented accurately in privacy/subprocessor materials.
- [ ] Privacy policy + ToS drafts exist (final version ships with Phase 12).
- [ ] Token encryption round-trip works under a new key (rotation procedure tested on a fixture).

---

## Notes

- "Right to erasure" is a hard requirement — make sure cascade deletes truly cascade. A scheduled Inngest run for a deleted appointment that fires anyway is a leak.
- Don't keep "anonymised" data that's actually re-identifiable. Counts per day per PT are fine; counts per patient per day are not.
- The audit log itself shouldn't contain PII in payloads — it records *that* a row was accessed, by whom, when. Not the row contents.
- This phase doesn't need a special phase ordering; sprinkle work into earlier phases as obligations arise. The dedicated phase is for verification + polish + final docs.
