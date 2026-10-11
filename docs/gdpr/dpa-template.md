# Data Processing Agreement (template)

**Status: draft.** This is a starting template for business owners who
require a DPA under GDPR Art. 28. It is not a substitute for legal review
before use in a real contract with a business owner.

---

## Parties

- **Controller**: the business owner using Medium to manage their
  customers' appointments and WhatsApp communication. The business owner
  determines the purposes and means of processing their customers' personal
  data (scheduling, messaging, administrative notes).
- **Processor**: Medium, processing customer personal data solely on the
  business owner's documented instructions, as configured through the app
  (retention period, WhatsApp connection, AI assistant settings) and as
  described in this agreement.

## Subject matter and duration

Processing covers the categories of personal data below for as long as the
business owner maintains an active Medium account, plus any retention period
configured in Settings (`accounts.retention_days`) or required by law, and
ends on account deletion (see "Erasure" below).

## Categories of data subjects

- The business owner's customers (data subjects contacted via WhatsApp or
  manually entered).
- Indirectly, the business owner themselves (account/profile data), though the
  business owner is controller, not data subject, for the purposes of this DPA.

## Categories of personal data

- Customer identity and contact data: name, phone number, WhatsApp ID.
- Appointment data: scheduling, service type, notes, cancellation reasons.
- Conversation data: WhatsApp message content and metadata.
- Free-text notes the business owner records about a customer.

No special-category (Art. 9) health data is intentionally solicited by the
product; business owners are responsible for not entering special-category
data into free text fields beyond what their own regulatory context permits.

## Processor obligations

- Process customer personal data only on the business owner's instructions
  (as expressed through product configuration), except where required by
  EU/member-state law.
- Ensure personnel with access to the system-of-record are bound by
  confidentiality.
- Implement the technical/organisational measures described in
  `docs/features/privacy-and-gdpr.md` — encryption of WhatsApp access tokens
  at rest, row-level tenant isolation (Postgres RLS), audit logging of
  customer-data reads/writes/erasures, EU-hosted system-of-record services.
- Assist the business owner in responding to data subject requests (export,
  erasure) — the product ships self-service `exportCustomer`/`exportAccount`
  and `eraseCustomer`/`deleteAccount` actions for this purpose.
- Notify the business owner without undue delay upon becoming aware of a
  personal data breach.
- Make available the subprocessor list (`docs/gdpr/subprocessors.md`) and
  notify the business owner of material subprocessor changes.
- Delete or return all customer personal data at the end of the relationship
  (account deletion cascades all customer data via database foreign keys; a
  compliance record of the erasure event itself is retained in a separate
  archive table that is not personal data — see `erasure_archive`).

## Subprocessors

See `docs/gdpr/subprocessors.md` for the current list and their processing
locations. That list is the annex to this agreement and names, in particular,
the upstream AI providers reached through OpenRouter — Anthropic (primary
inference) and OpenAI (fallback). The business owner is deemed to have
authorised the listed subprocessors as of the DPA's effective date; material
additions will be communicated in advance.

## International transfers

Where a subprocessor processes data outside the EEA (see the OpenRouter /
upstream AI note in `subprocessors.md`, which covers both Anthropic and
OpenAI), Medium relies on that subprocessor's Standard Contractual Clauses or
equivalent safeguard, and discloses this in the product's privacy policy.

## Audit rights

The business owner may request reasonable evidence of compliance with this
DPA (e.g. a summary of technical/organisational measures); a full third-party
audit program is not offered at MVP stage.

---

*This template should be reviewed by counsel before being offered as a
binding agreement to business owners, and updated if the subprocessor list,
hosting regions, or AI-provider routing change.*
