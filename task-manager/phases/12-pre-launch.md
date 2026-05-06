# Phase 12 — Pre-launch

**Goal.** End-to-end smoke test passes with a real WhatsApp number, the production checklist is green, public docs are live, and one real PT successfully onboards and books a real appointment with no developer intervention during the flow.

**Source.** Tech doc §13 (MVP cut line), §14 (Setup checklist).

**Effort.** 3–5 days.

**Prerequisites.** Phases 6, 7, 8, 9, 10, 11 complete.

---

## Tasks

### Local dev loop polish

- [ ] Seed script (`pnpm seed`):
  - Test PT with email, password, profile filled in.
  - Test patient with E.164 phone.
  - Availability: Mon–Fri 9–17.
  - One past appointment, one upcoming.
  - One open conversation with last 5 messages.
- [ ] Reset script (`pnpm seed:reset`) — wipes the test PT and re-seeds.
- [ ] ngrok or Cloudflare Tunnel script: `pnpm tunnel` exposes local 3000 with a stable subdomain (free Cloudflare quick tunnel works).
- [ ] Separate Meta test app credentials in `.env.local.dev`.

### End-to-end smoke test (manual)

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

- [ ] All env vars set in Vercel production (compare with `.env.example`).
- [ ] Supabase production migrations applied; verify with `pnpm db:migrate --env production`.
- [ ] Inngest production app configured + signing key matches Vercel env.
- [ ] Meta App Review approved for `whatsapp_business_messaging` and `whatsapp_business_management`.
- [ ] Custom domain pointed to Vercel; HTTPS active; HSTS header on.
- [ ] Sentry alerts configured (error rate, webhook latency, AI error rate).
- [ ] OpenRouter key is set in production, privacy settings are reviewed, and dashboard / Activity data matches sampled requests.
- [ ] PostHog production project receiving events.
- [ ] Backup: Supabase point-in-time recovery enabled.

### Public docs

- [ ] Landing page (basic — single page is fine).
- [ ] Privacy policy (final version reflecting Phase 10 work).
- [ ] Terms of service.
- [ ] Onboarding help: 3 short pages — "Connect your WhatsApp", "Set your availability", "How the AI handles bookings".
- [ ] Contact / support email.

### Operational rehearsal

- [ ] Disconnect WhatsApp → confirm dashboard shows "Reconnect" CTA.
- [ ] Revoke the access token on Meta → channel adapter catches auth error → connection marked revoked → PT sees CTA.
- [ ] Submit a deliberately-bad template → confirm rejection flow surfaces in dashboard.
- [ ] Delete a patient → confirm cascade + audit-log entry.
- [ ] Export a patient → confirm JSON is valid + complete.
- [ ] Take an appointment 28 h out, force the reminder run early, verify it sends.

### First real-PT launch

- [ ] Identify the first real PT (already validated per `docs/medium-canvas/blobs/validation-so-far/`).
- [ ] Schedule a 30-min onboarding call (screen-share).
- [ ] Walk them through signup live; let them connect their real number.
- [ ] Send a test patient message yourself.
- [ ] Confirm: AI responds, booking is created, calendar shows it, push delivered.
- [ ] Stay on for 24 h to monitor: Sentry, logs, dashboards.
- [ ] Capture feedback verbatim; convert into a backlog of fixes / improvements.

### Post-launch support shape

- [ ] Define an SLA for the first PT: respond within 4 h business hours, 24 h otherwise.
- [ ] Pager / alert routing: Sentry email → personal phone.
- [ ] Runbook (one page) for the most likely issues:
  - Token revoked
  - Template rejected
  - Inngest function failing
  - OpenRouter outage / upstream provider rate-limit
  - Webhook signature failures
  - Realtime subscription dropping

---

## Acceptance criteria — MVP "done"

The MVP ships when **all** of the following are true:

- [ ] One real PT onboarded via Embedded Signup with a real number.
- [ ] One real patient sends a real WhatsApp message to that number.
- [ ] AI books a real appointment without developer intervention.
- [ ] PT sees the appointment in the PWA in real time.
- [ ] Reminder fires 24 h before the appointment.
- [ ] Patient confirms via CONFIRM keyword; status updates.
- [ ] No errors of severity warning-or-above in Sentry during the flow.
- [ ] Audit log shows complete trail of patient-data access.
- [ ] Cost for the conversation is within the budget envelope (~€0.10–0.30).

---

## Notes

- Don't try to launch with 3 PTs at once. One PT, two weeks of monitoring, then add the second.
- Have a rollback plan: if anything goes badly wrong, you can disconnect the PT's WhatsApp (revoke the token) and message them out-of-band.
- Keep a private journal of what broke in the first month. It will be the most valuable input for v1.1.
- The "no developer intervention" bar is real — if you have to manually fix something during the demo, that's a regression to address before declaring MVP done.
