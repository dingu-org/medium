# Phase 12 — Pre-launch

**Goal.** End-to-end smoke test passes with a real WhatsApp number, the production checklist is green, public docs are live, and one real PT successfully onboards and books a real appointment with no developer intervention during the flow.

**Source.** Tech doc §13 (MVP cut line), §14 (Setup checklist).

**Effort.** 3–5 days.

**Prerequisites.** Phases 6, 7, 8, 9, 10, 11 complete.

---

## Tasks

### Local dev loop polish

- [x] Seed script (`pnpm seed`):
  - Test PT with email, password, profile filled in.
  - Test patient with E.164 phone.
  - Availability: Mon–Fri 9–17.
  - One past appointment, one upcoming.
  - One open conversation with last 5 messages.
- [x] Reset script (`pnpm seed:reset`) — wipes the test PT and re-seeds.
- [x] ngrok or Cloudflare Tunnel script: `pnpm tunnel` exposes local 3000 with a stable subdomain (free Cloudflare quick tunnel works).
- [x] Separate Meta test app credentials in `.env.local.dev`. _(`.env.local.dev.example` template shipped, tracked; real Meta test-app creds are a manual step for whoever runs the local loop.)_

### End-to-end smoke test (manual)

_Not run yet — manual, needs real WhatsApp number; external: tracked in Notion for Klaidi._

Run on a fresh staging environment with a real WhatsApp number:

- [ ] **PT signs up** with email + password.
- [ ] Profile completed (practice name, timezone).
- [ ] Connects WhatsApp via Embedded Signup; `whatsapp_connections` shows `status = active`.
- [ ] Template `appointment_reminder_24h` submitted → wait for approval (could take 24–48 h; on production this is on PT's clock).
- [ ] Availability set: weekday hours.
- [ ] Sends a test message from a personal WhatsApp number to the PT's connected number.
- [ ] AI responds within ~10 s with a greeting.
- [ ] Patient asks for an appointment "tomorrow afternoon".
- [ ] AI calls `get_availability`, proposes a time.
- [ ] Patient confirms a time.
- [ ] AI calls `book_appointment` and confirms.
- [ ] Appointment row exists; visible in PT's calendar in real time.
- [ ] Web Push lands on PT's installed PWA.
- [ ] Reminder runs at appointment - 24 h (test with a near-term appointment; ~5 min ahead with template-bypass dev flag).
- [ ] Patient replies CONFIRM; appointment status flips; PT sees update via Realtime.
- [ ] Audit log shows entries for every patient-data access.
- [ ] Cost dashboard shows the AI spend for the test conversation.

### Production checklist

- [ ] All env vars set in Vercel production (compare with `.env.example`). — external: tracked in Notion for Klaidi.
- [ ] Supabase production migrations applied; verify with `pnpm db:migrate --env production`.
- [ ] Inngest production app configured + signing key matches Vercel env. — external: tracked in Notion for Klaidi.
- [ ] Meta App Review approved for `whatsapp_business_messaging` and `whatsapp_business_management`. — external: tracked in Notion for Klaidi.
- [ ] Custom domain pointed to Vercel; HTTPS active; HSTS header on. — external: tracked in Notion for Klaidi. (HSTS itself ships app-side now — `next.config.ts`; this item is the domain-pointing + prod HTTPS check.)
- [ ] Structured runtime logs visible in Vercel / Supabase and trace IDs survive the full webhook → Inngest → outbound path.
- [ ] OpenRouter key is set in production, privacy settings are reviewed, and dashboard / Activity data matches sampled requests. — external: tracked in Notion for Klaidi.
- [ ] Backup: Supabase point-in-time recovery enabled. — external: tracked in Notion for Klaidi.

### Public docs

- [x] Landing page (basic — single page is fine). (Albanian, server-rendered at `/` for signed-out visitors, v2 design language; see decisions log 2026-07-12.)
- [x] Privacy policy (draft route at `/privacy`, reflecting Phase 10 controller/processor, retention, AI, and subprocessors).
- [x] Terms of service (draft route at `/terms`).
- [x] Onboarding help: 3 short pages — "Connect your WhatsApp", "Set your availability", "How the AI handles bookings". (`/help` index + `/help/whatsapp`, `/help/availability`, `/help/ai-bookings`, Albanian, `lang="sq"` per article.)
- [x] Contact / support email. (Placeholder wired: `klaididingu@gmail.com`, in the (legal) footer/nav and privacy/terms pages — final support address is Klaidi's call.)

### Operational rehearsal

_Live walkthroughs not run yet — external: tracked in Notion for Klaidi. Evidence mapping is in `docs/runbook.md`'s "Operational rehearsal — existing coverage" table; the first five below already have automated-test coverage of the underlying behavior, so the live pass is a confirmation, not a first proof. Only the last one has zero automated coverage._

- [ ] Disconnect WhatsApp → confirm dashboard shows "Reconnect" CTA. _(Automated: `disconnectWhatsApp` action test.)_
- [ ] Revoke the access token on Meta → channel adapter catches auth error → connection marked revoked → PT sees CTA. _(Automated: Phase 2/5 WhatsApp client tests — `GraphApiError.isAuthError` — + `connect-whatsapp.tsx` reconnect UI.)_
- [ ] Submit a deliberately-bad template → confirm rejection flow surfaces in dashboard. _(Automated: Phase 5/6 template tests + `errorStatus('rejected')` status card.)_
- [ ] Delete a patient → confirm cascade + audit-log entry. _(Automated: Phase 10 patient-erase tests, `lib/patients/erase.ts`.)_
- [ ] Export a patient → confirm JSON is valid + complete. _(Automated: Phase 10 export tests.)_
- [ ] Take an appointment 28 h out, force the reminder run early, verify it sends. _(No automated coverage — manual step, walk by hand during the E2E smoke test.)_

### First real-PT launch

_External, gated on picking + scheduling the first real PT — tracked in Notion for Klaidi (open question also logged in `progress.md`)._

- [ ] Identify the first real PT (already validated per `docs/medium-canvas/blobs/validation-so-far/`).
- [ ] Schedule a 30-min onboarding call (screen-share).
- [ ] Walk them through signup live; let them connect their real number.
- [ ] Send a test patient message yourself.
- [ ] Confirm: AI responds, booking is created, calendar shows it, push delivered.
- [ ] Stay on for 24 h to monitor: logs, dashboards, and manual operator checks.
- [ ] Capture feedback verbatim; convert into a backlog of fixes / improvements.

### Post-launch support shape

- [x] Define an SLA for the first PT: respond within 4 h business hours, 24 h otherwise. (`docs/runbook.md` § First-PT SLA.)
- [x] Manual launch-week monitoring routine: check Vercel / Supabase logs and operator dashboards several times per day. (`docs/runbook.md` § Launch-week monitoring routine, links `docs/observability/launch-log-review.md`; actually running the routine still happens live during launch week.)
- [x] Runbook (one page) for the most likely issues: (`docs/runbook.md`, 6 incident playbooks, each symptom → where to look → remedy.)
  - Token revoked
  - Template rejected
  - Inngest function failing
  - OpenRouter outage / upstream provider rate-limit
  - Webhook signature failures
  - Realtime subscription dropping

---

## Acceptance criteria — MVP "done"

The MVP ships when **all** of the following are true:

_All nine gated on a real PT — none of these can be ticked before the first real-PT launch above happens._

- [ ] One real PT onboarded via Embedded Signup with a real number.
- [ ] One real patient sends a real WhatsApp message to that number.
- [ ] AI books a real appointment without developer intervention.
- [ ] PT sees the appointment in the PWA in real time.
- [ ] Reminder fires 24 h before the appointment.
- [ ] Patient confirms via CONFIRM keyword; status updates.
- [ ] No warning-or-above failures appear in structured runtime logs during the flow.
- [ ] Audit log shows complete trail of patient-data access.
- [ ] Cost for the conversation is within the budget envelope (~€0.10–0.30).

---

## Notes

- Don't try to launch with 3 PTs at once. One PT, two weeks of monitoring, then add the second.
- Have a rollback plan: if anything goes badly wrong, you can disconnect the PT's WhatsApp (revoke the token) and message them out-of-band.
- Keep a private journal of what broke in the first month. It will be the most valuable input for v1.1.
- The "no developer intervention" bar is real — if you have to manually fix something during the demo, that's a regression to address before declaring MVP done.
