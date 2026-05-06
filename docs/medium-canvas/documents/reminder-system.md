# Reminder system

## Overview

Automated reminders reduce no-shows (currently ~20% industry average) by prompting patients to confirm or cancel in advance, giving PTs time to fill cancelled slots.

**Core requirements:**
- Send at optimal time before appointment
- Use WhatsApp template messages (required for messages outside 24h window)
- Handle responses automatically (confirm/cancel/reschedule)
- Keep PT informed of reminder status
- Track metrics (reminder sent, opened, responded, ignored)

---

## Timing

**Default: 24 hours before appointment**

Example: Appointment Tuesday 2:00 PM → Reminder sent Monday 2:00 PM

**Reasoning:**
- 24h gives PT time to fill slot if cancelled
- Not so early that patient forgets again
- Aligns with WhatsApp Business API best practices
- Matches patient expectations (industry standard)

**Future configuration options:**
- Let PT choose reminder timing (12h, 24h, 48h, or multiple reminders)
- Different timing for different appointment types
- No reminder option (patient specifically requested)

**Edge cases:**
- If appointment booked < 24h in advance: Send reminder immediately after booking confirmation
- If appointment booked < 2h in advance: No automated reminder (too late to be useful)

---

## WhatsApp template message requirements

**Why templates are required:**
- WhatsApp only allows free-form messages within 24h of patient's last message
- After 24h window closes, only pre-approved template messages can be sent
- Templates must be submitted to Meta for approval before use

**Template structure:**

WhatsApp templates have three components:
1. **Header** (optional): Text or media
2. **Body**: Main message content with variables
3. **Footer** (optional): Additional info
4. **Buttons** (optional): Quick reply buttons

**Reminder template design:**

**Name:** `appointment_reminder_24h`

**Category:** Utility (lowest cost, €0.01-0.05 per message)

**Body:**
```
Hi {{1}}, this is a reminder about your appointment with {{2}} tomorrow at {{3}}.

Please reply:
CONFIRM to confirm
CANCEL if you need to cancel
RESCHEDULE if you need a different time

Looking forward to seeing you!
```

**Variables:**
- {{1}} = Patient first name
- {{2}} = PT name
- {{3}} = Appointment time

**Footer:**
```
[PT Clinic Name] | [Address]
```

**Buttons:**
Quick reply buttons (optional, if Meta approves):
- CONFIRM
- CANCEL
- RESCHEDULE

**Notes:**
- No emojis in template (Meta may reject)
- Clear, professional language
- Include essential info: who, when, location
- Provide clear action options
- Keep under 1024 characters

**Template approval:**
- Submit programmatically via WhatsApp Business Management API
- Approval typically takes 24-48 hours
- May be rejected if: too promotional, unclear purpose, poor formatting
- Keep backup version ready if primary rejected
- Track approval status per PT in your system

---

## Response handling

**Patient replies: "CONFIRM" (or "confirmed", "yes", "ok")**

AI response:
```
Thank you for confirming! See you tomorrow at [time].

[PT Clinic Name]
[Address]
```

System action:
- Mark appointment status as "Confirmed"
- Log timestamp of confirmation
- Update PT dashboard (green status indicator)

---

**Patient replies: "CANCEL" (or "can't make it", "need to cancel")**

AI response:
```
Your appointment for tomorrow at [time] has been cancelled.

Would you like to book a different time?
```

If patient says yes:
- Show available slots (same as booking flow)
- Book new appointment
- Notify PT of cancellation and new booking

If patient says no or doesn't respond:
```
No problem. Feel free to message me when you're ready to book again.
```

System action:
- Mark appointment as "Cancelled"
- Remove from PT's calendar
- Notify PT immediately (push notification: "[Patient name] cancelled appointment for tomorrow [time]")
- Log cancellation reason if patient provided one
- Track cancellation rate metric

---

**Patient replies: "RESCHEDULE" (or "need different time", "change appointment")**

AI response:
```
No problem! Here are some available times:

- Tuesday, April 29 at 10:00 AM
- Wednesday, April 30 at 2:00 PM
- Thursday, May 1 at 3:30 PM

Which works better for you?
```

After patient selects:
```
Done! I've cancelled your appointment for tomorrow at [old time] and rebooked you for [new date] at [new time]. You'll receive a reminder the day before.
```

System action:
- Mark old appointment as "Rescheduled"
- Create new appointment
- Send confirmation to patient
- Notify PT (push notification: "[Patient name] rescheduled from tomorrow [old time] to [new date] [new time]")
- Track reschedule rate metric

---

**Patient replies with unclear message:**

Examples: "maybe", "call me", "not sure", random text

AI response:
```
I want to make sure I understand correctly. Are you confirming your appointment for tomorrow at [time], or do you need to cancel or reschedule?

Please reply: CONFIRM, CANCEL, or RESCHEDULE
```

If still unclear after 1 more exchange:
```
I'll connect you with [PT Name] to sort this out. They've been notified.
```

System action:
- Flag conversation for PT review
- Stop auto-responding
- Notification to PT with full conversation context

---

**Patient doesn't respond to reminder at all:**

System action:
- No follow-up message (don't spam patient)
- Keep appointment as-is
- Mark status as "Reminder sent, no response"
- Show in PT dashboard with orange indicator
- PT can decide whether to call patient or wait

**No response is common and normal.** Many patients see the reminder but don't reply. Don't assume no response = no-show.

---

## PT dashboard visibility

**On calendar view:**

Each appointment shows status indicator:
- 🟢 Green = Confirmed (patient replied to reminder)
- 🟡 Yellow = No reminder sent yet (appointment > 24h away)
- 🟠 Orange = Reminder sent, no response
- 🔴 Red = Cancelled or reschedule requested
- ⚪ Gray = Completed

**On appointment detail view:**

**Reminder status section:**
- "Reminder scheduled for Monday 2:00 PM"
- "Reminder sent Monday 2:00 PM"
- "Patient confirmed Monday 2:15 PM"
- "Patient cancelled Monday 2:10 PM"
- "No response to reminder"

**Timeline view (nice to have):**
- Appointment booked: Monday 1:00 PM
- Reminder sent: Tuesday 2:00 PM
- Patient confirmed: Tuesday 2:05 PM

**Notification center:**

PT receives push notifications for:
- Reminder confirmation: "[Patient] confirmed tomorrow 2pm appointment"
- Cancellation: "⚠️ [Patient] cancelled tomorrow 2pm appointment"
- Reschedule: "[Patient] rescheduled from tomorrow 2pm to Thursday 3pm"

---

## Metrics and analytics

**Track for each reminder:**
- Sent timestamp
- Delivery status (delivered, failed, read)
- Response timestamp (if any)
- Response type (confirm, cancel, reschedule, unclear, none)
- Time between reminder and response

**Aggregate metrics (future dashboard):**
- Reminder sent rate (% of appointments that got reminders)
- Response rate (% of reminders that got any response)
- Confirmation rate (% confirmed)
- Cancellation rate (% cancelled via reminder)
- Reschedule rate (% rescheduled via reminder)
- No-show rate (% of unconfirmed appointments that actually no-showed)

**Key insight to track:**
Does confirmation via reminder correlate with lower no-show rate?

Industry data suggests yes, but validate with our data.

---

## Edge cases and failure handling

**Reminder fails to send (WhatsApp API error):**
- Log error
- Retry once after 5 minutes
- If still fails, alert PT: "Couldn't send reminder to [Patient]. You may want to call them."
- Mark reminder as "Failed" in dashboard

**Patient blocked the WhatsApp number:**
- Reminder shows as delivered but not read
- Mark status as "Reminder sent, no response" (same as no reply)
- PT should follow up via phone

**Multiple appointments for same patient:**

If patient has 2+ appointments in next 48h:

Reminder message:
```
Hi [Patient], this is a reminder about your appointments with [PT Name]:

1. Tomorrow at 2:00 PM - Back therapy
2. Thursday at 10:00 AM - Follow-up

Please confirm both appointments or let me know if you need to reschedule.
```

If patient responds with single word like "CONFIRM", assume confirming all.

If patient specifies which to cancel: handle individually.

**Appointment rescheduled by PT after reminder sent:**

- Cancel scheduled reminder
- Don't send duplicate reminder
- If new appointment time is >24h away, schedule new reminder for that

**Patient replies after appointment time has passed:**

Patient: "CONFIRM" (but appointment was 2 hours ago)

AI response:
```
I see your appointment was scheduled for today at [past time]. Did you make it to the appointment? If you'd like to book a follow-up, let me know!
```

Don't shame patient for late response.

---

## GDPR and compliance

**Data retention:**
- Reminder sent/received logs: Keep for 30 days
- Patient response data: Keep while appointment is active, delete after completed
- Aggregate anonymized metrics: Keep indefinitely

**Opt-out:**
- Patient can reply "STOP" to opt out of future reminders
- Mark patient as "No reminders" in system
- AI response: "You've been removed from appointment reminders. You can still message me to book or manage appointments."
- PT sees indicator in patient profile

**Template message compliance:**
- No promotional content in reminders
- Must be appointment-specific (not generic marketing)
- Must provide opt-out option (WhatsApp handles this automatically with STOP keyword)
- Must include business identification (name, address in footer)

---

## Future enhancements

**Multiple reminder cadence:**
- 1 week before: "Heads up, you have an appointment next week"
- 24h before: Main confirmation reminder
- 2h before: Final reminder with directions

**Smart reminder timing:**
- Learn when individual patients typically respond
- Optimize send time based on patient timezone and behavior

**Reminder channels:**
- SMS backup if WhatsApp fails
- Email reminders for patients who prefer email
- Push notification via patient-facing app (future)

**Two-way calendar integration:**
- Patient confirms → auto-adds to their Google Calendar
- Patient cancels → removes from their calendar

**Reminder customization:**
- Let PT write custom reminder message per appointment
- Different messages for first-time vs returning patients
- Service-specific reminders with prep instructions

**A/B testing:**
- Test different reminder wording
- Test timing variations
- Test with/without buttons
- Measure impact on no-show rate

---

## Implementation priority

**MVP (must have):**
- ✅ Send reminder 24h before appointment
- ✅ Handle confirm/cancel/reschedule responses
- ✅ Update PT dashboard with status
- ✅ Notify PT of cancellations
- ✅ Basic metrics (sent, confirmed, cancelled)

**V2 (nice to have):**
- Quick reply buttons in template
- Timeline view in appointment detail
- Response rate analytics dashboard
- Patient-specific reminder preferences

**V3 (future):**
- Multiple reminder cadence
- Multi-channel reminders (SMS, email)
- Smart timing optimization
- A/B testing framework