# Data Processing Agreement (template)

**Status: draft.** This is a starting template for PT (practitioner) customers
who require a DPA under GDPR Art. 28. It is not a substitute for legal review
before use with a real customer contract.

---

## Parties

- **Controller**: the practitioner ("PT") using Medium to manage their
  patients' appointments and WhatsApp communication. The PT determines the
  purposes and means of processing their patients' personal data (scheduling,
  messaging, clinical/administrative notes).
- **Processor**: Medium, processing patient personal data solely on the PT's
  documented instructions, as configured through the app (retention period,
  WhatsApp connection, AI assistant settings) and as described in this
  agreement.

## Subject matter and duration

Processing covers the categories of personal data below for as long as the PT
maintains an active Medium account, plus any retention period configured in
Settings (`pts.retention_days`) or required by law, and ends on account
deletion (see "Erasure" below).

## Categories of data subjects

- The PT's patients (data subjects contacted via WhatsApp or manually entered).
- Indirectly, the PT themselves (account/profile data), though the PT is
  controller, not data subject, for the purposes of this DPA.

## Categories of personal data

- Patient identity and contact data: name, phone number, WhatsApp ID.
- Appointment data: scheduling, service type, notes, cancellation reasons.
- Conversation data: WhatsApp message content and metadata.
- Free-text notes the PT records about a patient.

No special-category (Art. 9) health data is intentionally solicited by the
product; PTs are responsible for not entering special-category data into free
text fields beyond what their own regulatory context permits.

## Processor obligations

- Process patient personal data only on the PT's instructions (as expressed
  through product configuration), except where required by EU/member-state law.
- Ensure personnel with access to the system-of-record are bound by
  confidentiality.
- Implement the technical/organisational measures described in
  `docs/tech-stack-and-architecture.md` §6/§10 — encryption of WhatsApp access
  tokens at rest, row-level tenant isolation (Postgres RLS), audit logging of
  patient-data reads/writes/erasures, EU-hosted system-of-record services.
- Assist the PT in responding to data subject requests (export, erasure) —
  the product ships self-service `exportPatient`/`exportPt` and
  `erasePatient`/account-deletion actions for this purpose.
- Notify the PT without undue delay upon becoming aware of a personal data
  breach.
- Make available the subprocessor list (`docs/gdpr/subprocessors.md`) and
  notify the PT of material subprocessor changes.
- Delete or return all patient personal data at the end of the relationship
  (account deletion cascades all patient data via database foreign keys; a
  compliance record of the erasure event itself is retained in a separate
  archive table that is not personal data — see `erasure_archive`).

## Subprocessors

See `docs/gdpr/subprocessors.md` for the current list and their processing
locations. The PT is deemed to have authorised the listed subprocessors as of
the DPA's effective date; material additions will be communicated in advance.

## International transfers

Where a subprocessor processes data outside the EEA (see the OpenRouter /
upstream AI note in `subprocessors.md`), Medium relies on that subprocessor's
Standard Contractual Clauses or equivalent safeguard, and discloses this in
the product's privacy policy.

## Audit rights

The PT may request reasonable evidence of compliance with this DPA (e.g. a
summary of technical/organisational measures); a full third-party audit
program is not offered at MVP stage.

---

*This template should be reviewed by counsel before being offered as a
binding agreement to customers, and updated if the subprocessor list, hosting
regions, or AI-provider routing change.*
